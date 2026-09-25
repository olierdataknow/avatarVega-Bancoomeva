from azure.cosmos import exceptions, PartitionKey, CosmosClient

import logging
import os
from datetime import datetime
from typing import Optional
import uuid
import json
import logging
from typing import Any, Dict, List, Optional

from azure.core.credentials import AzureKeyCredential
from azure.search.documents.aio import SearchClient
from azure.search.documents.models import (
    QueryType,
    QueryCaptionType,
    QueryAnswerType,
    VectorizedQuery,
)
from openai import AzureOpenAI


AZURE_SEARCH_KEY, AZURE_SEARCH_INDEX_NAME, AZURE_SEARCH_ENDPOINT = os.getenv('AZURE_SEARCH_KEY'), os.getenv('AZURE_SEARCH_INDEX_NAME'), os.getenv('AZURE_SEARCH_ENDPOINT')
AZURE_EMBEDDING_ENDPOINT, AZURE_EMBEDDING_KEY, AZURE_EMBEDDING_DEPLOYMENT, AZURE_EMBEDDING_API_VERSION = os.getenv('AZURE_EMBEDDING_ENDPOINT'), os.getenv('AZURE_EMBEDDING_KEY'), os.getenv('AZURE_EMBEDDING_DEPLOYMENT'), os.getenv('AZURE_EMBEDDING_API_VERSION')

if not all([AZURE_SEARCH_KEY, AZURE_SEARCH_INDEX_NAME, AZURE_SEARCH_ENDPOINT]):
    raise RuntimeError(
        "Define AZURE_SEARCH_KEY, AZURE_SEARCH_INDEX_NAME y AZURE_SEARCH_ENDPOINT (p. ej. en un .env)"
    )


if not all([AZURE_EMBEDDING_ENDPOINT, AZURE_EMBEDDING_KEY, AZURE_EMBEDDING_DEPLOYMENT, AZURE_EMBEDDING_API_VERSION]):
    raise RuntimeError(
        "Define AZURE_EMBEDDING_ENDPOINT, AZURE_EMBEDDING_KEY, AZURE_EMBEDDING_DEPLOYMENT y AZURE_EMBEDDING_API_VERSION (p. ej. en un .env)"
    )


class AzureAISearch:
    """
    Búsqueda híbrida (texto + vector). Si proporcionas semantic_config_name,
    usa SEMANTIC; de lo contrario, usa el query simple por defecto.
    """

    def __init__(
        self,
        endpoint: str,
        api_key: str,
        *,
        embedding_function: Optional[Any] = None,
        vector_field: str = "content_vector",
        semantic_config_name: Optional[str] = None,
    ):
        self.search_endpoint = endpoint
        self.search_credential = AzureKeyCredential(api_key)
        self.embedding_function = embedding_function
        self.vector_field = vector_field
        self.semantic_config_name = semantic_config_name

    async def hybrid_search(
        self,
        query: str,
        index_name: str,
        *,
        filter_str: Optional[str] = None,
        k: int = 5,
        select: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        try:
            if not query:
                logging.error("La consulta no puede estar vacía")
                return []

            vector_query = None
            if self.embedding_function:
                embedding = self.embedding_function.embed_query(query)
                vector_query = VectorizedQuery(
                    vector=embedding,
                    k_nearest_neighbors=k,
                    fields=self.vector_field,
                )

            async with SearchClient(
                endpoint=self.search_endpoint,
                index_name=index_name,
                credential=self.search_credential,
            ) as search_client:
                kwargs = {
                    "search_text": query,
                    "vector_queries": [vector_query] if vector_query else None,
                    "filter": filter_str,
                    "top": k,
                }
                if select:
                    kwargs["select"] = select

                # Solo activar SEMANTIC si realmente existe el nombre
                if self.semantic_config_name:
                    kwargs.update(
                        dict(
                            query_type=QueryType.SEMANTIC,
                            semantic_configuration_name=self.semantic_config_name,
                            query_caption=QueryCaptionType.EXTRACTIVE,
                            query_answer=QueryAnswerType.EXTRACTIVE,
                        )
                    )

                results = await search_client.search(**kwargs)

                hits: List[Dict[str, Any]] = []
                async for r in results:
                    hits.append(dict(r))
                logging.info(
                    "azure_hybrid_search: index=%s query=%r select=%s hits=%d",
                    index_name, query, select, len(hits)
                )
                return hits

        except Exception as e:
            # Antes esto devolvía [] en silencio: el modelo veía "0 resultados" y
            # respondía de forma genérica sin que quedara rastro del error real
            # (típicamente un campo de 'select'/vector inexistente en el índice,
            # una configuración semántica que no existe, o credenciales inválidas).
            logging.exception(
                "Error en búsqueda híbrida (index=%s, vector_field=%s, semantic_config=%s, query=%r): %s",
                index_name, self.vector_field, self.semantic_config_name, query, str(e)
            )
            raise

def shape(doc, fields=None):
    out = {
        "id": doc.get("id"),
        "score": doc.get("@search.score"),
        "rerankerScore": doc.get("@search.rerankerScore"),
    }
    if doc.get("@search.captions"):
        out["caption"] = doc["@search.captions"][0].get("text")
    if doc.get("@search.answers"):
        out["answer"] = doc["@search.answers"][0].get("text")
    if fields:
        out["fields"] = {f: doc.get(f) for f in fields}
    return out



class AzureOpenAIEmbeddings:
    def __init__(self, endpoint, api_key, deployment_name, api_version="2024-10-01-preview"):
        self.client = AzureOpenAI(
            api_key=api_key,
            azure_endpoint=endpoint,
            api_version=api_version
        )
        self.deployment = deployment_name

    def embed_query(self, text: str):
        resp = self.client.embeddings.create(
            model=self.deployment,
            input=text
        )
        return resp.data[0].embedding  # list[float]; debe coincidir con las dimensiones del campo vectorial del índice (3072)

embedder = AzureOpenAIEmbeddings(
    endpoint=AZURE_EMBEDDING_ENDPOINT,
    api_key=AZURE_EMBEDDING_KEY,
    deployment_name=AZURE_EMBEDDING_DEPLOYMENT,
    api_version=AZURE_EMBEDDING_API_VERSION
)

search = AzureAISearch(
    endpoint=AZURE_SEARCH_ENDPOINT,
    api_key=AZURE_SEARCH_KEY,
    embedding_function=embedder,
    # El índice no tiene configuraciones semánticas definidas: activarlas
    # devuelve error, así que se usa el ranking por defecto.
    semantic_config_name=None,
    vector_field="content_vector",
)

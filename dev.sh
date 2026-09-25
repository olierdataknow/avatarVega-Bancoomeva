#!/bin/bash

# Nombre de la imagen
IMAGE_NAME="bancoomeva-avatar-agente:latest"

echo "🔨 Construyendo la imagen Docker..."
docker build -t $IMAGE_NAME .

if [ $? -ne 0 ]; then
  echo "❌ Error al construir la imagen. Abortando."
  exit 1
fi

echo "🚀 Ejecutando el contenedor..."
docker run --rm -it -p 8000:8000/tcp $IMAGE_NAME

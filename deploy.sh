#!/bin/bash
#Variables
ACR_NAME="acrgeneralea2v2"
IMAGE_NAME="avatar-bancoomeva"
ACR_LOGIN_SERVER="$ACR_NAME.azurecr.io"
VERSION="1.0"

# Iniciar sesión en el registro de contenedores de Azure
az acr login --name "$ACR_NAME"

# Construir la imagen Docker con tag de versión
docker build -t "$ACR_LOGIN_SERVER/$IMAGE_NAME:$VERSION" .

# Subir la imagen al ACR
docker push "$ACR_LOGIN_SERVER/$IMAGE_NAME:$VERSION"
# WebSocket_AzureRealTime

```sh
docker build -t ccb_avatar:latest .
```

```sh
docker run --rm -it -p 8000:8000/tcp --env-file .env ecopetrol_avatar:latest
```

docker build --tag acrccbavatar.azurecr.io/ccb_avatar:latest .

az acr login --name acrccbavatar

docker push acrccbavatar.azurecr.io/ccb_avatar:latest
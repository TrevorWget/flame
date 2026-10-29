docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f .docker/Dockerfile \
  -t "flame:${1:-multiarch}" \
  .

# Installation and deployment

The [quick start](../README.md#quick-start-docker-compose) covers the common case. This page has the details.

## Image

`ghcr.io/trevorwget/flame` is one image for `linux/amd64` and `linux/arm64` (e.g. a Raspberry Pi 4/5 with a 64-bit OS), built on Node 24 Alpine. It is published by the `Docker image` workflow:

| Tag | Published on |
| --- | --- |
| `latest` | every push to `master` |
| `YYYY-MM-DD` | every push to `master` (date of the build) |
| `sha-<commit>` | every push to `master` and every release tag |
| `X.Y.Z`, `X.Y`, `X` | pushing a `vX.Y.Z` git tag, e.g. by publishing a GitHub release |

Pin a version (e.g. `2.5.0`), date or `sha-` tag if you don't want every `master` build. The old upstream images (`pawelmalak/flame`, `pawelmalak/flame:multiarch`) are a different project; see [Upgrading from upstream Flame](../README.md#upgrading-from-upstream-flame).

The image has a `HEALTHCHECK` (an HTTP request to `/` every 30 seconds), so `docker ps` shows whether Flame is responding.

## `docker run`

```sh
docker run -d --name flame -p 5005:5005 \
  -v /path/to/data:/app/data \
  -e PASSWORD='<your-strong-password>' \
  ghcr.io/trevorwget/flame:latest
```

## User and permissions

The container runs as the unprivileged user `node` (uid/gid `1000:1000`), so the data directory must be writable by that user. If it is not, the container exits with a message explaining how to fix it. Pick one of:

- Give the directory to uid 1000: `sudo chown -R 1000:1000 /path/to/data`.
- Run as the user that owns the directory: `--user 1001:1001` (compose: `user: "1001:1001"`).
- Start the container as root with `--user 0:0` and set `PUID` / `PGID` (default `1000`). Flame then fixes the ownership of the data directory (only the files that need it) and joins the Docker socket's group before dropping to `PUID:PGID`. `PUID=0` runs Flame as root, with a warning.

The Docker integration needs a Docker API. With a mounted socket and a non-root user, add the socket's group: `--group-add $(stat -c %g /var/run/docker.sock)` (compose: `group_add: ["<gid>"]`). Neither the socket nor the group is needed with a [socket proxy](docker-socket-proxy.md), which is the safer option.

## Data directory

Everything Flame stores is in `/app/data`:

| Path | Contents |
| --- | --- |
| `db.sqlite` | Apps, bookmarks and categories |
| `config.json` | Settings |
| `themes.json`, `customQueries.json`, `flame.css` | User themes, custom search providers, custom CSS |
| `uploads/` | Uploaded, fetched and selfh.st icons |
| `.secret` | Generated JWT secret (when `SECRET` is unset) |
| `backups/` | Scheduled and pre-restore backups (see [Backup and restore](../README.md#backup-and-restore)) |
| `db_backups/` | Database copies taken before migrations |
| `selfhst-index.json` | Cached selfh.st icon list |

## Secrets

Any environment variable can be read from a file by appending `_FILE` to its name, e.g. `PASSWORD_FILE=/run/secrets/flame_password`, `SECRET_FILE=...` or `OIDC_CLIENT_SECRET_FILE=...`. In addition, every file in `/run/secrets` (Docker secrets) sets the variable named like the file in upper case, so a secret named `password` sets `PASSWORD`.

Order of precedence, highest first: `<NAME>_FILE`, `/run/secrets/<name>`, the plain environment variable. Surrounding whitespace and trailing newlines are trimmed. If a `_FILE` can't be read, the variable is unset and an error is logged (for `PASSWORD` that disables password login).

```yaml
services:
  flame:
    image: ghcr.io/trevorwget/flame:latest
    volumes:
      - /path/to/data:/app/data
    secrets:
      - password # sets PASSWORD
      - secret # sets SECRET (optional)
    ports:
      - 5005:5005
    restart: unless-stopped

secrets:
  password:
    file: ./secrets/password
  secret:
    file: ./secrets/secret
```

## Behind a reverse proxy

- Set `TRUST_PROXY` to the proxy's address or subnet (or `true` / a hop count when forward auth is not used). Flame then uses the real client IP for the login rate limit and marks the session cookie `Secure` when the proxy serves HTTPS. The value uses Express' ["trust proxy"](https://expressjs.com/en/guide/behind-proxies.html) syntax, e.g. `loopback, 172.16.0.0/12`.
- Enable WebSocket support on the proxy; the weather widget uses a WebSocket.
- To sign in through the proxy (Authentik, Authelia, ...), see [Authentication](authentication.md).

## Embedding Flame in another page

Flame sends a Content-Security-Policy that only allows it to be framed by itself. To embed it in another dashboard (e.g. Organizr or Home Assistant), set `FRAME_ANCESTORS` to a space-separated list of allowed CSP sources:

```yaml
environment:
  - FRAME_ANCESTORS='self' https://organizr.example.com
```

## Building the image

```sh
# current platform
docker build -t flame -f .docker/Dockerfile .

# amd64 and arm64 (needs buildx, and QEMU for the non-native platform)
docker buildx build --platform linux/amd64,linux/arm64 -f .docker/Dockerfile -t flame .
```

`.dev/build_dev.sh` and `.dev/build_multiarch.sh` run the same two commands. The build reads the version from `VITE_APP_VERSION` in `client/.env`.

## Kubernetes

`k8s/base` is a [Kustomize](https://kustomize.io/) base for the namespace `flame`:

- a Deployment of `ghcr.io/trevorwget/flame:latest` (one replica, `Recreate` updates, because SQLite can't be shared between pods), with `/app/data` on a 1 GiB `ReadWriteOnce` PersistentVolumeClaim `flame-data` and `fsGroup: 1000` so the `node` user can write to it;
- `PASSWORD` from the Secret `flame` (key `password`), generated with the placeholder `change_me`. Flame rejects that value, so login stays disabled until you replace it;
- a ClusterIP Service on port 80 and an Ingress for the placeholder host `flame.example.com`;
- the RBAC the [Kubernetes integration](integrations.md#kubernetes) needs (`get`, `list` and `watch` on `ingresses`).

Use it from an overlay that sets your password, host and, if you like, a pinned image tag:

```yaml
# my-flame/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - https://github.com/TrevorWget/flame//k8s/base?ref=master
images:
  - name: ghcr.io/trevorwget/flame
    newTag: "2.5.0"
secretGenerator:
  - name: flame
    behavior: replace
    files:
      - password=password.txt # keep this file out of version control
patches:
  - target:
      kind: Ingress
      name: flame
    patch: |-
      - op: replace
        path: /spec/rules/0/host
        value: flame.example.org
```

```sh
kubectl apply -k my-flame
```

The Secret's name gets a hash of its contents, so changing the password restarts the pod. Add your own Ingress class, TLS or storage class in the same overlay.

### Skaffold

`skaffold.yaml` builds `.docker/Dockerfile` and deploys `k8s/base`. `skaffold dev` switches to `.docker/Dockerfile.dev`, which runs the server with nodemon, and syncs changed server files into the pod instead of rebuilding; changes to the client or `package.json` rebuild the image. Images are tagged with the short commit SHA. The base's placeholder password keeps login disabled, so to sign in during development change `password=change_me` in `k8s/base/kustomization.yaml` in your working copy, and don't commit it.

## Without Docker

Flame needs Node.js 24 and a C toolchain if `sqlite3` has no prebuilt binary for your platform.

```sh
git clone https://github.com/TrevorWget/flame.git
cd flame
npm ci --omit=dev
npm ci --prefix client
npm run build --prefix client
mkdir -p public && cp -r client/dist/. public/
PASSWORD='<your-strong-password>' NODE_ENV=production node server.js
```

Flame listens on port 5005 (`PORT`) and keeps its data in `./data`. The repository's `.env` sets `NODE_ENV=development` and `VERSION`; variables from the environment take precedence over it.

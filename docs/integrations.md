# Docker and Kubernetes integrations

Flame can create apps from Docker container labels and Kubernetes Ingress annotations. Both are off by default and are turned on in **Settings > Docker** (**Use Docker API**, **Use Kubernetes Ingress API**).

## Docker labels

```yaml
labels:
  - flame.type=application # "app" works too; required
  - flame.name=My app # required
  - flame.url=http://my-app.lan:8080 # required unless a Traefik rule provides it
  - flame.url.external=https://my-app.example.com # optional external URL
  - flame.category=My category # optional, default "Docker"
  - flame.icon=icon-name # optional, default "docker"
  - flame.order=1 # optional, default 500; lower comes first
```

| Label | Description |
| --- | --- |
| `flame.type` | Must start with `app` (`application`, `app`). Other values are ignored. |
| `flame.name` | App name. Apps are matched by name, so an existing app with the same name is taken over by the integration. |
| `flame.url` | Internal URL. Without it, Flame uses the host names of a Traefik router rule (`traefik.http.routers.<name>.rule=Host(...)` for Traefik 2+ as `http://`, or a Traefik 1 `frontend.rule` as `https://`). |
| `flame.url.external` | Optional external URL. Without the label, an external URL set in the UI is kept. |
| `flame.category` | App category, matched by name (case-insensitive) and created if it doesn't exist. |
| `flame.icon` | An [MDI](https://pictogrammers.com/library/mdi/) icon name or an icon URL. If the label is missing or `custom`, an icon you set in the UI is kept. |
| `flame.order` | Sort position when the sorting type is "Custom order". |

**Several apps per container:** separate values with `;`. Missing names and URLs fall back to the first value; missing icons, categories and orders to the defaults.

```yaml
labels:
  - flame.type=application
  - flame.name=First app;Second app
  - flame.url=https://first.example.com;https://second.example.com
  - flame.icon=icon-name1;icon-name2
```

**Internal and external URLs:** which URL is shown and opened is chosen per app (**Open with** in the app form) and defaults to the internal URL. If the chosen URL is empty, the other one is used.

**URL schemes:** URLs from labels, annotations or the UI may only use `http`, `https`, `ftp`, `ftps`, `sftp`, `ssh`, `smb`, `steam`, `mailto`, `tel`, `rdp` or `vnc`. More schemes can be allowed in **Settings > General > Additional URL schemes**. `javascript:`, `vbscript:`, `data:`, `blob:` and `filesystem:` are always rejected. Apps with a disallowed URL are skipped and logged.

### Sync behaviour

- Flame syncs every 30 seconds, and within about a second of a container starting, stopping, pausing or being removed (via the Docker events API).
- Synced apps are pinned on every sync.
- With **Unpin stopped containers / removed ingresses**, apps whose container or ingress is gone are unpinned. Apps added in the UI are never unpinned, and nothing is deleted.
- Only running containers are imported.

### Connecting to Docker

**Settings > Docker > Docker host** accepts:

| Value | Connection |
| --- | --- |
| `localhost` (the default) or `unix:///var/run/docker.sock` | Local socket mounted into the container. `localhost` with any port also means the default socket. |
| `unix:///path/to/docker.sock` | Socket at another path |
| `tcp://socket-proxy:2375`, `http://host:2375`, or `host:2375` | Plain HTTP, e.g. to a [socket proxy](docker-socket-proxy.md) on a private Docker network |
| `https://host:2376` | TLS. `tcp://` also uses TLS when `DOCKER_TLS_VERIFY` is set (to anything but `0`) or `DOCKER_CERT_PATH` is set. The default port is 2376 with TLS, 2375 without. |
| `npipe:////./pipe/docker_engine` | Docker Desktop named pipe (Flame running on Windows) |

Other values are rejected when saving. Requests time out after 10 seconds and don't follow redirects.

Prefer the [read-only socket proxy](docker-socket-proxy.md) over mounting the socket: Flame only needs `GET /containers/json` and `GET /events`, and anyone who can reach the Docker API has root on the host.

### Remote Docker hosts

Never start `dockerd` with `-H tcp://0.0.0.0:2375`; that gives unauthenticated root access to anyone who can reach the port. Either run the socket proxy on that host, reachable only from Flame's network, or [protect the daemon with TLS](https://docs.docker.com/engine/security/protect-access/) and give Flame a client certificate. Mount `ca.pem`, `cert.pem` and `key.pem` and point `DOCKER_CERT_PATH` at them:

```yaml
volumes:
  - /path/to/docker-certs:/certs:ro
environment:
  - DOCKER_CERT_PATH=/certs
```

The daemon's certificate is always verified: against `ca.pem` when it exists, otherwise against the system CAs. `cert.pem` and `key.pem` must be present together. Without `DOCKER_CERT_PATH`, the files are read from `~/.docker` of the user Flame runs as.

## Kubernetes

Flame reads Ingresses (`networking.k8s.io/v1`) in all namespaces. Gateway API routes (`HTTPRoute`) are not supported.

```yaml
metadata:
  annotations:
    flame.pawelmalak/type: application # "app" works too
    flame.pawelmalak/name: My app
    flame.pawelmalak/url: https://my-app.example.com
    flame.pawelmalak/url.external: https://my-app.example.org # optional
    flame.pawelmalak/category: My category # optional, default "Kubernetes"
    flame.pawelmalak/icon: icon-name # optional, default "kubernetes"
    flame.pawelmalak/order: "1" # optional, default 500
```

The annotations work like the Docker labels, including `;` for several apps; `url` is required (there is no Traefik fallback). The `flame.pawelmalak/` prefix is kept from upstream so existing Ingresses keep working.

Flame uses the pod's service account by default; it needs `list` on `ingresses` cluster-wide (see `k8s/base/rbac.yaml`). Set `KUBECONFIG` to use a kubeconfig file instead, e.g. when Flame runs outside the cluster. Ingresses are synced every 30 seconds.

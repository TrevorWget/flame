# Read-only Docker socket proxy

Flame only makes two Docker API calls: `GET /containers/json` (to find labelled containers and, for status indicators, container states) and `GET /events` (to notice containers starting and stopping). Whoever can reach the Docker API or socket has root on the host, and mounting the socket `:ro` does not make the API read-only. So instead of giving Flame the socket, run a proxy that answers only those two calls.

This setup uses [Tecnativa's docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) with a custom HAProxy template. The image's own `CONTAINERS=1` flag would allow **every** `GET /containers/*` path, including inspect (other containers' environment variables and secrets), logs and file downloads, so the template replaces its allow-list with the two exact paths.

## Compose file

```yaml
services:
  flame:
    image: ghcr.io/trevorwget/flame:latest
    restart: unless-stopped
    depends_on:
      - socket-proxy
    ports:
      - 5005:5005
    volumes:
      - /path/to/data:/app/data # no docker.sock, no group_add
    environment:
      - PASSWORD=<your-strong-password>
    networks:
      - default
      - socket

  socket-proxy:
    image: ghcr.io/tecnativa/docker-socket-proxy:0.3.0 # pin a digest if you can
    restart: unless-stopped
    environment: # the template below is authoritative; these match it if it is ever removed
      - CONTAINERS=1
      - EVENTS=1
      - POST=0
      - PING=0
      - VERSION=0
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./socket-proxy/haproxy.cfg.template:/usr/local/etc/haproxy/haproxy.cfg.template:ro
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    networks:
      - socket # no ports, not on any other network

networks:
  socket:
    internal: true # only Flame and the proxy
```

Then set **Settings > Docker > Docker host** to `tcp://socket-proxy:2375` and turn on **Use Docker API**.

If the proxy exits right away on your system, remove `cap_drop: [ALL]`.

## `socket-proxy/haproxy.cfg.template`

This is the image's own template with the frontend reduced to the two calls Flame makes. The image's entrypoint still fills in `${BIND_CONFIG}`, `${LOG_LEVEL}` and `$SOCKET_PATH`.

```haproxy
global
    log stdout format raw daemon "${LOG_LEVEL}"
    pidfile /run/haproxy.pid
    maxconn 4000
    server-state-file /var/lib/haproxy/server-state

defaults
    mode http
    log global
    option httplog
    option dontlognull
    option http-server-close
    option redispatch
    retries 3
    timeout http-request 10s
    timeout queue 1m
    timeout connect 10s
    timeout client 10m
    timeout server 10m
    timeout http-keep-alive 10s
    timeout check 10s
    maxconn 3000
    load-server-state-from-file global
    errorfile 400 /usr/local/etc/haproxy/errors/400.http
    errorfile 403 /usr/local/etc/haproxy/errors/403.http
    errorfile 408 /usr/local/etc/haproxy/errors/408.http
    errorfile 500 /usr/local/etc/haproxy/errors/500.http
    errorfile 502 /usr/local/etc/haproxy/errors/502.http
    errorfile 503 /usr/local/etc/haproxy/errors/503.http
    errorfile 504 /usr/local/etc/haproxy/errors/504.http

backend dockerbackend
    server dockersocket $SOCKET_PATH

backend docker-events
    server dockersocket $SOCKET_PATH
    timeout server 0

# Flame only lists containers and follows container events. Nothing else, read-only.
frontend dockerfrontend
    bind ${BIND_CONFIG}
    http-request deny unless METH_GET
    http-request allow if { path,url_dec -m reg -i ^(/v[\d\.]+)?/containers/json$ }
    http-request allow if { path,url_dec -m reg -i ^(/v[\d\.]+)?/events$ }
    http-request deny
    use_backend docker-events if { path,url_dec -m reg -i ^(/v[\d\.]+)?/events$ }
    default_backend dockerbackend
```

HAProxy warns about missing timeouts for the `docker-events` backend; that comes from `timeout server 0`, which keeps the events stream open, and is expected. If the stream drops, Flame logs a warning and falls back to its 30-second sync.

## Checking it

From inside the Flame container, the first three requests should return `200` and the rest `403`:

```sh
for path in /containers/json /v1.47/containers/json '/events?since=1&until=2' /info /version /_ping /images/json /containers/<name>/json /containers/<name>/logs; do
  printf '%-28s ' "$path"
  docker exec flame sh -c "wget -S -q -O /dev/null 'http://socket-proxy:2375$path' 2>&1 | grep -m1 HTTP/ || echo 'no response'"
done
```

Use the name of your Flame container in `docker exec` and any container name for `<name>`.

# Flame

![Homescreen screenshot](.github/home.png)

## Important note
If you encounter any problem, you can open an Issue in this fork so I can look into it. 

Since this is a fork aimed at adding app categories only, no new features will be added, but bugs will be fixed if I can reproduce them on my setup. If my setup does not allow me to reproduce bugs reported (such as the ones involving Kubernetes, which I don't use), I will ask the person who opened the issue to test a bugfix build before publishing the fix.

## Description

Flame is self-hosted startpage for your server. Its design is inspired (heavily) by [SUI](https://github.com/jeroenpardon/sui). Flame is very easy to setup and use. With built-in editors, it allows you to setup your very own application hub in no time - no file editing necessary.

## Functionality
- 📝 Create, update, delete your applications and bookmarks directly from the app using built-in GUI editors
- 📌 Pin your favourite items to the homescreen for quick and easy access
- 🔍 Integrated search bar with local filtering, 11 web search providers and ability to add your own
- 🔑 Authentication system to protect your settings, apps and bookmarks, with optional single sign-on (OIDC or a forward-auth header from your reverse proxy)
- 🔨 Dozens of options to customize Flame interface to your needs, including support for custom CSS, 15 built-in color themes and custom theme builder
- ☀️ Weather widget with current temperature, cloud coverage and animated weather status
- 🐳 Docker integration to automatically pick and add apps based on their labels
- 💾 Backup and restore from the settings, with optional scheduled backups

## Installation

### With Docker (recommended)

```sh
# one image for amd64 and arm64 (e.g. Raspberry Pi 4/5 with a 64-bit OS)
docker pull ghcr.io/trevorwget/flame:latest

# pinning a build: date of the master build, or the commit
docker pull ghcr.io/trevorwget/flame:2026-10-28
docker pull ghcr.io/trevorwget/flame:sha-<commit>
```

#### Deployment

```sh
# run container
docker run -p 5005:5005 -v /path/to/data:/app/data -e PASSWORD='<your-strong-password>' ghcr.io/trevorwget/flame:latest
```

##### User and permissions

The container runs as the unprivileged user `node` (uid/gid `1000:1000`), so the data directory must be writable by that user. If it is not, the container exits with a message explaining how to fix it. Pick one of:

- Give the directory to uid 1000: `sudo chown -R 1000:1000 /path/to/data`. Data directories from the old `multiarch` images are already owned by uid 1000.
- Run as the user that owns the directory: `--user 1001:1001` (compose: `user: "1001:1001"`).
- Start the container as root with `--user 0:0` and set `PUID` / `PGID` (default `1000`). Flame then fixes ownership of the data directory (only the files that need it) and joins the Docker socket's group before dropping to `PUID:PGID`.

The Docker integration needs access to `/var/run/docker.sock`. When running as non-root, add the socket's group to the container: `--group-add $(stat -c %g /var/run/docker.sock)` (compose: `group_add: ["<gid>"]`). Neither is needed when Flame connects through a socket proxy (see [Connecting to Docker](#connecting-to-docker)).

The image has a `HEALTHCHECK`, so `docker ps` shows whether Flame is responding.

`PASSWORD` is required. If it is missing or set to one of the old example values (`flame_password`, `change_me`, ...), Flame still serves the dashboard but login is disabled and an error is logged at startup.

Login attempts are rate limited per client IP. If Flame runs behind a reverse proxy, set `TRUST_PROXY` so the real client IP is used: `true` (trust all proxies), a hop count such as `1`, or a list of trusted addresses/subnets such as `loopback, 172.16.0.0/12` (see [Express "trust proxy"](https://expressjs.com/en/guide/behind-proxies.html)). `TRUST_PROXY` also lets Flame see that the proxy serves HTTPS, so the session cookie is marked `Secure`. To sign in through Authentik or another identity provider, see [Single sign-on](#single-sign-on-authentik-authelia-keycloak-).

Leave `SECRET` unset to have a random JWT secret generated in `data/.secret`. Flame refuses to start if `SECRET` is set to the value that was committed to this repository before v2.4.0.

##### Upgrading from upstream Flame

The data directory of [pawelmalak/flame](https://github.com/pawelmalak/flame) (v2.4.0 and older) can be used as is. Upstream has no app categories, so on the first start Flame moves every app that isn't in an app category into one of two new app categories, keeping what the home page showed before:

- **Applications** (pinned): apps that were pinned to the home page
- **Other apps** (not pinned): the remaining apps, shown on the Applications page only

Existing categories become bookmark categories. Nothing is deleted, and you can rename the new categories or move apps afterwards. Before running migrations, Flame copies the database to `data/db_backups/db-<version>-<timestamp>-backup.sqlite`; if that copy fails, Flame exits without migrating.

#### Building images

```sh
# build image for the current platform
docker build -t flame -f .docker/Dockerfile .

# build for amd64 and arm64 (needs buildx; QEMU for the non-native platform)
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f .docker/Dockerfile \
  -t flame .
```

Images are published to `ghcr.io/trevorwget/flame` by the `Docker image` GitHub Actions workflow on every push to `master` (`latest`, date and `sha-` tags) and on `v*.*.*` tags (semver tags).

#### Docker-Compose

```yaml
services:
  flame:
    image: ghcr.io/trevorwget/flame:latest
    container_name: flame
    volumes:
      - /path/to/host/data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock # optional but required for Docker integration
    group_add:
      - "999" # group id of the Docker socket: stat -c %g /var/run/docker.sock
    ports:
      - 5005:5005
    secrets:
      - password # optional but required for (1)
    environment:
      - PASSWORD=<your-strong-password>
      - PASSWORD_FILE=/run/secrets/password # optional but required for (1)
    restart: unless-stopped

# optional but required for Docker secrets (1)
secrets:
  password:
    file: /path/to/secrets/password
```

##### Embedding Flame in another page

Flame sends a Content-Security-Policy that only allows it to be framed by itself. To embed it in another dashboard (e.g. Organizr or Home Assistant), set `FRAME_ANCESTORS` to a space-separated list of allowed origins:

```yaml
environment:
  - FRAME_ANCESTORS='self' https://organizr.example.com
```

##### Docker Secrets

Every file in `/run/secrets` overrides the environment variable of the same name in upper case, so a secret named `password` sets `PASSWORD` and one named `secret` sets `SECRET`. Any environment variable can also be read from a file by appending `_FILE` to its name, e.g. `PASSWORD_FILE=/run/secrets/flame_password` or `SECRET_FILE=/run/secrets/flame_secret`. `_FILE` takes precedence over both the plain variable and `/run/secrets`. Surrounding whitespace and trailing newlines are trimmed. If a `_FILE` can't be read, the variable is unset and an error is logged (for `PASSWORD` this disables login).

```bash
# ./secrets/flame_password
my_custom_secret_password_123

# ./docker-compose.yml
secrets:
  password:
    file: ./secrets/flame_password
```

#### Skaffold

```sh
# use skaffold
skaffold dev
```

### Without Docker

Follow instructions from wiki: [Installation without Docker](https://github.com/pawelmalak/flame/wiki/Installation-without-docker)

## Development

### Technology

- Backend
  - Node.js + Express
  - Sequelize ORM + SQLite
- Frontend
  - React
  - Redux
  - TypeScript
  - Vite (dev server and build), Vitest (tests)
- Deployment
  - Docker
  - Kubernetes

### Creating dev environment

```sh
# clone repository
git clone https://github.com/pawelmalak/flame
cd flame

# run only once
npm run dev-init

# start backend and frontend development servers
npm run dev
```

The backend listens on port 5005 and the Vite dev server on [http://localhost:3000](http://localhost:3000), proxying `/api`, `/uploads` and the `/socket` WebSocket to the backend. Set `FLAME_SERVER_URL` to proxy to a backend elsewhere, e.g. `FLAME_SERVER_URL=http://localhost:5160 npm run dev --prefix client -- --port 3160`.

Client checks, run from `client/`:

```sh
npm run lint
npm run typecheck
npm test        # Vitest
npm run build   # production bundle in client/dist
```

The app version shown in Settings comes from `VITE_APP_VERSION` in `client/.env`; the Docker image also derives the server's `VERSION` from it.

## Screenshots

![Apps screenshot](.github/apps.png)

![Bookmarks screenshot](.github/bookmarks.png)

![Settings screenshot](.github/settings.png)

![Themes screenshot](.github/themes.png)

## Usage

### Authentication

Visit [project wiki](https://github.com/pawelmalak/flame/wiki/Authentication) to read more about authentication

The session is stored in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` over HTTPS). **Settings > App** has a "Log out all sessions" button that signs out every browser and device, e.g. after losing a device.

Browsers send cookies to every port of a host, so other web apps served from the same hostname as Flame (e.g. `http://server:8080` next to `http://server:5005`) receive Flame's session cookie. Give Flame its own hostname if you don't trust the other services on that host.

API clients can log in with `POST /api/auth` and keep the returned `flame_token` cookie, or send its value as `Authorization-Flame: Bearer <token>`. Login (`POST /api/auth`) and logout (`POST /api/auth/logout`) always need an `X-Flame-CSRF: 1` header; other requests that change data need it when they are authenticated by the cookie.

#### Single sign-on (Authentik, Authelia, Keycloak, ...)

Besides the password, Flame can sign you in through an identity provider in two ways. Both are off by default and can be combined with each other and with the password.

- **Forward-auth header**: your reverse proxy already authenticates every request (e.g. Nginx Proxy Manager + Authentik forward auth) and passes the user name in a header. Flame trusts that header, so there is no second login.
- **OIDC**: Flame shows a "Log in with ..." button and uses the OpenID Connect authorization code flow with PKCE. Use this when Flame isn't behind forward auth, or when only the settings should need a login.

`PASSWORD` can be left unset when SSO is configured; password login is then disabled and only SSO works.

##### Forward-auth header

| Variable | Description |
| --- | --- |
| `AUTH_PROXY_HEADER` | Header that carries the authenticated user name, e.g. `X-authentik-username` (Authentik) or `Remote-User` (Authelia). Unset disables forward-auth login. |
| `TRUST_PROXY` | **Required.** The proxy's IP address(es) or subnet(s), e.g. `172.18.0.5`. The header is only accepted when the TCP connection comes directly from one of them. `true` and hop counts are refused for forward auth because they trust every client. |
| `AUTH_PROXY_LOGOUT_URL` | Optional. Where Flame's Logout button sends you to end the proxy session, e.g. `/outpost.goauthentik.io/sign_out`. Without it, proxy sessions have no Logout button, because Flame can't end them. |

Requests carrying the header from any other address are ignored and logged, so a client can't simply send `X-authentik-username: admin` itself. To keep it that way:

- The proxy must **replace** the header on every request it forwards (nginx's `proxy_set_header` does), so clients can't pass their own value through it.
- Only the proxy may be able to reach Flame from a trusted address. Don't publish Flame's port (drop `ports:` and reach it through the proxy only), and prefer the proxy container's fixed IP over a whole Docker subnet: connections through a published port can appear to come from the Docker network's gateway (e.g. `172.18.0.1`), which is inside `172.18.0.0/16`.

The proxy authenticates each request, so the header acts like the session cookie: requests that change data still need the `X-Flame-CSRF` header, and there is no session expiry on Flame's side.

##### OIDC

| Variable | Description |
| --- | --- |
| `OIDC_DISCOVERY_URL` | The provider's `.well-known/openid-configuration` URL (or its issuer URL). Must be the public URL your browser uses. |
| `OIDC_CLIENT_ID` | Client ID. |
| `OIDC_CLIENT_SECRET` | Client secret (or `OIDC_CLIENT_SECRET_FILE`, see [Docker Secrets](#docker-secrets)). Leave unset for public clients. |
| `OIDC_REDIRECT_URI` | Recommended. `https://<your-flame-host>/api/auth/oidc/callback`; register exactly this URL with the provider. Defaults to the URL the request came in on. |
| `OIDC_ALLOWED_GROUPS` | Optional comma-separated list. Only users in at least one of these groups can log in. |
| `OIDC_GROUPS_CLAIM` | Claim with the user's groups, default `groups`. Read from the ID token, or from userinfo when it isn't there. |
| `OIDC_USERNAME_CLAIM` | Claim shown as the user name, default `preferred_username` (falls back to `email`, then `sub`). |
| `OIDC_SCOPES` | Default `openid profile email`. |
| `OIDC_PROVIDER_NAME` | Button label: "Log in with `<name>`", default `SSO`. |
| `OIDC_ALLOW_INSECURE_HTTP` | `true` allows plain-HTTP provider and redirect URLs. Only for testing. |

A successful login gives you the usual `flame_token` session cookie, for the duration chosen in the login form, so "Log out all sessions" covers OIDC sessions too. Changing the provider, client ID or allowed groups ends existing OIDC sessions. Flame's Logout ends the Flame session only, not the provider's. If something goes wrong, the login page shows a short message and the details are in Flame's log.

##### Authentik

Forward auth with Nginx Proxy Manager (no second login):

1. In Authentik, go to **Applications > Applications > Create with provider**. Pick **Proxy Provider** in **Forward auth (single application)** mode, with the external host `https://flame.example.com`. Restrict access under the application's **Policy / Group / User Bindings**.
2. Under **Applications > Outposts**, add the application to the **authentik Embedded Outpost**.
3. In Nginx Proxy Manager, open the `flame.example.com` proxy host and follow the **Nginx Proxy Manager** tab of Authentik's [nginx guide](https://docs.goauthentik.io/add-secure-apps/providers/proxy/server_nginx/). The `/outpost.goauthentik.io` location goes in the **Advanced** tab, pointing at your Authentik server. The `auth_request` directives go on a `/` **Custom Location** that forwards to Flame. Keep these lines, which pass the user name and overwrite any value the client sent:

   ```nginx
   auth_request_set $authentik_username $upstream_http_x_authentik_username;
   proxy_set_header X-authentik-username $authentik_username;
   ```

   Enable **Websockets Support**; Flame's weather widget uses a WebSocket.
4. Configure Flame. `172.18.0.5` stands for NPM's address on the network it shares with Flame (`docker network inspect <network>`; give NPM a fixed `ipv4_address` so it can't change):

   ```yaml
   environment:
     - AUTH_PROXY_HEADER=X-authentik-username
     - TRUST_PROXY=172.18.0.5
     - AUTH_PROXY_LOGOUT_URL=/outpost.goauthentik.io/sign_out
   ```

   On startup Flame logs `Forward-auth login enabled: trusting the X-authentik-username header from 172.18.0.5`. If it logs `Ignoring X-authentik-username header from <address>`, add that address to `TRUST_PROXY` after checking that it really is the proxy.

OIDC:

1. In Authentik, go to **Applications > Applications > Create with provider** and pick **OAuth2/OpenID Provider**. Client type **Confidential**. Add the strict redirect URI `https://flame.example.com/api/auth/oidc/callback` and select a signing key (e.g. the self-signed certificate).
2. Copy the **Client ID**, the **Client Secret** and, from the provider's overview page, the **OpenID Configuration URL**.
3. Configure Flame:

   ```yaml
   environment:
     - OIDC_DISCOVERY_URL=https://auth.example.com/application/o/flame/.well-known/openid-configuration
     - OIDC_CLIENT_ID=<client id>
     - OIDC_CLIENT_SECRET_FILE=/run/secrets/flame_oidc_client_secret
     - OIDC_REDIRECT_URI=https://flame.example.com/api/auth/oidc/callback
     - OIDC_PROVIDER_NAME=Authentik
     - OIDC_ALLOWED_GROUPS=Flame Admins # optional; Authentik sends group names in the `groups` claim
     - TRUST_PROXY=172.18.0.5 # so Flame sees HTTPS and marks cookies Secure
   ```

   Flame must be able to reach `auth.example.com` itself. Use the public URL, not an internal one such as `http://authentik-server:9000`, because the issuer and endpoints in the discovery document have to match what the browser uses.

### Search bar

#### Searching

The default search setting is to search through all your apps and bookmarks. If you want to search using specific search engine, you need to type your search query with selected prefix. For example, to search for "what is docker" using google search you would type: `/g what is docker`.

For list of supported search engines, shortcuts and more about searching functionality visit [project wiki](https://github.com/pawelmalak/flame/wiki/Search-bar).

### Setting up weather module

1. Choose a weather provider in Settings > Weather:
   - [Open-Meteo](https://open-meteo.com/) needs no API key (free for non-commercial use).
   - [Weather API](https://www.weatherapi.com/pricing.aspx) needs an API key.
     > Free plan allows for 1M calls per month. Flame is making less then 3K API calls per month.
2. Get lat/long for your location. You can get them from [latlong.net](https://www.latlong.net/convert-address-to-lat-long.html).
3. Enter and save data. Weather widget will now update and should be visible on Home page. Weather refreshes every 15 minutes; saving a key or switching provider takes effect without a restart.

### Fetching icons

Next to the icon field of the app and bookmark forms, **Fetch icon from site** asks the Flame server to download the site's icon: the best `<link rel="icon">` / `apple-touch-icon` on the page (the smallest one that is at least 48px, then SVG, then the largest small one), falling back to `/favicon.ico`. If the icon field holds an image URL, that image is downloaded instead. The icon is stored in `data/uploads` as `favicon-<hash>.<ext>` and used like an uploaded icon, so it keeps working when the site is down or blocks hotlinking. MDI icons, icon URLs and uploads work as before.

**Settings > General > Icons**:

- **Fetch icons for apps and bookmarks saved without one** (off by default): saving an app or bookmark with an empty icon field and an http(s) URL fetches its icon. Saving waits for up to 5 seconds and keeps the item without an icon if none is found.
- **Allow fetching icons from private network addresses** (off by default): the server refuses to fetch from loopback, private (`10.x`, `172.16-31.x`, `192.168.x`, `100.64.x`), link-local (`169.254.x`, `fe80::`) and unique-local IPv6 addresses unless this is on, so turn it on for self-hosted apps such as `http://server.local:8096`. Self-signed certificates are accepted from those addresses. Multicast, `0.0.0.0` and similar addresses are always refused.
- **Prefer selfh.st icons when fetching icons** (off by default): when icons are fetched automatically, the [selfh.st](https://selfh.st/icons) icon whose name matches the app or bookmark name ("Home Assistant" finds `home-assistant`) is used first, as SVG when there is one, otherwise WebP. Items without a match get the site's favicon as before. This also works for non-web URLs such as `steam://`.

Only `http` and `https` URLs are fetched; every redirect is checked again, downloads are limited to 1 MB and 10 seconds, and only PNG, JPEG, ICO, WebP and (sanitized) SVG files are kept. Hostnames are resolved by the Flame server, so `.local` (mDNS) names only work if the server or container can resolve them; use an IP address otherwise.

### selfh.st icons

**Browse selfh.st icons**, under the icon field of the app and bookmark forms, searches the [selfh.st icon collection](https://selfh.st/icons) (about 3,000 logos of self-hosted and other apps) by name and tag. Pick an icon, then its colours (standard, light for dark themes, or dark for light themes, when the icon has them) and format (SVG, WebP or PNG), and click **Use this icon**. While the icon field is empty, the form also suggests the icon whose name matches the app name.

The Flame server does all the downloading, from public addresses only and with the same limits and checks as fetched favicons, so the browser never loads anything from the CDN:

- The icon list (`index.json` from the [selfhst/icons](https://github.com/selfhst/icons) repository, via jsDelivr, with GitHub as a fallback) is cached in `data/selfhst-index.json` and refreshed in the background once a day. If it can't be refreshed, the saved list keeps working, so search works offline once the list has been downloaded.
- Picked icons are stored in `data/uploads` as `selfhst-<name>.<ext>` (`selfhst-<name>_light.<ext>` or `selfhst-<name>_dark.<ext>` for the light and dark versions), so they are included in backups and keep working offline. Picking a stored icon again reuses the file; after 30 days it is downloaded again, and the old copy is kept if that fails.

The icons are by [selfh.st](https://selfh.st/icons) and licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); SVG files are sanitized when stored, which can change their markup. The logos are trademarks of their owners, used only to identify their apps. The credit is shown in the picker and in Settings > App.

### Docker integration

In order to use the Docker integration, each container must have the following labels:

```yml
labels:
  - flame.type=application # "app" works too
  - flame.name=My container
  - flame.url=https://example.com
  - flame.url.external=https://example.org # Optional external URL
  - flame.category=My category # Optional, default is "Docker"
  - flame.icon=icon-name # Optional, default is "docker"
  - flame.order=1 # Optional, default is 500; lower number is first in the list
```

> "Use Docker API" option must be enabled for this to work. You can find it in Settings > Docker

Flame picks up containers when they start or stop (via the Docker events API) and re-checks every 30 seconds. With "Unpin stopped containers / removed ingresses" enabled, apps whose container or ingress is gone are unpinned; apps added in the UI are never unpinned. Use `flame.icon=custom` to keep an icon you set in the UI.

`flame.url` is the app's internal URL and `flame.url.external` its optional external URL. Which one is shown and opened is chosen per app in the app's settings ("Open with"), and defaults to the internal URL; if the chosen URL is empty, the other one is used. Without `flame.url.external`, an external URL set in the UI is kept.

> URLs (from labels, Kubernetes annotations or the UI) may only use `http`, `https`, `ftp`, `ftps`, `sftp`, `ssh`, `smb`, `steam`, `mailto`, `tel`, `rdp` or `vnc`. Other schemes can be allowed in Settings > General > Additional URL schemes; apps with any other scheme are skipped. `javascript:`, `data:`, `vbscript:` and `blob:` URLs are always rejected.

You can also set up different apps in the same label adding `;` between each one.

```yml
labels:
  - flame.type=application
  - flame.name=First App;Second App
  - flame.url=https://example1.com;https://example2.com
  - flame.icon=icon-name1;icon-name2
```

#### Connecting to Docker

Set Settings > Docker > Docker host to one of:

| Value | Connection |
| --- | --- |
| `unix:///var/run/docker.sock` (or `localhost`, the default) | Local socket mounted into the container |
| `tcp://socket-proxy:2375` / `http://host:2375` | Plain HTTP, e.g. to a socket proxy on a private Docker network |
| `https://host:2376` | TLS; `tcp://` also uses TLS when `DOCKER_TLS_VERIFY=1` or `DOCKER_CERT_PATH` is set |
| `npipe:////./pipe/docker_engine` | Docker Desktop named pipe (Flame running on Windows) |

Flame only reads `GET /containers/json` and `GET /events`, but whoever can reach the Docker API (or socket) has root on the host. Mounting the socket `:ro` does not make the API read-only. Prefer a socket proxy that only allows those calls, for example [tecnativa/docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy):

```yaml
services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy
    environment:
      - CONTAINERS=1 # GET /containers/*; POST and everything else stay denied
      - EVENTS=1
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    restart: unless-stopped
    # no ports: only reachable from this compose network

  flame:
    # ... as above, without the docker.sock volume and group_add
    depends_on:
      - socket-proxy
```

and set the Docker host to `tcp://socket-proxy:2375`.

For a remote Docker host, never start `dockerd` with `-H tcp://0.0.0.0:2375`: that gives unauthenticated root access to anyone who can reach the port. Either run a socket proxy on that host, reachable only from Flame's network, or [protect the daemon with TLS](https://docs.docker.com/engine/security/protect-access/) and give Flame a client certificate. Mount the `ca.pem`, `cert.pem` and `key.pem` files and point `DOCKER_CERT_PATH` at them:

```yaml
    volumes:
      - /path/to/docker-certs:/certs:ro
    environment:
      - DOCKER_CERT_PATH=/certs
```

The daemon's certificate is always verified against `ca.pem`.

### Kubernetes integration

In order to use the Kubernetes integration, each ingress must have the following annotations:

```yml
metadata:
  annotations:
  - flame.pawelmalak/type=application # "app" works too
  - flame.pawelmalak/name=My container
  - flame.pawelmalak/url=https://example.com
  - flame.pawelmalak/url.external=https://example.org # Optional external URL
  - flame.pawelmalak/category=My category # Optional, default is "Kubernetes"
  - flame.pawelmalak/icon=icon-name # Optional, default is "kubernetes"
  - flame.pawelmalak/order=1 # Optional, default is 500; lower number is first in the list
```

> "Use Kubernetes Ingress API" option must be enabled for this to work. You can find it in Settings > Docker

Like Docker labels, annotations can describe several apps separated by `;`, and `url.external` works like `flame.url.external`. Flame uses the pod's service account by default (it needs `list` on `ingresses`, see `k8s/base/rbac.yaml`); set `KUBECONFIG` to use a kubeconfig file instead, e.g. when Flame runs outside the cluster.

### Backup and restore

Settings > Backup (requires login):

- **Download backup** saves a zip with your apps (including their external URLs and status check options), bookmarks, categories, settings, themes, search providers, custom CSS and uploaded or fetched icons. The password, the JWT secret and the weather API key are never included.
- **Restore** checks the chosen backup and shows what it contains next to what you have now. Nothing changes until you confirm. Restoring replaces all apps, bookmarks and categories, plus the settings, themes, search providers and custom CSS stored in the backup; uploaded icons are added to the existing ones. Secrets such as the weather API key keep their current values.
- Before every restore, Flame saves the current state to `data/backups/pre-restore-<time>.zip` (the last 5 are kept), so a restore can be undone by restoring that file. The restore is applied all at once: if anything fails, the database and files stay as they were.
- **Scheduled backups** can be saved to `data/backups/flame-backup-<time>.zip` daily or weekly at 03:30 server time, keeping the newest 7 by default. Saved backups are listed with download links.

Backups are checked before anything is restored: unknown or misplaced files (e.g. `../` paths, symlinks), files that are not PNG, JPEG, ICO, WebP or SVG icons, links with disallowed URL schemes and invalid settings are rejected, and SVG icons are sanitized. Uploads are limited to 50 MB (`BACKUP_MAX_SIZE_MB`) and 2 MB per icon. Backups made by a newer Flame version with a newer backup format are refused instead of partly restored.

### Import HTML Bookmarks (Experimental)

- Requirements
  - python3
  - pip packages: Pillow, beautifulsoup4
- Backup your `db.sqlite` before running script!
- Known Issues:
  - generated icons are sometimes incorrect

```bash
pip3 install Pillow, beautifulsoup4

cd flame/.dev
python3 bookmarks_importer.py --bookmarks <path to bookmarks.html> --data <path to flame data folder>
```

### Custom CSS and themes

> This is an experimental feature. Its behaviour might change in the future.
>
> Follow instructions from wiki: [Custom CSS](https://github.com/pawelmalak/flame/wiki/Custom-CSS)

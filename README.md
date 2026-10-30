# Flame

Flame is a self-hosted start page for your server: apps and bookmarks in categories, a search bar and a weather widget, all edited from the browser with no config files.

This is [TrevorWget/flame](https://github.com/TrevorWget/flame), a fork of [pawelmalak/flame](https://github.com/pawelmalak/flame) by way of [fdarveau/flame](https://github.com/fdarveau/flame), which added app categories. Compared with upstream, this fork hardens the server and the Docker image, adds single sign-on, app status indicators, backups, favicon and selfh.st icons, layout and theme options and drag-and-drop arranging, and builds the client with Vite. It is published as `ghcr.io/trevorwget/flame`, and an upstream data directory can be used as is (see [Upgrading from upstream Flame](#upgrading-from-upstream-flame)).

![Flame home page](.github/home.png)

<sub>Screenshot from upstream Flame; it doesn't show this fork's app categories, status dots or layout options.</sub>

## Contents

- [Features](#features)
- [Quick start (Docker Compose)](#quick-start-docker-compose)
- [Configuration](#configuration)
- [Authentication](#authentication)
- [Integrations](#integrations)
- [Using Flame](#using-flame)
- [Upgrading from upstream Flame](#upgrading-from-upstream-flame)
- [Development](#development)
- [Contributing](#contributing)
- [Credits and licence](#credits-and-licence)

More detail is in [`docs/`](docs): [installation](docs/installation.md), [authentication](docs/authentication.md), [Docker and Kubernetes integrations](docs/integrations.md), [Docker socket proxy](docs/docker-socket-proxy.md), [icons](docs/icons.md) and [bookmark import](docs/bookmarks-import.md).

## Features

**Dashboard**
- Apps and bookmarks grouped in categories; pin apps and categories to the home page
- Collapse home page categories by clicking their name (remembered per browser)
- Search bar with local search, 11 web search providers and your own
- Weather widget using Open-Meteo (no API key) or WeatherAPI
- Guests see only what you mark as public

**Editing**
- Built-in editors for apps, bookmarks and categories
- Drag and drop apps and bookmarks between categories (**Arrange Apps** / **Arrange Bookmarks**)
- Internal and external URL per app, with a per-app choice of which one opens

**Integrations**
- Apps from Docker container labels (with a Traefik rule fallback) and Kubernetes Ingress annotations
- Docker over a socket, a read-only socket proxy, TLS or a Windows named pipe

**Status and icons**
- Status dots (up, unhealthy, down) from HTTP checks or Docker container state
- Icons from MDI, image URLs or uploads, fetched site favicons, and the selfh.st icon set with light/dark versions that follow the theme

**Look**
- 16 built-in themes, user themes with a live-preview editor, and custom CSS
- Automatic light/dark switching by device setting or time of day, and bundled fonts
- App tiles or list rows, density, icon size, column count and what each app shows

**Accounts and data**
- Password login, forward-auth (Authentik, Authelia, ...) and OIDC
- `HttpOnly` cookie sessions with CSRF protection, login rate limiting, non-root container
- Backup and restore from the settings, scheduled backups, and a database copy before every migration

## Quick start (Docker Compose)

```yaml
services:
  flame:
    image: ghcr.io/trevorwget/flame:latest
    container_name: flame
    restart: unless-stopped
    ports:
      - 5005:5005
    volumes:
      - /path/to/data:/app/data # must be writable by uid 1000
    environment:
      - PASSWORD=<your-strong-password>
```

```sh
sudo mkdir -p /path/to/data && sudo chown 1000:1000 /path/to/data
docker compose up -d
```

Open `http://<host>:5005` and log in under **Settings > App**.

- The image runs as the non-root user `node` (uid/gid `1000:1000`). To use another owner, set `user: "UID:GID"`, or start as root (`user: "0:0"`) with `PUID` / `PGID` and Flame fixes the ownership itself. See [User and permissions](docs/installation.md#user-and-permissions).
- All data (database, settings, icons, backups) lives in `/app/data`. Back that directory up.
- Tags: `latest` and a dated tag (`YYYY-MM-DD`) for every `master` build, `sha-<commit>`, and semver tags for releases. The image covers amd64 and arm64.
- Put the password in a file instead with `PASSWORD_FILE` or a Docker secret, see [Secrets](docs/installation.md#secrets).

### Optional: Docker integration through a read-only socket proxy

To create apps from container labels, or use container states for status dots, Flame needs the Docker API. Rather than mounting `/var/run/docker.sock` (which gives root on the host, even with `:ro`), put a proxy in front of it that only answers `GET /containers/json` and `GET /events`:

```yaml
services:
  flame:
    image: ghcr.io/trevorwget/flame:latest
    container_name: flame
    restart: unless-stopped
    depends_on:
      - socket-proxy
    ports:
      - 5005:5005
    volumes:
      - /path/to/data:/app/data
    environment:
      - PASSWORD=<your-strong-password>
    networks:
      - default
      - socket

  socket-proxy:
    image: ghcr.io/tecnativa/docker-socket-proxy:0.3.0
    restart: unless-stopped
    environment:
      - CONTAINERS=1
      - EVENTS=1
      - POST=0
      - PING=0
      - VERSION=0
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      # restricts CONTAINERS=1 (every GET /containers/*) to the two paths above
      - ./socket-proxy/haproxy.cfg.template:/usr/local/etc/haproxy/haproxy.cfg.template:ro
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    networks:
      - socket

networks:
  socket:
    internal: true
```

Copy `socket-proxy/haproxy.cfg.template` from [Docker socket proxy](docs/docker-socket-proxy.md), which also shows how to check that everything else is denied. Then set **Settings > Docker > Docker host** to `tcp://socket-proxy:2375` and turn on **Use Docker API**.

Mounting the socket directly also works: add `- /var/run/docker.sock:/var/run/docker.sock` and `group_add: ["<gid>"]` with the socket's group from `stat -c %g /var/run/docker.sock`, and keep the default Docker host `localhost`.

## Configuration

Most settings are in the web UI and stored in `data/config.json`. Environment variables cover secrets and deployment:

| Variable | Default | Description |
| --- | --- | --- |
| `PASSWORD` | none | Admin password. Without it (or with an old example value such as `flame_password`), password login is disabled. Changing it ends all password sessions. |
| `SECRET` | generated | JWT signing secret. When unset, a random one is generated and kept in `data/.secret`. Should be at least 32 bytes. |
| `<NAME>_FILE` | | Reads `<NAME>` from a file, e.g. `PASSWORD_FILE=/run/secrets/flame_password`. Files in `/run/secrets` also set the variable named like the file. See [Secrets](docs/installation.md#secrets). |
| `TRUST_PROXY` | off | Reverse proxies to trust for the client IP (login rate limit) and HTTPS detection (`Secure` cookie): `true`, a hop count, or addresses/subnets such as `172.18.0.5` or `loopback, 172.16.0.0/12`. Forward auth requires addresses/subnets. |
| `AUTH_PROXY_HEADER` | off | Header with the user name set by a forward-auth proxy, e.g. `X-authentik-username`. See [Authentication](#authentication). |
| `AUTH_PROXY_LOGOUT_URL` | none | Where Logout sends forward-auth users, e.g. `/outpost.goauthentik.io/sign_out`. |
| `OIDC_DISCOVERY_URL`, `OIDC_CLIENT_ID` | off | Turn on OIDC login (both required). |
| `OIDC_CLIENT_SECRET` | none | Client secret for confidential clients. |
| `OIDC_REDIRECT_URI` | request URL | `https://<flame-host>/api/auth/oidc/callback`. |
| `OIDC_ALLOWED_GROUPS` | anyone | Comma-separated groups allowed to log in. |
| `OIDC_GROUPS_CLAIM`, `OIDC_USERNAME_CLAIM` | `groups`, `preferred_username` | Claims for groups and the user name. |
| `OIDC_SCOPES` | `openid profile email` | Requested scopes. |
| `OIDC_PROVIDER_NAME` | `SSO` | Label of the "Log in with ..." button. |
| `OIDC_ALLOW_INSECURE_HTTP` | `false` | Allow plain-HTTP OIDC URLs (testing only). |
| `BACKUP_MAX_SIZE_MB` | `50` | Largest backup file accepted for restore. |
| `FRAME_ANCESTORS` | `'self'` | Space-separated CSP sources allowed to embed Flame in a frame. See [Embedding](docs/installation.md#embedding-flame-in-another-page). |
| `PORT` | `5005` | Port Flame listens on (the health check follows it). |
| `PUID`, `PGID` | `1000` | User and group to run as when the container is started as root. |
| `DOCKER_CERT_PATH` | `~/.docker` | Directory with `ca.pem`, `cert.pem` and `key.pem` for a TLS Docker host. |
| `DOCKER_TLS_VERIFY` | off | Makes `tcp://` Docker hosts use TLS. |
| `KUBECONFIG` | in-cluster | Use a kubeconfig file instead of the pod's service account. |

The image sets `NODE_ENV=production` and `VERSION`; don't override them.

**Settings tabs:** Theme (themes and theme options), General (sorting, URL schemes, status indicators, icons, search), Interface (title, header, greetings, sections), Layout, Weather, Docker (Docker and Kubernetes), CSS, Backup, and App (login, version, credits). Everything except Theme and App needs a login.

## Authentication

- **Password:** set `PASSWORD`. Failed logins are limited to 10 per 15 minutes per IP; set `TRUST_PROXY` behind a reverse proxy so that is the real client IP. Sessions last 1 hour to 1 year, as chosen at login, and **Settings > App > Log out all sessions** ends all of them.
- **Forward auth (Authentik, Authelia, ...):** your reverse proxy authenticates every request and passes the user name in a header. Set `AUTH_PROXY_HEADER` and set `TRUST_PROXY` to the proxy's address; the header is ignored from any other address. Optionally set `AUTH_PROXY_LOGOUT_URL`.
- **OIDC:** set `OIDC_DISCOVERY_URL`, `OIDC_CLIENT_ID` and usually `OIDC_CLIENT_SECRET` and `OIDC_REDIRECT_URI`. Flame shows a "Log in with ..." button and uses the authorization code flow with PKCE, optionally restricted to `OIDC_ALLOWED_GROUPS`.

`PASSWORD` can be left unset when forward auth or OIDC is configured. Step-by-step Authentik setups for both, the security requirements for forward auth, and API access are in [docs/authentication.md](docs/authentication.md).

## Integrations

Turn them on in **Settings > Docker**. Synced apps are created or updated every 30 seconds (and right away when a container starts or stops), and pinned to the home page. With **Unpin stopped containers / removed ingresses**, apps whose container or ingress is gone are unpinned; apps added in the UI are never touched.

**Docker labels** (**Use Docker API**):

```yaml
labels:
  - flame.type=application # or "app"
  - flame.name=My app
  - flame.url=http://my-app.lan:8080 # internal URL
  - flame.url.external=https://my-app.example.com # optional external URL
  - flame.category=My category # optional, default "Docker"
  - flame.icon=icon-name # optional; MDI name or URL, "custom" keeps the icon set in the UI
  - flame.order=1 # optional, default 500
```

Separate values with `;` to define several apps on one container. Without `flame.url`, Flame takes the host from a Traefik router rule. See [Docker labels](docs/integrations.md#docker-labels) and [Connecting to Docker](docs/integrations.md#connecting-to-docker) for every Docker host format and TLS.

**Kubernetes** (**Use Kubernetes Ingress API**): the same keys as Ingress annotations with the upstream `flame.pawelmalak/` prefix, e.g. `flame.pawelmalak/name`, `flame.pawelmalak/url` and `flame.pawelmalak/url.external`. Flame needs `list` on `ingresses` (see `k8s/base/rbac.yaml`) and uses the pod's service account or `KUBECONFIG`. Only Ingresses are read; Gateway API routes are not supported. See [Kubernetes](docs/integrations.md#kubernetes).

URLs from labels, annotations and the UI must use an allowed scheme (`http`, `https`, `ftp`, `ftps`, `sftp`, `ssh`, `smb`, `steam`, `mailto`, `tel`, `rdp`, `vnc`, plus any under **Settings > General > Additional URL schemes**); `javascript:`, `data:` and similar schemes are always rejected.

## Using Flame

### Status indicators

Turn on **Settings > General > Show app status indicators**. The Flame server then checks every app and shows a dot next to it: filled when it is up, half filled when it is unhealthy, hollow when it is down. Hovering shows the reason and since when.

- **HTTP check** (default): an answer below 500 is up, even a redirect or 401/403 from a login page; a 5xx answer or one slower than the slow response time (default 3 s) is unhealthy; no answer within the timeout (default 5 s) is down. Certificates are not verified. Checks run every 60 seconds by default.
- **Container state:** with **Use the container state of Docker apps** and **Use Docker API** on, apps whose container is found use its state instead: running is up; restarting, starting or failing its health check is unhealthy; stopped is down. Containers are found by their `flame.name` label, a container or Compose service named like the app, or the main container of a multi-container app (`authentik-server` for "Authentik").
- Per app, in the app form: **Don't check this app**, or a **Status check URL** to check instead of the app URL (this also switches a Docker app to the HTTP check).
- Dot colours come from the theme, or set your own under **Status colors**. **Settings > Layout > Hide status dots** hides them on the dashboard.

Guests only see the status of apps they can see, and only a fixed description such as "Connection refused".

### Icons

Each app or bookmark can use an [MDI](https://pictogrammers.com/library/mdi/) icon name, an image URL or an uploaded file, or an icon the Flame server downloads and keeps in `data/uploads`:

- **Fetch icon from site** downloads the site's favicon. **Settings > General > Icons** can also fetch icons for items saved without one, and allow fetching from private network addresses (off by default, so the server only fetches from public addresses unless you allow it).
- **Browse selfh.st icons** searches the [selfh.st icon collection](https://selfh.st/icons) and stores the icon you pick. **Automatic** colours show the light version on dark themes and the dark version on light themes. **Prefer selfh.st icons when fetching icons** uses a matching selfh.st icon before the favicon.

selfh.st icons are by [selfh.st](https://selfh.st/icons) and licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); the logos are trademarks of their owners. The credit is also shown in the picker and in **Settings > App**. Limits, caching and the private-address rules are in [docs/icons.md](docs/icons.md).

### Layout and themes

- **Settings > Layout:** app style (list rows or icon tiles), density (compact, normal, roomy), icon size (50 to 200 %), the number of columns on the home and Applications pages (automatic or 1 to 8), and hiding app URLs, descriptions or status dots. A preview shows the result before saving.
- **Settings > Theme:** pick one of 16 built-in themes or a user theme. The theme editor has a live preview of the home page, warns about low contrast, and can start from any theme. **Theme options** sets the default theme for new visitors, switches automatically between a light and a dark theme (following the device, or by time of day using sunrise and sunset at the weather location or fixed times), and picks the font: Roboto (default), Inter, Nunito, Source Serif, JetBrains Mono or the system font. Fonts are bundled; nothing is loaded from Google Fonts.
- **Settings > CSS:** custom CSS applied to every page, stored in `data/flame.css`. Experimental: class names can change between versions.
- **Settings > Interface:** page title, header, greetings, date and time format, and hiding the search bar, apps, bookmarks or empty categories.

### Search and weather

Type a prefix and your query to search the web, e.g. `/g what is docker`. Built-in prefixes: `l` local search, `d` DuckDuckGo, `g` Google, `w` Wikipedia, `yt` YouTube, `r` Reddit, `im` IMDb, `mv` The Movie Database, `sp` Spotify, `td` Tidal, `dz` Deezer, `ds` Disroot. Add your own under **Settings > General > Custom search providers**. Without a prefix, the primary search provider is used (local search by default, with a secondary provider for when nothing matches). A URL or IP address opens directly.

For weather, pick a provider in **Settings > Weather** ([Open-Meteo](https://open-meteo.com/) needs no key; [WeatherAPI](https://www.weatherapi.com/) needs a free API key) and enter your latitude and longitude. Weather refreshes every 15 minutes, and changes apply without a restart.

### Backup and restore

**Settings > Backup**:

- **Download backup** saves a zip with apps, bookmarks, categories, settings, themes, search providers, custom CSS and uploaded or fetched icons. The password, the JWT secret and the weather API key are never included.
- **Restore** checks the backup and shows what it contains next to what you have now; nothing changes until you confirm. Restoring replaces all apps, bookmarks and categories, plus the settings, themes, search providers and custom CSS in the backup; icons are added to the existing ones. The restore is all-or-nothing, and the current state is first saved to `data/backups/pre-restore-<time>.zip` (the last 5 are kept).
- **Scheduled backups** save `data/backups/flame-backup-<time>.zip` daily or weekly (Sunday) at 03:30 server time, keeping the newest 7 by default. Saved backups are listed with download links.

Backups are validated before anything is restored: unsafe paths, unknown files, non-image icons, disallowed URL schemes and invalid settings are rejected, and SVG icons are sanitized. Uploads are limited to `BACKUP_MAX_SIZE_MB` (50 MB) and 2 MB per icon. Backups from a newer Flame with a newer backup format are refused.

To import a browser's HTML bookmarks, see the experimental [bookmark importer](docs/bookmarks-import.md).

## Upgrading from upstream Flame

The data directory of [pawelmalak/flame](https://github.com/pawelmalak/flame) (v2.4.0 and older) or [fdarveau/flame](https://github.com/fdarveau/flame) can be used as is.

1. Stop the old container and copy the whole data directory somewhere safe. The upgrade can't be undone in place.
2. Change the image to `ghcr.io/trevorwget/flame:latest` (replacing `pawelmalak/flame` or `pawelmalak/flame:multiarch`).
3. Make the data directory writable by uid 1000 (`sudo chown -R 1000:1000 /path/to/data`), or use `user:` or `PUID`/`PGID` as in the [quick start](#quick-start-docker-compose).
4. Set a strong `PASSWORD`; old example values are rejected. If `SECRET` is set to the value from upstream's old `.env`, Flame refuses to start: remove it (a new one is generated) or replace it.
5. For the Docker integration, use the [socket proxy](#optional-docker-integration-through-a-read-only-socket-proxy) or add the socket's group with `group_add`, since Flame no longer runs as root.
6. Start Flame. Before running migrations, it copies the database to `data/db_backups/db-<version>-<timestamp>-backup.sqlite`; if that copy fails, it exits without migrating.

Upstream has no app categories, so on the first start every app that isn't in an app category moves into one of two new categories, keeping what the home page showed before:

- **Applications** (pinned): apps that were pinned to the home page
- **Other apps** (not pinned): the remaining apps, shown on the Applications page only

Existing categories become bookmark categories. Nothing is deleted, and you can rename the categories or move apps afterwards. Sessions now use a cookie, so everyone logs in once after upgrading. Kubernetes annotations keep their `flame.pawelmalak/` prefix.

To go back, stop Flame and restore the copy from step 1 with the old image.

Later upgrades within this fork run their migrations the same way, with a database copy first. Downloading a backup from **Settings > Backup** beforehand is still a good idea. Changes are listed in the [changelog](CHANGELOG.md).

## Development

Requirements: Node.js 24 (as in CI and the image) and npm. The server is Express with Sequelize and SQLite (migrations in `db/migrations`); the client in `client/` is React 18, Redux and TypeScript, built with Vite and tested with Vitest.

```sh
git clone https://github.com/TrevorWget/flame.git
cd flame
npm run dev-init   # creates data/ and public/, installs server and client dependencies (needs a POSIX shell)
npm run dev        # backend on :5005 (nodemon) and the Vite dev server on :3000
```

Set `PASSWORD` in the root `.env` to log in during development. The Vite dev server at `http://localhost:3000` proxies `/api`, `/uploads` and the `/socket` WebSocket to the backend; set `FLAME_SERVER_URL` to use a backend elsewhere, e.g. `FLAME_SERVER_URL=http://localhost:5160 npm run dev --prefix client -- --port 3160`.

Checks, as run by CI:

```sh
npm run lint && npm test          # server: ESLint and node:test (test/*.test.js)

cd client
npm run lint && npm run typecheck && npm test && npm run build   # client: ESLint, tsc, Vitest, production bundle in client/dist
```

**CI:** `.github/workflows/ci.yml` runs the server and client checks and an `npm audit` gate (high and critical advisories in production dependencies) on every push. `.github/workflows/docker-publish.yml` builds the image on pull requests and checks that it becomes healthy and runs as uid 1000; pushes to `master` and `v*.*.*` tags also publish it to GHCR for amd64 and arm64. Renovate keeps dependencies and pinned action digests up to date.

**Versioning:** the version comes from `VITE_APP_VERSION` in `client/.env` (shown in **Settings > App**, used by the update check and the image); keep `VERSION` in the root `.env` the same. Add changes to [CHANGELOG.md](CHANGELOG.md).

See [Installation](docs/installation.md) for building the image and running without Docker, and [.dev/DEV_GUIDELINES.md](.dev/DEV_GUIDELINES.md) for adding a setting.

## Contributing

Bug reports and pull requests are welcome on [TrevorWget/flame](https://github.com/TrevorWget/flame/issues). For a bug, include the Flame version (**Settings > App**), the image tag and how you run it. For a pull request, run the checks above, add tests for behaviour changes, and update the README, `docs/` and the changelog when you change something users see.

## Credits and licence

Flame was created by [Paweł Malak](https://github.com/pawelmalak) ([pawelmalak/flame](https://github.com/pawelmalak/flame)), with app categories by [François Darveau](https://github.com/fdarveau) ([fdarveau/flame](https://github.com/fdarveau/flame)). Its design is inspired by [SUI](https://github.com/jeroenpardon/sui). Icons from [Material Design Icons](https://pictogrammers.com/library/mdi/) and [selfh.st](https://selfh.st/icons) (CC BY 4.0).

Released under the [MIT License](LICENSE.md), copyright (c) 2021 Paweł Malak.

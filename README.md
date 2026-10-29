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
- 🔑 Authentication system to protect your settings, apps and bookmarks
- 🔨 Dozens of options to customize Flame interface to your needs, including support for custom CSS, 15 built-in color themes and custom theme builder
- ☀️ Weather widget with current temperature, cloud coverage and animated weather status
- 🐳 Docker integration to automatically pick and add apps based on their labels

## Installation

### With Docker (recommended)

```sh
docker pull ghcr.io/fdarveau/flame:latest

# for ARM architecture (e.g. RaspberryPi)
docker pull ghcr.io/fdarveau/flame:latest-multiarch

# installing specific version
docker pull ghcr.io/fdarveau/flame:2021-12-12
```

#### Deployment

```sh
# run container
docker run -p 5005:5005 -v /path/to/data:/app/data -e PASSWORD='<your-strong-password>' ghcr.io/fdarveau/flame:latest
```

`PASSWORD` is required. If it is missing or set to one of the old example values (`flame_password`, `change_me`, ...), Flame still serves the dashboard but login is disabled and an error is logged at startup.

Login attempts are rate limited per client IP. If Flame runs behind a reverse proxy, set `TRUST_PROXY` so the real client IP is used: `true` (trust all proxies), a hop count such as `1`, or a list of trusted addresses/subnets such as `loopback, 172.16.0.0/12` (see [Express "trust proxy"](https://expressjs.com/en/guide/behind-proxies.html)).

Leave `SECRET` unset to have a random JWT secret generated in `data/.secret`. Flame refuses to start if `SECRET` is set to the value that was committed to this repository before v2.4.0.

#### Building images

```sh
# build image for amd64 only
docker build -t flame -f .docker/Dockerfile .

# build multiarch image for amd64, armv7 and arm64
# building failed multiple times with 2GB memory usage limit so you might want to increase it
docker buildx build \
  --platform linux/arm/v7,linux/arm64,linux/amd64 \
  -f .docker/Dockerfile.multiarch \
  -t flame:multiarch .
```

#### Docker-Compose

```yaml
version: '3.6'

services:
  flame:
    image: ghcr.io/fdarveau/flame:latest
    container_name: flame
    volumes:
      - /path/to/host/data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock # optional but required for Docker integration
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

All environment variables can be overwritten by appending `_FILE` to the variable value. For example, you can use `PASSWORD_FILE` to pass through a docker secret instead of `PASSWORD`. If both `PASSWORD` and `PASSWORD_FILE` are set, the docker secret will take precedent.

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

## Screenshots

![Apps screenshot](.github/apps.png)

![Bookmarks screenshot](.github/bookmarks.png)

![Settings screenshot](.github/settings.png)

![Themes screenshot](.github/themes.png)

## Usage

### Authentication

Visit [project wiki](https://github.com/pawelmalak/flame/wiki/Authentication) to read more about authentication

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

### Docker integration

In order to use the Docker integration, each container must have the following labels:

```yml
labels:
  - flame.type=application # "app" works too
  - flame.name=My container
  - flame.url=https://example.com
  - flame.category=My category # Optional, default is "Docker"
  - flame.icon=icon-name # Optional, default is "docker"
  - flame.order=1 # Optional, default is 500; lower number is first in the list
```

> "Use Docker API" option must be enabled for this to work. You can find it in Settings > Docker

> URLs (from labels, Kubernetes annotations or the UI) may only use `http`, `https`, `ftp`, `ftps`, `sftp`, `ssh`, `smb`, `steam`, `mailto`, `tel`, `rdp` or `vnc`. Other schemes can be allowed in Settings > General > Additional URL schemes; apps with any other scheme are skipped. `javascript:`, `data:`, `vbscript:` and `blob:` URLs are always rejected.

You can also set up different apps in the same label adding `;` between each one.

```yml
labels:
  - flame.type=application
  - flame.name=First App;Second App
  - flame.url=https://example1.com;https://example2.com
  - flame.icon=icon-name1;icon-name2
```

If you want to use a remote docker host follow this instructions in the host:

- Open the file `/lib/systemd/system/docker.service`, search for `ExecStart` and edit the value

```text
ExecStart=/usr/bin/dockerd -H tcp://0.0.0.0:${PORT} -H unix:///var/run/docker.sock
```

>The above command will bind the docker engine server to the Unix socket as well as TCP port of your choice. “0.0.0.0” means docker-engine accepts connections from all IP addresses.

- Restart the daemon and Docker service

```shell
sudo systemctl daemon-reload
sudo service docker restart
```

- Test if it is working

```shell
curl http://${IP}:${PORT}/version
```

### Kubernetes integration

In order to use the Kubernetes integration, each ingress must have the following annotations:

```yml
metadata:
  annotations:
  - flame.pawelmalak/type=application # "app" works too
  - flame.pawelmalak/name=My container
  - flame.pawelmalak/url=https://example.com
  - flame.pawelmalak/category=My category # Optional, default is "Kubernetes"
  - flame.pawelmalak/icon=icon-name # Optional, default is "kubernetes"
  - flame.pawelmalak/order=1 # Optional, default is 500; lower number is first in the list
```

> "Use Kubernetes Ingress API" option must be enabled for this to work. You can find it in Settings > Docker

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

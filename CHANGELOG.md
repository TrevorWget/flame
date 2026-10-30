### v2.5.0 (2026-10-30)
- The home page now shows only pinned apps ([#14](https://github.com/TrevorWget/flame/pull/14)), and a long app category spreads over the whole grid ([#15](https://github.com/TrevorWget/flame/pull/15))
- Added collapsible home page categories: click a category's name to collapse it, remembered per browser ([#16](https://github.com/TrevorWget/flame/pull/16)); the other categories reflow to fill the space ([#25](https://github.com/TrevorWget/flame/pull/25))
- Apps can have an internal and an external URL, with a per-app "Open with" choice; Docker apps take the external URL from the `flame.url.external` label and Kubernetes apps from the `flame.pawelmalak/url.external` annotation ([#17](https://github.com/TrevorWget/flame/pull/17))
- Added drag and drop editing: "Arrange Apps" and "Arrange Bookmarks" move items within and between categories ([#18](https://github.com/TrevorWget/flame/pull/18))
- Added app status indicators (Settings > General, off by default): the server checks each app over HTTP, or uses its Docker container state, and shows an up, unhealthy or down dot with the reason. Apps can be excluded or given their own check URL, and the dot colours follow the theme or can be set by hand ([#19](https://github.com/TrevorWget/flame/pull/19), [#23](https://github.com/TrevorWget/flame/pull/23), [#24](https://github.com/TrevorWget/flame/pull/24), [#26](https://github.com/TrevorWget/flame/pull/26))
- Added single sign-on ([#21](https://github.com/TrevorWget/flame/pull/21)): forward-auth login from a header set by a trusted reverse proxy (`AUTH_PROXY_HEADER`, accepted only from `TRUST_PROXY` addresses, optional `AUTH_PROXY_LOGOUT_URL`) and OIDC login with PKCE (`OIDC_*`, optionally limited to groups). `PASSWORD` can be left unset when SSO is configured
- Added layout options (Settings > Layout): list rows or icon tiles, density, icon size, a fixed number of columns for the home and Applications pages, and hiding app URLs, descriptions or status dots, with a preview ([#27](https://github.com/TrevorWget/flame/pull/27))
- Added theme options (Settings > Theme): switch automatically between a light and a dark theme by following the device's setting or by time of day (sunrise and sunset at the weather location, or fixed times), and pick a font (Roboto by default, or the bundled Inter, Nunito, Source Serif 4 and JetBrains Mono, or the system font). Fonts are self-hosted, never loaded from a CDN. Manual theme and Roboto stay the defaults, and the options are included in backups
- The theme editor now has a live preview of the homepage (status dots included), hex inputs, low-contrast warnings, "Start from" any theme, and duplicating user themes. Editing a theme updates the default, light and dark theme settings that use it, and renaming a theme onto an existing name is rejected
- Added backup and restore (Settings > Backup, [#318](https://github.com/pawelmalak/flame/issues/318), [#259](https://github.com/pawelmalak/flame/issues/259)): download a zip with apps (with their external URLs and status check options), bookmarks, categories, settings, themes, search providers, custom CSS and uploaded or fetched icons (never the password, JWT secret or weather API key), and restore it after a preview of what it contains. Restores are validated, all-or-nothing, and preceded by a backup of the current state in `data/backups`. Optional daily or weekly backups to `data/backups` with a configurable number to keep
- Added icon fetching for apps and bookmarks ([#303](https://github.com/pawelmalak/flame/issues/303), [#372](https://github.com/pawelmalak/flame/issues/372), port of [#497](https://github.com/pawelmalak/flame/pull/497)): "Fetch icon from site" in the app and bookmark forms downloads the site's favicon (or the icon URL in the icon field) and keeps a copy in `data/uploads`, so icons no longer depend on the site being reachable. Settings > General > Icons can also fetch icons automatically for apps and bookmarks saved without one (off by default)
- Added selfh.st icons: "Browse selfh.st icons" in the app and bookmark forms searches the [selfh.st](https://selfh.st/icons) collection and stores the picked icon (standard, light or dark; SVG, WebP or PNG) in `data/uploads`, so it is included in backups and never loaded from the CDN by the browser. The form suggests the icon named like the app, and "Prefer selfh.st icons when fetching icons" (Settings > General > Icons, off by default) uses it for automatic icon fetching before the site favicon. The icon list is cached in `data/selfhst-index.json` for a day and keeps working offline. Icons by selfh.st, CC BY 4.0 (credited in the picker and Settings > App)
- selfh.st icons can follow the theme: the new "Automatic" colours (the default for icons with light and dark versions, and used by the suggestion and "Prefer selfh.st icons") store both versions and show the light one on dark themes and the dark one on light themes, switching live with the theme, including automatic light/dark switching. Works for apps and bookmarks on the home page, search, /applications and /bookmarks. Icons picked before keep working and can be switched to Automatic from the edit form. The versions are stored in the new `iconOnDark` and `iconOnLight` fields of apps and bookmarks (migration `14_icon-theme-variants`) and included in backups
- Security: icons are fetched by the server over http/https only, never from loopback, LAN, link-local or other non-public addresses unless "Allow fetching icons from private network addresses" is turned on, with every redirect re-checked, a 1 MB / 10 second limit, and the content checked to be a PNG, JPEG, ICO, WebP or sanitized SVG
- Fixed every app disappearing after upgrading from upstream Flame (pawelmalak, v2.4.0 and older): apps without an app category are moved into a new pinned "Applications" category (apps that were pinned) or an unpinned "Other apps" category (the rest), so the home page shows the same apps as before
- Fixed the database backup before migrations being skipped when a backup for the same version already existed. Backups are now named `db-<version>-<timestamp>-backup.sqlite`, are only taken when migrations are pending, and Flame exits without migrating if the backup fails
- `PASSWORD_FILE`, `SECRET_FILE` and any other `<VARIABLE>_FILE` now read the variable from that file, as the README described; previously only files in `/run/secrets` worked
- The update check now uses this fork's GitHub releases instead of upstream's version: it reports a newer release only (not an older or equal one) and links to its release notes, and "Check for updates" says when the check failed
- Settings > App links to this fork's repository and changelog, and the login form links to [docs/authentication.md](docs/authentication.md) instead of the upstream wiki
- Fixed the bookmark importer (`.dev/bookmarks_importer.py`) failing when the first bookmark has no icon, and bookmarks without an icon getting the previous bookmark's icon. Unreadable icons are skipped, folders only go into bookmark categories (never an app category with the same name), and the file is read as UTF-8. The pinned requirements are in `.dev/requirements-importer.txt`, and CI runs the importer's tests
- Kubernetes: `k8s/base` now deploys `ghcr.io/trevorwget/flame` with a data volume (`flame-data`, 1 GiB) and `PASSWORD` from a generated Secret with a placeholder that keeps login disabled until it's replaced (see [Kubernetes](docs/installation.md#kubernetes)). `skaffold.yaml` builds `.docker/Dockerfile`, or `.docker/Dockerfile.dev` with file sync under `skaffold dev`. Removed the `shokohsc` overlay and Skaffold profile, which targeted an upstream contributor's cluster
- Security: login now fails closed. If `PASSWORD` is unset or a known default (`flame_password`, `change_me`, ...), login is disabled and an error is logged; the images no longer ship a default password
- Security: Flame refuses to start if `SECRET` is the value leaked in this repository's `.env` before v2.4.0, and warns if `SECRET` is shorter than 32 bytes
- Security: timing-safe password comparison, login rate limit (10 failed attempts per 15 minutes per IP; set `TRUST_PROXY` behind a reverse proxy), session duration restricted to the options offered in the UI
- Security: tokens are pinned to HS256 and invalidated when `PASSWORD` changes (existing sessions must log in again after upgrading)
- Security: the session token is now an `HttpOnly`, `SameSite=Strict` cookie (`Secure` over HTTPS, honouring `TRUST_PROXY`) instead of being kept in `localStorage`, so scripts on the page can't read it. Cookie-authenticated requests that change data require an `X-Flame-CSRF` header. Tokens from `localStorage` are discarded, so everyone has to log in once after upgrading
- Added "Log out all sessions" (Settings > App), which invalidates every issued token; logging out now also clears the cookie on the server
- Security: upgraded `@kubernetes/client-node` to 1.x, removing the critical `jsonpath-plus`, `tar`, `form-data` and `request` advisories
- Fixed the Kubernetes integration ignoring the `flame.pawelmalak/name` annotation and failing on every ingress ([fdarveau#26](https://github.com/fdarveau/flame/issues/26)); `KUBECONFIG` is now honoured when set
- Security: Docker and Kubernetes apps are synced by a background job (every 30 seconds, and on Docker container start/stop events) instead of on every `GET /api/apps` / `GET /api/categories`
- Fixed "Unpin stopped containers" unpinning every app, including ones added manually; it now only unpins apps from stopped containers or removed ingresses
- Fixed the Docker integration sending an invalid container filter
- Docker host accepts `unix://`, `tcp://`, `http://`, `https://` (TLS client certificates from `DOCKER_CERT_PATH`) and `npipe://` ([#386](https://github.com/pawelmalak/flame/issues/386)); other values are rejected when saving settings, requests time out after 10 seconds and don't follow redirects. README now documents a socket proxy instead of exposing the Docker API on `0.0.0.0`
- Fixed `GET /api/apps` failing with a server error, and the Applications / Bookmarks pages staying on "Loading..." when opened directly while logged out
- Fixed the default theme not being applied on a fresh install until the next restart
- Fixed reordering apps, bookmarks and categories responding before the new order was saved
- Fixed icon URLs on hosts without a dot (e.g. `http://localhost:8080/icon.png`) being treated as uploaded files
- Fixed uploaded icons being left in `data/uploads` when the app or bookmark is then rejected
- Added Open-Meteo as a weather provider that needs no API key ([#390](https://github.com/pawelmalak/flame/pull/390), [#400](https://github.com/pawelmalak/flame/pull/400))
- Fixed weather never updating when the API key was added after Flame started; weather updates now start and stop as soon as the settings are saved ([#306](https://github.com/pawelmalak/flame/issues/306), [#346](https://github.com/pawelmalak/flame/issues/346))
- Security: weather requests use HTTPS with encoded parameters, and `GET /api/weather/update` now requires login
- Weather update errors now show the provider's reason (e.g. an invalid API key) instead of a generic failure
- Fixed `GET /api/categories/:id` building an invalid sort order unless ordering is set to name
- Docker: one image for amd64 and arm64 published to `ghcr.io/trevorwget/flame` (the `-multiarch` tags are gone), built on Node 24 with production dependencies only
- Docker: the container runs as uid 1000 instead of root and no longer `chown`s the data directory on every start. Use `--user` to run as another user, or start as root with `PUID`/`PGID`. With the Docker integration, add the socket's group (`group_add`) when running as non-root
- Docker: added a `HEALTHCHECK`

### v2.4.0 (2026-04-24)
- Fixed high severity authentication security issues ([#465](https://github.com/pawelmalak/flame/issues/465))

### v2.3.1 (2023-07-23)
- Fixed bug where "Open search results in the same tab" setting was not respected if "Local search" was set as primary search provider ([#270](https://github.com/pawelmalak/flame/issues/270))
- Fixed bug where search bar had rounded input field on iOS ([#394](https://github.com/pawelmalak/flame/issues/394))
- Updated link to Material Design Icons reference page ([#414](https://github.com/pawelmalak/flame/issues/414))
- Fixed bug where color inputs in theme creator/editor were too small ([#429](https://github.com/pawelmalak/flame/issues/429))
- Changed input labels in settings for more consistent naming ([#430](https://github.com/pawelmalak/flame/issues/430))

### v2.3.0 (2022-03-25)
- Added custom theme editor ([#246](https://github.com/pawelmalak/flame/issues/246))
- Added option to set secondary search provider ([#295](https://github.com/pawelmalak/flame/issues/295))
- Fixed bug where pressing Enter with empty search bar would redirect to search results ([#325](https://github.com/pawelmalak/flame/issues/325))
- Fixed bug where user could create empty app or bookmark which was causing page to go blank ([#332](https://github.com/pawelmalak/flame/issues/332))
- Added new theme: Mint

### v2.2.2 (2022-03-21)
- Added option to get user location directly from the app ([#287](https://github.com/pawelmalak/flame/issues/287))
- Fixed bug with local search not working when using prefix ([#289](https://github.com/pawelmalak/flame/issues/289))
- Fixed bug with app description not updating when using custom icon ([#310](https://github.com/pawelmalak/flame/issues/310))
- Changed permissions to some files and directories created by Flame
- Changed some of the settings tabs

### v2.2.1 (2022-01-08)
- Local search will now include app descriptions ([#266](https://github.com/pawelmalak/flame/issues/266))
- Fixed bug with unsupported characters in local search [#279](https://github.com/pawelmalak/flame/issues/279))
- Background tasks optimization ([#283](https://github.com/pawelmalak/flame/issues/283))

### v2.2.0 (2021-12-17)
- Added option to set custom description for apps ([#201](https://github.com/pawelmalak/flame/issues/201))
- Fixed fatal error while deploying Flame to cluster ([#242](https://github.com/pawelmalak/flame/issues/242))

### v2.1.1 (2021-12-02)
- Added support for Docker secrets ([#189](https://github.com/pawelmalak/flame/issues/189))
- Changed some messages and buttons to make it easier to open bookmarks editor ([#239](https://github.com/pawelmalak/flame/issues/239))

### v2.1.0 (2021-11-26)
- Added option to set custom order for bookmarks ([#43](https://github.com/pawelmalak/flame/issues/43)) and ([#187](https://github.com/pawelmalak/flame/issues/187))
- Added support for .ico files for custom icons ([#209](https://github.com/pawelmalak/flame/issues/209))
- Empty apps and categories sections will now be hidden from guests ([#210](https://github.com/pawelmalak/flame/issues/210))
- Fixed bug with fahrenheit degrees being displayed as float ([#221](https://github.com/pawelmalak/flame/issues/221))
- Fixed bug with alphabetical order not working for bookmarks until the page was refreshed ([#224](https://github.com/pawelmalak/flame/issues/224))
- Added option to change visibilty of apps, categories and bookmarks directly from table view
- Password input will now autofocus when visiting /settings/app

### v2.0.1 (2021-11-19)
- Added option to display humidity in the weather widget ([#136](https://github.com/pawelmalak/flame/issues/136))
- Added option to set default theme for all new users ([#165](https://github.com/pawelmalak/flame/issues/165))
- Added option to hide header greetings and date separately ([#200](https://github.com/pawelmalak/flame/issues/200))
- Fixed bug with broken basic auth ([#202](https://github.com/pawelmalak/flame/issues/202))
- Fixed bug with parsing visibility value for apps and bookmarks when custom icon was used ([#203](https://github.com/pawelmalak/flame/issues/203))
- Fixed bug with custom icons not working with apps when "pin by default" was disabled

### v2.0.0 (2021-11-15)
- Added authentication system:
  - Only logged in user can access settings ([#33](https://github.com/pawelmalak/flame/issues/33))
  - User can set which apps, categories and bookmarks should be available for guest users ([#45](https://github.com/pawelmalak/flame/issues/45))
  - Visit [project wiki](https://github.com/pawelmalak/flame/wiki/Authentication) to read more about this feature
- Docker images will now be versioned ([#110](https://github.com/pawelmalak/flame/issues/110))
- Icons can now be set via URL ([#138](https://github.com/pawelmalak/flame/issues/138))
- Added current time to the header ([#157](https://github.com/pawelmalak/flame/issues/157))
- Fixed bug where typing certain characters in the search bar would result in a blank page ([#158](https://github.com/pawelmalak/flame/issues/158))
- Fixed bug with MDI icon name not being properly parsed if there was leading or trailing whitespace ([#164](https://github.com/pawelmalak/flame/issues/164))
- Added new shortcut to clear search bar and focus on it ([#170](https://github.com/pawelmalak/flame/issues/170))
- Added Wikipedia to search queries
- Updated project wiki
- Lots of changes and refactors under the hood to make future development easier

### v1.7.4 (2021-11-08)
- Added option to set custom greetings and date ([#103](https://github.com/pawelmalak/flame/issues/103))
- Fallback to web search if local search has zero results ([#129](https://github.com/pawelmalak/flame/issues/129))
- Added iOS "Add to homescreen" icon ([#131](https://github.com/pawelmalak/flame/issues/131))
- Added experimental script to import bookmarks ([#141](https://github.com/pawelmalak/flame/issues/141))
- Added 3 new themes

### v1.7.3 (2021-10-28)
- Fixed bug with custom CSS not updating

### v1.7.2 (2021-10-28)
- Pressing Enter while search bar is focused will now redirect to first result of local search ([#121](https://github.com/pawelmalak/flame/issues/121))
- Use search bar shortcuts when it's not focused ([#124](https://github.com/pawelmalak/flame/issues/124))
- Fixed bug with Weather API still logging with module being disabled ([#125](https://github.com/pawelmalak/flame/issues/125))
- Added option to disable search bar autofocus ([#127](https://github.com/pawelmalak/flame/issues/127))

### v1.7.1 (2021-10-22)
- Fixed search action not being triggered by Numpad Enter
- Added option to change date formatting ([#92](https://github.com/pawelmalak/flame/issues/92))
- Added shortcuts (Esc and double click) to clear search bar ([#100](https://github.com/pawelmalak/flame/issues/100))
- Added Traefik integration ([#102](https://github.com/pawelmalak/flame/issues/102))
- Fixed search bar not redirecting to valid URL if it starts with capital letter ([#118](https://github.com/pawelmalak/flame/issues/118))
- Performance improvements

### v1.7.0 (2021-10-11)
- Search bar will now redirect if valid URL or IP is provided ([#67](https://github.com/pawelmalak/flame/issues/67))
- Users can now add their custom search providers ([#71](https://github.com/pawelmalak/flame/issues/71))
- Fixed bug related to creating new apps/bookmarks with custom icon ([#83](https://github.com/pawelmalak/flame/issues/83))
- URL can now be assigned to notifications. Clicking on "New version is available" popup will now redirect to changelog ([#86](https://github.com/pawelmalak/flame/issues/86))
- Added static fonts ([#94](https://github.com/pawelmalak/flame/issues/94))
- Fixed bug with overriding app icon created with docker labels

### v1.6.9 (2021-10-09)
- Added option for remote docker host ([#97](https://github.com/pawelmalak/flame/issues/97))

### v1.6.8 (2021-10-05)
- Implemented migration system for database

### v1.6.7 (2021-10-04)
- Add multiple labels to Docker Compose ([#90](https://github.com/pawelmalak/flame/issues/90))
- Custom icons via Docker Compose labels ([#91](https://github.com/pawelmalak/flame/issues/91))

### v1.6.6 (2021-09-06)
- Added local search (filter) for apps and bookmarks ([#47](https://github.com/pawelmalak/flame/issues/47))

### v1.6.5 (2021-08-28)
- Added support for more URL schemes ([#74](https://github.com/pawelmalak/flame/issues/74))

### v1.6.4 (2021-08-17)
- Added Kubernetes integration ([#72 continued](https://github.com/pawelmalak/flame/issues/72))

### v1.6.3 (2021-08-09)
- Added support for custom SVG icons ([#73](https://github.com/pawelmalak/flame/issues/73))
- Added Deezer and Tidal to search queries

### v1.6.2 (2021-08-06)
- Fixed changelog link
- Added support for Docker API ([#14](https://github.com/pawelmalak/flame/issues/14))

### v1.6.1 (2021-07-28)
- Added option to upload custom icons for bookmarks ([#52](https://github.com/pawelmalak/flame/issues/52))
- Fixed custom icons not updating ([#58](https://github.com/pawelmalak/flame/issues/58))
- Added changelog file

### v1.6.0 (2021-07-17)
- Added support for Steam URLs ([#62](https://github.com/pawelmalak/flame/issues/62))
- Fixed bug with custom CSS not persisting ([#64](https://github.com/pawelmalak/flame/issues/64))
- Added option to set default prefix for search bar ([#65](https://github.com/pawelmalak/flame/issues/65))

### v1.5.0 (2021-06-24)
- Added ability to set custom CSS from settings ([#8](https://github.com/pawelmalak/flame/issues/8) and [#17](https://github.com/pawelmalak/flame/issues/17)) (experimental)
- Added option to upload custom icons ([#12](https://github.com/pawelmalak/flame/issues/12))
- Added option to open links in a new or the same tab ([#27](https://github.com/pawelmalak/flame/issues/27))
- Added Search bar with support for 3 search engines and 4 services ([#44](https://github.com/pawelmalak/flame/issues/44))
- Added option to hide applications and categories ([#48](https://github.com/pawelmalak/flame/issues/48))
- Improved Logger

### v1.4.0 (2021-06-18)
- Added more sorting options. User can now choose to sort apps and categories by name, creation time or to use custom order ([#13](https://github.com/pawelmalak/flame/issues/13))
- Added reordering functionality. User can now set custom order for apps and categories from their 'edit tables' ([#13](https://github.com/pawelmalak/flame/issues/13))
- Changed get all controllers for applications and categories to use case-insensitive ordering ([#36](https://github.com/pawelmalak/flame/issues/36))
- New apps will be placed correctly in the array depending on used sorting settings ([#37](https://github.com/pawelmalak/flame/issues/37))
- Added app version to settings with option to check for updates manually ([#38](https://github.com/pawelmalak/flame/issues/38))
- Added update check on app start ([#38](https://github.com/pawelmalak/flame/issues/38))
- Fixed bug with decimal input values in Safari browser ([#40](https://github.com/pawelmalak/flame/issues/40))

### v1.3.0 (2021-06-14)
- Added reverse proxy support ([#23](https://github.com/pawelmalak/flame/issues/23) and [#24](https://github.com/pawelmalak/flame/issues/24))
- Added support for more url formats ([#26](https://github.com/pawelmalak/flame/issues/26))
- Added ability to hide main header ([#28](https://github.com/pawelmalak/flame/issues/28))
- Fixed settings not being synchronized ([#29](https://github.com/pawelmalak/flame/issues/29))
- Added auto-refresh for greeting and date ([#34](https://github.com/pawelmalak/flame/issues/34))

### v1.2.0 (2021-06-10)
- Added simple check to the weather module settings to inform user if the api key is missing ([#2](https://github.com/pawelmalak/flame/issues/2))
- Added ability to set optional icons to the bookmarks ([#7](https://github.com/pawelmalak/flame/issues/7))
- Added option to pin new applications and categories to the homescreen by default ([#11](https://github.com/pawelmalak/flame/issues/11))
- Added background highlight while hovering over application card ([#15](https://github.com/pawelmalak/flame/issues/15))
- Created CRON job to clear old weather data from the database ([#16](https://github.com/pawelmalak/flame/issues/16))
- Added proxy for websocket instead of using hard coded host ([#18](https://github.com/pawelmalak/flame/issues/18))
- Fixed bug with overwriting opened tabs ([#20](https://github.com/pawelmalak/flame/issues/20))

### v1.1.0 (2021-06-09)
- Added custom favicon and changed page title ([#3](https://github.com/pawelmalak/flame/issues/3))
- Added functionality to set custom page title ([#3](https://github.com/pawelmalak/flame/issues/3))
- Changed messages on the homescreen when there are apps/bookmarks created but not pinned to the homescreen ([#4](https://github.com/pawelmalak/flame/issues/4))
- Added 'warnings' to apps and bookmarks forms about supported url formats ([#5](https://github.com/pawelmalak/flame/issues/5))

### v1.0.0 (2021-06-08)
Initial release of Flame - self-hosted startpage using Node.js on backend and React on frontend.

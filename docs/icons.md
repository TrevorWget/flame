# Icons

An app or bookmark icon can be:

- an [MDI](https://pictogrammers.com/library/mdi/) icon name, e.g. `book-open-outline`
- an image URL, loaded by the browser
- an uploaded file (JPEG, PNG, SVG, ICO or WebP; "Switch to custom icon upload" in the form)
- a site favicon or a [selfh.st](https://selfh.st/icons) icon downloaded by the Flame server, described below

Downloaded icons are stored in `data/uploads`, so they keep working when the site is down or blocks hotlinking, and they are included in backups.

## Fetching favicons

**Fetch icon from site**, under the icon field of the app and bookmark forms, asks the Flame server to download the site's icon: the best `<link rel="icon">` / `apple-touch-icon` on the page (the smallest one that is at least 48 px, then SVG, then the largest of the small ones), falling back to `/favicon.ico`. If the icon field holds an image URL, that image is downloaded instead. The file is stored as `data/uploads/favicon-<hash>.<ext>`.

**Settings > General > Icons**:

- **Fetch icons for apps and bookmarks saved without one** (off by default): saving an app or bookmark with an empty icon field and an http(s) URL fetches its icon. Saving waits for up to 5 seconds and keeps the item without an icon if none is found.
- **Allow fetching icons from private network addresses** (off by default): the server refuses to fetch from loopback, private (`10.x`, `172.16-31.x`, `192.168.x`, `100.64.x`), link-local (`169.254.x`, `fe80::`) and unique-local IPv6 addresses unless this is on, so turn it on for self-hosted apps such as `http://server.local:8096`. Self-signed certificates are accepted from those addresses. Multicast, `0.0.0.0` and similar addresses are always refused.
- **Prefer selfh.st icons when fetching icons** (off by default): when icons are fetched automatically, the selfh.st icon whose name matches the app or bookmark name ("Home Assistant" finds `home-assistant`) is used first, as SVG when there is one, otherwise WebP, set to [follow the theme](#colours) when it has light and dark versions. Items without a match get the site's favicon. This also works for non-web URLs such as `steam://`.

Only `http` and `https` URLs are fetched. Every redirect is checked again, downloads are limited to 1 MB and 10 seconds, and only PNG, JPEG, ICO, WebP and (sanitized) SVG files are kept. Host names are resolved by the Flame server, so `.local` (mDNS) names only work if the server or container can resolve them; use an IP address otherwise.

## selfh.st icons

**Browse selfh.st icons**, under the icon field of the app and bookmark forms, searches the [selfh.st icon collection](https://selfh.st/icons) (about 3,000 logos of self-hosted and other apps) by name and tag. Pick an icon, then its colours and format (SVG, WebP or PNG), and click **Use this icon**. While the icon field is empty, the form also suggests the icon whose name matches the app name.

### Colours

- **Automatic** (the default when the icon has light and dark versions): Flame stores the standard, light and dark versions and shows the light (white) version on dark themes and the dark (black) version on light themes. A theme counts as dark when white stands out more than black on its background colour, so this works for built-in, user and edited themes, and the icons switch as soon as the theme changes, including with automatic light/dark switching. If the icon has only one of the versions, the standard icon is shown on the other kind of theme.
- **Standard colours**, **Light (for dark themes)** or **Dark (for light themes)**: always that version, whatever the theme.

Apps and bookmarks follow the theme on the home page, in search results, on /applications and /bookmarks, and while arranging. Typing another icon, fetching one from the site or uploading one replaces the Automatic icon. Icons picked before Automatic existed keep showing as they are; when editing one that has light and dark versions, the form offers **Switch to Automatic**, which reuses the files that are already stored.

### Downloads and caching

The Flame server does all the downloading, from public addresses only and with the same limits and checks as favicons, so the browser never loads anything from the CDN:

- The icon list (`index.json` from the [selfhst/icons](https://github.com/selfhst/icons) repository, via jsDelivr with GitHub as a fallback) is cached in `data/selfhst-index.json` and refreshed in the background once a day. If it can't be refreshed, the saved list keeps working, so search works offline once the list has been downloaded.
- Picked icons are stored in `data/uploads` as `selfhst-<name>.<ext>` (`selfhst-<name>_light.<ext>` or `selfhst-<name>_dark.<ext>` for the light and dark versions). Picking a stored icon again reuses the file; after 30 days it is downloaded again, and the old copy is kept if that fails.
- Picker previews are cached in memory (at most 512 KB per preview and 16 MB in total).

### Credit and licence

The icons are by [selfh.st](https://selfh.st/icons) and licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). SVG files are sanitized when stored, which can change their markup. The logos are trademarks of their owners, used only to identify their apps. The credit is shown in the picker and in **Settings > App**.

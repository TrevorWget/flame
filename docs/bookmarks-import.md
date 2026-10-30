# Importing HTML bookmarks (experimental)

`.dev/bookmarks_importer.py` imports a browser's HTML bookmarks export (tested with Firefox) into Flame. Each bookmark folder becomes a bookmark category, and embedded favicons are saved to `data/uploads`. The script is inherited from upstream and writes straight into the database, so treat it as a one-off tool.

Requirements: Python 3 and the `Pillow`, `beautifulsoup4` and `lxml` packages.

```sh
pip3 install Pillow beautifulsoup4 lxml

# stop Flame and back up data/db.sqlite first
python3 .dev/bookmarks_importer.py --bookmarks <path to bookmarks.html> --data <path to Flame's data directory>
```

Afterwards, make sure the new files in `data/uploads` are owned by the user Flame runs as (uid 1000 by default), then start Flame again.

Known issues:

- Generated icons are sometimes incorrect.
- The script fails if the first bookmark has no icon, and a bookmark without an icon gets the icon of the bookmark before it.
- Folders are matched to existing categories by name only, so a folder named like an app category is added to that app category.

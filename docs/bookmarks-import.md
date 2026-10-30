# Importing HTML bookmarks (experimental)

`.dev/bookmarks_importer.py` imports a browser's HTML bookmarks export (tested with Firefox) into Flame. Each bookmark folder becomes a bookmark category, and embedded favicons are saved to `data/uploads`. The script is inherited from upstream and writes straight into the database, so treat it as a one-off tool.

Requirements: Python 3 and the packages in `.dev/requirements-importer.txt` (`Pillow`, `beautifulsoup4` and `lxml`).

```sh
pip3 install -r .dev/requirements-importer.txt

# stop Flame and back up data/db.sqlite first
python3 .dev/bookmarks_importer.py --bookmarks <path to bookmarks.html> --data <path to Flame's data directory>
```

Afterwards, make sure the new files in `data/uploads` are owned by the user Flame runs as (uid 1000 by default), then start Flame again.

How it works:

- A folder is added to the existing bookmark category with the same name, or to a new pinned one. App categories with the same name are left alone.
- Bookmarks outside any folder go to a category with an empty name; rename it in Flame afterwards.
- Nested folders are not kept: each bookmark goes to the category of the last folder heading above it in the file, so bookmarks listed after a subfolder end up in that subfolder's category.
- Icons are converted to PNG. Bookmarks without an icon, or with one that can't be read, get no icon.
- Running the script twice adds the bookmarks twice.

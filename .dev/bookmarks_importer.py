"""
Imports an HTML bookmarks file into Flame.
Tested only on Firefox HTML exports so far.

Stop Flame and back up data/db.sqlite before running it.

Usage:
python3 bookmarks_importer.py --bookmarks <path to bookmarks file> --data <path to flame data dir>
"""

import argparse
import base64
import binascii
import os
import re
import sqlite3
from datetime import datetime, timezone
from io import BytesIO

from bs4 import BeautifulSoup
from PIL import Image, UnidentifiedImageError

# Same format Sequelize uses for SQLite dates
TIMESTAMP = (
    datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
    + datetime.now().astimezone().strftime(' %z')
)

DATA_URI = re.compile(r'^data:image/[^;,]+;base64,', re.IGNORECASE)


def base64_to_png(codec, name, uploads_path):
    """
    Saves an icon from the bookmarks file as a PNG in uploads_path.
    Reference: https://github.com/python-pillow/Pillow/issues/3400#issuecomment-428104239

        Parameters:
            codec (str): icon in html bookmark format, e.g. 'data:image/png;base64,<image encoding>'
            name (str): bookmark name, used in the file name

        Returns:
            icon_name (str): file name of the PNG, e.g. 1636473849374--mybookmark.png (ASCII only)
            None: if the icon is not an image that could be read
    """

    if not DATA_URI.match(codec):
        return None

    try:
        byte_data = base64.b64decode(DATA_URI.sub('', codec), validate=True)
        img = Image.open(BytesIO(byte_data))
        img.load()
    except (binascii.Error, ValueError, OSError, UnidentifiedImageError):
        return None

    unix_t = str(int(datetime.now(tz=timezone.utc).timestamp() * 1000))
    base_name = unix_t + '--' + re.sub(r'[^a-z0-9_]+', '', name.lower())
    icon_name = base_name + '.png'
    suffix = 1
    while os.path.exists(os.path.join(uploads_path, icon_name)):
        icon_name = f'{base_name}-{suffix}.png'
        suffix += 1

    try:
        img.save(os.path.join(uploads_path, icon_name), 'PNG')
    except (OSError, ValueError):
        return None
    return icon_name


def add_category(cur, cat_name):
    """
    Returns the id of the bookmark category named cat_name, creating it if needed.
    App categories with the same name are left alone.
    """

    cur.execute(
        "SELECT id FROM categories WHERE name = ? AND type = 'bookmarks' ORDER BY id LIMIT 1;",
        [cat_name],
    )
    row = cur.fetchone()
    if row:
        return row[0]

    cur.execute(
        "INSERT INTO categories(name, type, isPinned, createdAt, updatedAt) VALUES (?, 'bookmarks', 1, ?, ?);",
        (cat_name, TIMESTAMP, TIMESTAMP),
    )
    return cur.lastrowid


def add_bookmark(cur, website_name, url, cat_id, icon_name):
    if icon_name is None:
        cur.execute(
            "INSERT INTO bookmarks(name, url, categoryId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?);",
            (website_name, url, cat_id, TIMESTAMP, TIMESTAMP),
        )
    else:
        cur.execute(
            "INSERT INTO bookmarks(name, url, categoryId, icon, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?);",
            (website_name, url, cat_id, icon_name, TIMESTAMP, TIMESTAMP),
        )


def import_bookmarks(bookmarks_path, data_path):
    """
    Parses an HTML bookmarks file and adds each bookmark to the category named after its folder.
    Reference: https://stackoverflow.com/questions/68621107/extracting-bookmarks-and-folder-hierarchy-from-google-chrome-with-beautifulsoup

        Returns:
            count (int): number of bookmarks added
    """

    with open(bookmarks_path, encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'lxml')

    uploads_path = os.path.join(data_path, 'uploads')
    os.makedirs(uploads_path, exist_ok=True)

    con = sqlite3.connect(os.path.join(data_path, 'db.sqlite'))
    count = 0
    try:
        cur = con.cursor()
        folder_name = ''
        for dt in soup.find_all('dt'):
            n = dt.find_next()
            if n is None:
                continue
            if n.name == 'h3':
                folder_name = n.text
                continue

            url = n.get('href')
            if not url:
                continue
            website_name = n.text
            icon = n.get('icon')

            icon_name = None
            if icon:
                icon_name = base64_to_png(icon, website_name, uploads_path)

            cat_id = add_category(cur, folder_name)
            add_bookmark(cur, website_name, url, cat_id, icon_name)
            count += 1
        con.commit()
    finally:
        con.close()
    return count


def main():
    parser = argparse.ArgumentParser(description='Import an HTML bookmarks file into Flame.')
    parser.add_argument('--bookmarks', type=str, required=True)
    parser.add_argument('--data', type=str, required=True)
    args = parser.parse_args()

    count = import_bookmarks(args.bookmarks, args.data)
    print(f'Imported {count} bookmarks')


if __name__ == '__main__':
    main()

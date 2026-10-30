"""
Tests for bookmarks_importer.py.

Run from the repository root:
python3 -m unittest discover -s .dev -p "test_*.py"
"""

import base64
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from io import BytesIO

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, 'bookmarks_importer.py')

# The columns the importer touches, as created by db/migrations
SCHEMA = """
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    isPinned TINYINT DEFAULT 0,
    createdAt DATETIME NOT NULL,
    updatedAt DATETIME NOT NULL,
    orderId INTEGER DEFAULT NULL,
    isPublic INTEGER DEFAULT 1,
    type VARCHAR(255) NOT NULL DEFAULT 'bookmarks'
);
CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(255) NOT NULL,
    categoryId INTEGER NOT NULL,
    icon VARCHAR(255) DEFAULT '',
    createdAt DATETIME NOT NULL,
    updatedAt DATETIME NOT NULL,
    isPublic INTEGER DEFAULT 1,
    orderId INTEGER DEFAULT NULL
);
"""


def png_data_uri(color):
    buf = BytesIO()
    Image.new('RGB', (16, 16), color).save(buf, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


BOOKMARKS_HTML = f"""<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks Menu</H1>
<DL><p>
    <DT><H3>Media</H3>
    <DL><p>
        <DT><A HREF="https://no-icon.example.com/">No icon</A>
        <DT><A HREF="https://red.example.com/" ICON="{png_data_uri('red')}">Red</A>
        <DT><A HREF="https://after-red.example.com/">After red</A>
        <DT><A HREF="https://broken.example.com/" ICON="data:image/png;base64,not-base64!">Broken icon</A>
        <DT><A HREF="https://garbage.example.com/" ICON="data:image/png;base64,{base64.b64encode(b'not an image').decode()}">Garbage icon</A>
    </DL><p>
    <DT><H3>Cafés</H3>
    <DL><p>
        <DT><A HREF="https://cafe.example.com/" ICON="{png_data_uri('blue')}">Café</A>
    </DL><p>
</DL>
"""


class ImporterTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = self.tmp.name
        self.db_path = os.path.join(self.data, 'db.sqlite')
        con = sqlite3.connect(self.db_path)
        con.executescript(SCHEMA)
        # An app category named like a bookmarks folder must not receive bookmarks
        con.execute(
            "INSERT INTO categories(name, type, createdAt, updatedAt) VALUES ('Media', 'apps', 'x', 'x');"
        )
        con.commit()
        con.close()

        self.bookmarks_path = os.path.join(self.data, 'bookmarks.html')
        with open(self.bookmarks_path, 'w', encoding='utf-8') as f:
            f.write(BOOKMARKS_HTML)

    def tearDown(self):
        self.tmp.cleanup()

    def run_importer(self):
        return subprocess.run(
            [sys.executable, SCRIPT, '--bookmarks', self.bookmarks_path, '--data', self.data],
            capture_output=True,
            text=True,
            encoding='utf-8',
        )

    def query(self, sql):
        con = sqlite3.connect(self.db_path)
        try:
            return con.execute(sql).fetchall()
        finally:
            con.close()

    def test_imports_when_the_first_bookmark_has_no_icon(self):
        result = self.run_importer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Imported 6 bookmarks', result.stdout)

        names = [row[0] for row in self.query('SELECT name FROM bookmarks ORDER BY id')]
        self.assertEqual(
            names, ['No icon', 'Red', 'After red', 'Broken icon', 'Garbage icon', 'Café']
        )

    def test_bookmarks_without_an_icon_do_not_inherit_one(self):
        self.run_importer()
        icons = dict(self.query('SELECT name, icon FROM bookmarks'))

        for name in ['No icon', 'After red', 'Broken icon', 'Garbage icon']:
            self.assertEqual(icons[name], '', name)

        for name in ['Red', 'Café']:
            self.assertRegex(icons[name], r'^\d+--[a-z0-9_]+\.png$')
            path = os.path.join(self.data, 'uploads', icons[name])
            self.assertTrue(os.path.isfile(path), path)
        self.assertNotEqual(icons['Red'], icons['Café'])

    def test_folders_become_bookmark_categories(self):
        self.run_importer()
        rows = self.query(
            'SELECT c.name, c.type, COUNT(b.id) FROM categories c '
            'LEFT JOIN bookmarks b ON b.categoryId = c.id GROUP BY c.id ORDER BY c.id'
        )
        self.assertEqual(
            rows, [('Media', 'apps', 0), ('Media', 'bookmarks', 5), ('Cafés', 'bookmarks', 1)]
        )


if __name__ == '__main__':
    unittest.main()

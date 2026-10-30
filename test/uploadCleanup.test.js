// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { join } = require('path');
const express = require('express');
const uploadIcon = require('../middleware/multer');

const UPLOADS_DIR = join(__dirname, '../data/uploads');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

// The icon fetching tests run in parallel and add and remove favicon-* and selfhst-* files here
const listUploads = () =>
  new Set(
    fs.readdirSync(UPLOADS_DIR).filter((name) => !/^(favicon|selfhst)-/.test(name))
  );

const waitFor = async (check) => {
  for (let i = 0; i < 50 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const withServer = async (handler, fn) => {
  const app = express();
  app.post('/', uploadIcon, handler);
  app.use((err, req, res, next) => res.status(err.statusCode || 500).end());

  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}/`);
  } finally {
    server.close();
  }
};

const postIcon = (url) => {
  const form = new FormData();
  form.append('icon', new Blob([PNG], { type: 'image/png' }), 'icon.png');
  return fetch(url, { method: 'POST', body: form });
};

test('uploaded icon is removed when the request is rejected', async () => {
  const before = listUploads();
  let filename;

  await withServer(
    (req, res) => {
      filename = req.file.filename;
      res.status(400).json({ success: false });
    },
    async (url) => assert.strictEqual((await postIcon(url)).status, 400)
  );

  assert.ok(filename);
  await waitFor(() => !fs.existsSync(join(UPLOADS_DIR, filename)));
  assert.deepStrictEqual(listUploads(), before);
});

test('uploaded icon is kept when the request succeeds', async () => {
  let filename;

  await withServer(
    (req, res) => {
      filename = req.file.filename;
      res.status(201).json({ success: true });
    },
    async (url) => assert.strictEqual((await postIcon(url)).status, 201)
  );

  const path = join(UPLOADS_DIR, filename);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(fs.existsSync(path));
  fs.unlinkSync(path);
});

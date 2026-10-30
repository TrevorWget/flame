const fs = require('fs');
const { join, basename } = require('path');
const { randomUUID } = require('crypto');
const { sequelize } = require('../../db');
const App = require('../../models/App');
const Bookmark = require('../../models/Bookmark');
const Category = require('../../models/Category');
const ErrorResponse = require('../ErrorResponse');
const loadConfig = require('../loadConfig');
const { ICON_EXTENSION_REGEX, processIcon } = require('../icons');
const { createZip, readZip } = require('./archive');
const {
  FORMAT,
  SCHEMA_VERSION,
  UPGRADES,
  SETTINGS_KEYS,
  dataSchema,
  manifestSchema,
  cssSchema,
} = require('./schema');
const Logger = require('../Logger');
const logger = new Logger();

// Relative to the working directory, like config.json and the database
const PATHS = {
  config: 'data/config.json',
  themes: 'data/themes.json',
  queries: 'data/customQueries.json',
  css: 'data/flame.css',
  publicCss: 'public/flame.css',
  uploads: 'data/uploads',
  backups: 'data/backups',
};

const MB = 1024 * 1024;

const MAX_ARCHIVE_SIZE = (Number(process.env.BACKUP_MAX_SIZE_MB) || 50) * MB;

// Same limit as icon uploads
const MAX_ICON_SIZE = 2 * MB;

const ZIP_LIMITS = { maxEntries: 5000, maxTotalSize: 512 * MB };

const ENTRY_LIMITS = new Map([
  ['manifest.json', 64 * 1024],
  ['data.json', 32 * MB],
  ['flame.css', MB],
]);

const UPLOADS_PREFIX = 'uploads/';

const BACKUP_PREFIXES = {
  scheduled: 'flame-backup',
  preRestore: 'pre-restore',
};
const BACKUP_FILE_REGEX =
  /^(flame-backup|pre-restore)-(\d{8}T\d{9}Z)(?:-(\d+))?\.zip$/;
const PRE_RESTORE_RETENTION = 5;

// New uploads are named <uuid>.<ext>, older versions kept the original file name
const isSafeUploadName = (name) =>
  name.length <= 255 &&
  !name.startsWith('.') &&
  // eslint-disable-next-line no-control-regex
  !/[/\\:*?"<>|\u0000-\u001f\u007f]/.test(name) &&
  ICON_EXTENSION_REGEX.test(name);

const getMaxEntrySize = (name) => {
  if (ENTRY_LIMITS.has(name)) return ENTRY_LIMITS.get(name);

  if (
    name.startsWith(UPLOADS_PREFIX) &&
    isSafeUploadName(name.slice(UPLOADS_PREFIX.length))
  ) {
    return MAX_ICON_SIZE;
  }

  return null;
};

// An .svg must contain an SVG and the other extensions a raster image, since
// /uploads picks the content type from the extension
const toIcon = (name, data) => {
  const icon = processIcon(data);

  if (!icon || (icon.ext === 'svg') !== /\.svg$/i.test(name)) return null;

  return icon;
};

const stamp = (date) => date.toISOString().replace(/[-:.]/g, '');

const readFileOrNull = async (path) => {
  try {
    return await fs.promises.readFile(path);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
};

const readJsonList = async (path, key) => {
  const content = await readFileOrNull(path);

  return content ? JSON.parse(content)[key] || [] : [];
};

const listUploads = async () => {
  try {
    return (await fs.promises.readdir(PATHS.uploads, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
};

const writeAtomic = async (path, data) => {
  const tmp = `${path}.${randomUUID()}.tmp`;

  try {
    await fs.promises.writeFile(tmp, data, { flag: 'wx' });
    await fs.promises.rename(tmp, path);
  } catch (err) {
    await fs.promises.rm(tmp, { force: true });
    throw err;
  }
};

/**
 * Writes every file or none: on failure the files already written get their
 * previous content back. Resolves to a function that undoes all the writes.
 */
const writeFiles = async (files) => {
  const written = [];

  const undo = async () => {
    for (const { path, original } of [...written].reverse()) {
      try {
        if (original === null) {
          await fs.promises.rm(path, { force: true });
        } else {
          await writeAtomic(path, original);
        }
      } catch (err) {
        logger.log(`Could not put back ${path}: ${err.message}`, 'ERROR');
      }
    }
  };

  try {
    for (const { path, data } of files) {
      written.push({ path, original: await readFileOrNull(path) });
      await writeAtomic(path, data);
    }
  } catch (err) {
    await undo();
    throw err;
  }

  return undo;
};

// Restores and backup files run one at a time
let queue = Promise.resolve();

const exclusive = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

/**
 * Builds a backup archive of everything but secrets: the database (apps,
 * bookmarks, categories), settings, themes, search providers, custom CSS and
 * uploaded icons.
 *
 * @returns {Promise<Buffer>}
 */
const createBackup = async (date = new Date()) => {
  const [categories, apps, bookmarks] = await sequelize.transaction(
    (transaction) =>
      Promise.all(
        [Category, App, Bookmark].map((model) =>
          model.findAll({ order: [['id', 'ASC']], transaction })
        )
      )
  );

  const categoryIds = new Set(categories.map((c) => c.id));
  const plain = (rows, label) => {
    const kept = rows.filter((row) => categoryIds.has(row.categoryId));

    // The UI never shows them and restore requires a valid category
    if (kept.length < rows.length) {
      logger.log(
        `Backup skips ${rows.length - kept.length} ${label} without a category`,
        'WARN'
      );
    }

    return kept.map((row) => row.get({ plain: true }));
  };

  const config = await loadConfig();
  const settings = {};

  for (const key of SETTINGS_KEYS) {
    if (key in config) settings[key] = config[key];
  }

  const data = {
    categories: categories.map((row) => row.get({ plain: true })),
    apps: plain(apps, 'apps'),
    bookmarks: plain(bookmarks, 'bookmarks'),
    settings,
    themes: await readJsonList(PATHS.themes, 'themes'),
    queries: await readJsonList(PATHS.queries, 'queries'),
  };

  const manifest = {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    flameVersion: process.env.VERSION,
    createdAt: date.toISOString(),
  };

  const files = [
    {
      name: 'manifest.json',
      data: Buffer.from(JSON.stringify(manifest, null, 2)),
    },
    { name: 'data.json', data: Buffer.from(JSON.stringify(data, null, 2)) },
    {
      name: 'flame.css',
      data: (await readFileOrNull(PATHS.css)) || Buffer.alloc(0),
    },
  ];

  for (const name of await listUploads()) {
    const content = isSafeUploadName(name)
      ? await fs.promises.readFile(join(PATHS.uploads, name))
      : null;

    if (!content || content.length > MAX_ICON_SIZE || !toIcon(name, content)) {
      logger.log(
        `Backup skips uploaded file ${name}: not a valid icon`,
        'WARN'
      );
      continue;
    }

    files.push({ name: `${UPLOADS_PREFIX}${name}`, data: content });
  }

  return createZip(files, date);
};

const invalid = (message) =>
  new ErrorResponse(`Invalid backup: ${message}`, 400);

const formatIssue = ({ path, message }) =>
  path.length ? `${path.join('.')}: ${message}` : message;

const parse = async (schema, value, file) => {
  const result = await schema.safeParseAsync(value);

  if (!result.success) {
    const issues = result.error.issues;
    const shown = issues.slice(0, 5).map(formatIssue).join('; ');
    const more = issues.length > 5 ? ` (and ${issues.length - 5} more)` : '';

    throw invalid(`${file}: ${shown}${more}`);
  }

  return result.data;
};

const decodeText = (files, name) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(files.get(name));
  } catch {
    throw invalid(`${name} is not UTF-8 text`);
  }
};

const parseJson = (files, name) => {
  if (!files.has(name)) {
    throw invalid(`${name} is missing`);
  }

  try {
    return JSON.parse(decodeText(files, name));
  } catch (err) {
    throw err instanceof ErrorResponse
      ? err
      : invalid(`${name} is not valid JSON`);
  }
};

/**
 * Reads and validates a backup archive without changing anything.
 * Throws an ErrorResponse (400/413) describing the first problems found.
 */
const readBackup = async (buffer) => {
  const files = await readZip(buffer, {
    ...ZIP_LIMITS,
    getMaxSize: getMaxEntrySize,
  });

  const manifest = await parse(
    manifestSchema,
    parseJson(files, 'manifest.json'),
    'manifest.json'
  );

  if (manifest.schemaVersion > SCHEMA_VERSION) {
    throw new ErrorResponse(
      `This backup was made by a newer version of Flame (backup format ${manifest.schemaVersion}, this version reads up to ${SCHEMA_VERSION}). Update Flame to restore it`,
      400
    );
  }

  let rawData = parseJson(files, 'data.json');

  for (
    let version = manifest.schemaVersion;
    version < SCHEMA_VERSION;
    version++
  ) {
    rawData = UPGRADES[version](rawData);
  }

  const { extraUrlSchemes } = await loadConfig();
  const data = await parse(dataSchema(extraUrlSchemes), rawData, 'data.json');

  const css = files.has('flame.css')
    ? await parse(cssSchema, decodeText(files, 'flame.css'), 'flame.css')
    : undefined;

  const uploads = [];

  for (const [entry, content] of files) {
    if (!entry.startsWith(UPLOADS_PREFIX)) continue;

    const name = entry.slice(UPLOADS_PREFIX.length);
    const icon = toIcon(name, content);

    if (!icon) {
      throw invalid(
        `${entry} is not a PNG, JPEG, ICO, WebP or SVG image matching its extension`
      );
    }

    uploads.push({ name, data: icon.data });
  }

  return { manifest, data, css, uploads };
};

const countCurrent = async () => ({
  categories: await Category.count(),
  apps: await App.count(),
  bookmarks: await Bookmark.count(),
  themes: (await readJsonList(PATHS.themes, 'themes')).length,
  queries: (await readJsonList(PATHS.queries, 'queries')).length,
  uploads: (await listUploads()).length,
});

/**
 * What a restore of `backup` would bring back, next to what is there now.
 * Sections missing from the backup (null) keep their current content.
 */
const previewBackup = async ({ manifest, data, css, uploads }) => ({
  manifest: {
    schemaVersion: manifest.schemaVersion,
    flameVersion: manifest.flameVersion ?? null,
    createdAt: manifest.createdAt ?? null,
  },
  backup: {
    categories: data.categories.length,
    apps: data.apps.length,
    bookmarks: data.bookmarks.length,
    themes: data.themes?.length ?? null,
    queries: data.queries?.length ?? null,
    settings: data.settings ? Object.keys(data.settings).length : null,
    css: css !== undefined,
    uploads: uploads.length,
  },
  current: await countCurrent(),
});

const pruneBackups = async (prefix, keep) => {
  const old = (await listBackupFiles())
    .filter((file) => file.name.startsWith(`${prefix}-`))
    .slice(keep);

  for (const { name } of old) {
    await fs.promises.rm(join(PATHS.backups, name), { force: true });
  }
};

const writeBackupFile = async (prefix, keep, date = new Date()) => {
  const archive = await createBackup(date);
  const slug = `${prefix}-${stamp(date)}`;

  await fs.promises.mkdir(PATHS.backups, { recursive: true });

  let path = join(PATHS.backups, `${slug}.zip`);

  for (let n = 1; (await readFileOrNull(path)) !== null; n++) {
    path = join(PATHS.backups, `${slug}-${n}.zip`);
  }

  await writeAtomic(path, archive);
  await pruneBackups(prefix, keep);

  return basename(path);
};

/**
 * Saves a backup to data/backups and deletes the oldest ones beyond `keep`.
 * Resolves to the file name.
 */
const saveBackup = (keep) =>
  exclusive(() => writeBackupFile(BACKUP_PREFIXES.scheduled, keep));

const replaceTables = async (data, transaction) => {
  const queryInterface = sequelize.getQueryInterface();
  const now = new Date();

  for (const table of ['apps', 'bookmarks', 'categories']) {
    await queryInterface.bulkDelete(table, {}, { transaction });
  }

  for (const [table, items] of [
    ['categories', data.categories],
    ['apps', data.apps],
    ['bookmarks', data.bookmarks],
  ]) {
    for (let i = 0; i < items.length; i += 500) {
      const rows = items.slice(i, i + 500).map((item) => ({
        ...item,
        createdAt: item.createdAt ?? now,
        updatedAt: item.updatedAt ?? now,
      }));

      await queryInterface.bulkInsert(table, rows, { transaction });
    }
  }
};

/**
 * Replaces the current state with a backup from readBackup(). A backup of the
 * current state is saved to data/backups first. The database and files are
 * changed all together or, if anything fails, not at all.
 *
 * Resolves to the name of the pre-restore backup.
 */
const restoreBackup = ({ data, css, uploads }) =>
  exclusive(async () => {
    const preRestoreBackup = await writeBackupFile(
      BACKUP_PREFIXES.preRestore,
      PRE_RESTORE_RETENTION
    );

    const files = [];

    if (data.settings) {
      // Settings the backup doesn't have, like the weather API key, are kept
      const config = await loadConfig();

      files.push({
        path: PATHS.config,
        data: JSON.stringify({ ...config, ...data.settings }),
      });
    }

    if (data.themes) {
      files.push({
        path: PATHS.themes,
        data: JSON.stringify({ themes: data.themes }),
      });
    }

    if (data.queries) {
      files.push({
        path: PATHS.queries,
        data: JSON.stringify({ queries: data.queries }),
      });
    }

    if (css !== undefined) {
      files.push({ path: PATHS.css, data: css });
    }

    for (const { name, data: content } of uploads) {
      files.push({ path: join(PATHS.uploads, name), data: content });
    }

    await fs.promises.mkdir(PATHS.uploads, { recursive: true });

    let undoFiles = null;

    try {
      await sequelize.transaction(async (transaction) => {
        await replaceTables(data, transaction);
        undoFiles = await writeFiles(files);
      });
    } catch (err) {
      if (undoFiles) await undoFiles();
      throw err;
    }

    if (css !== undefined) {
      // In the Docker image public/flame.css is a symlink in a read-only
      // directory, so it is written through instead of replaced
      try {
        await fs.promises.writeFile(PATHS.publicCss, css);
      } catch (err) {
        logger.log(
          `Restored custom CSS applies after a restart: ${err.message}`,
          'WARN'
        );
      }
    }

    return preRestoreBackup;
  });

const listBackupFiles = async () => {
  let names;

  try {
    names = await fs.promises.readdir(PATHS.backups);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const files = [];

  for (const name of names.filter((n) => BACKUP_FILE_REGEX.test(n))) {
    const stats = await fs.promises.stat(join(PATHS.backups, name));

    if (!stats.isFile()) continue;

    files.push({
      name,
      kind: name.startsWith(`${BACKUP_PREFIXES.preRestore}-`)
        ? 'pre-restore'
        : 'scheduled',
      size: stats.size,
      createdAt: stats.mtime,
    });
  }

  // Newest first, by the time in the name (mtime changes when files are copied)
  const sortKey = (name) => {
    const [, , time, n = '0'] = BACKUP_FILE_REGEX.exec(name);
    return `${time}-${n.padStart(6, '0')}`;
  };

  return files.sort((a, b) => (sortKey(a.name) < sortKey(b.name) ? 1 : -1));
};

const getBackupFilePath = (name) =>
  BACKUP_FILE_REGEX.test(name) ? join(PATHS.backups, name) : null;

module.exports = {
  MAX_ARCHIVE_SIZE,
  createBackup,
  readBackup,
  previewBackup,
  restoreBackup,
  saveBackup,
  listBackupFiles,
  getBackupFilePath,
  stamp,
};

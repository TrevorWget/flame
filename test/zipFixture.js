// Builds zip archives byte by byte, so tests can create entries that zip
// libraries refuse to write (path traversal, symlinks, wrong sizes, ...)
const zlib = require('zlib');

const S_IFREG = 0o100644;
const UTF8_FLAG = 0x0800;

/**
 * @param {{
 *   name: string,
 *   data: Buffer | string,
 *   mode?: number,        // unix mode, e.g. 0o120777 for a symlink
 *   flags?: number,       // general purpose bit flag, bit 0 = encrypted
 *   declaredSize?: number // uncompressed size written to the headers
 * }[]} entries
 */
const buildZip = (entries) => {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.data);
    const compressed = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const size = entry.declaredSize ?? data.length;
    const flags = entry.flags ?? UTF8_FLAG;
    const mode = entry.mode ?? S_IFREG;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE((3 << 8) | 20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(flags, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0x21, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(size, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE((mode << 16) >>> 0, 38);
    header.writeUInt32LE(offset, 42);

    parts.push(local, name, compressed);
    central.push(header, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...parts, centralDirectory, end]);
};

const manifest = (overrides = {}) =>
  JSON.stringify({
    format: 'flame-backup',
    schemaVersion: 1,
    flameVersion: '2.5.0',
    createdAt: '2026-10-29T12:00:00.000Z',
    ...overrides,
  });

/**
 * A backup archive with `data` as data.json; `extra` entries are appended.
 */
const buildBackup = ({ data, manifest: manifestOverrides, extra = [] }) =>
  buildZip([
    { name: 'manifest.json', data: manifest(manifestOverrides) },
    { name: 'data.json', data: JSON.stringify(data) },
    ...extra,
  ]);

/**
 * Reads every entry of a zip with yauzl directly, independent of Flame's reader.
 * @returns {Promise<Map<string, Buffer>>}
 */
const unzip = async (buffer) => {
  const yauzl = require('yauzl');
  const zip = await yauzl.fromBufferPromise(buffer, { lazyEntries: true });
  const files = new Map();

  await new Promise((resolve, reject) => {
    zip.on('entry', async (entry) => {
      try {
        const chunks = [];
        for await (const chunk of await zip.openReadStreamPromise(entry)) {
          chunks.push(chunk);
        }
        files.set(entry.fileName, Buffer.concat(chunks));
        zip.readEntry();
      } catch (err) {
        reject(err);
      }
    });
    zip.on('end', resolve);
    zip.on('error', reject);
    zip.readEntry();
  });

  return files;
};

module.exports = { buildZip, buildBackup, unzip };

const yazl = require('yazl');
const yauzl = require('yauzl');
const ErrorResponse = require('../ErrorResponse');

const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;

const invalid = (message, statusCode = 400) =>
  new ErrorResponse(`Invalid backup: ${message}`, statusCode);

/**
 * @param {{ name: string, data: Buffer }[]} files
 * @returns {Promise<Buffer>}
 */
const createZip = (files, mtime = new Date()) =>
  new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const chunks = [];

    zip.outputStream
      .on('data', (chunk) => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);

    for (const { name, data } of files) {
      zip.addBuffer(data, name, { mtime, mode: 0o100644 });
    }

    zip.end();
  });

const readStream = (stream, maxSize) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    stream.on('data', (chunk) => {
      size += chunk.length;

      // validateEntrySizes already caps the stream at the declared size; this
      // only guards against a future change of that option
      if (size > maxSize) {
        stream.destroy(invalid('an entry is larger than declared', 413));
        return;
      }

      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });

/**
 * Reads a zip archive held in memory. Every entry must be a regular file
 * whose name `getMaxSize(name)` accepts (it returns the entry's size limit,
 * or null for names that are not allowed). Names with "..", absolute paths
 * and backslashes are rejected by yauzl itself.
 *
 * @returns {Promise<Map<string, Buffer>>}
 */
const readZip = async (buffer, { getMaxSize, maxEntries, maxTotalSize }) => {
  let zip;

  try {
    zip = await yauzl.fromBufferPromise(buffer, {
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });
  } catch (err) {
    throw invalid(`not a valid zip file (${err.message})`);
  }

  if (zip.entryCount > maxEntries) {
    throw invalid(`more than ${maxEntries} files`, 413);
  }

  const files = new Map();
  let totalSize = 0;

  const readEntry = async (entry) => {
    const { fileName } = entry;
    const type = (entry.externalFileAttributes >>> 16) & S_IFMT;

    if (fileName.endsWith('/')) {
      if (type && type !== S_IFDIR) {
        throw invalid(`${fileName} is not a directory`);
      }

      return;
    }

    if (type && type !== S_IFREG) {
      throw invalid(`${fileName} is not a regular file`);
    }

    if (entry.isEncrypted()) {
      throw invalid(`${fileName} is encrypted`);
    }

    if (files.has(fileName)) {
      throw invalid(`${fileName} appears more than once`);
    }

    const maxSize = getMaxSize(fileName);

    if (maxSize === null) {
      throw invalid(`unexpected file ${fileName}`);
    }

    if (entry.uncompressedSize > maxSize) {
      throw invalid(`${fileName} is larger than ${maxSize} bytes`, 413);
    }

    totalSize += entry.uncompressedSize;

    if (totalSize > maxTotalSize) {
      throw invalid(`contents are larger than ${maxTotalSize} bytes`, 413);
    }

    try {
      files.set(
        fileName,
        await readStream(await zip.openReadStreamPromise(entry), maxSize)
      );
    } catch (err) {
      throw err instanceof ErrorResponse
        ? err
        : invalid(`could not read ${fileName} (${err.message})`);
    }
  };

  await new Promise((resolve, reject) => {
    zip.on('entry', (entry) =>
      readEntry(entry).then(() => zip.readEntry(), reject)
    );
    zip.on('end', resolve);
    zip.on('error', (err) => reject(invalid(err.message)));
    zip.readEntry();
  });

  return files;
};

module.exports = { createZip, readZip };

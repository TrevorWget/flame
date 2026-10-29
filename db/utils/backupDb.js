const fs = require('fs');
const { join } = require('path');
const { slugify } = require('./slugify');

const backupDir = 'data/db_backups';
const srcPath = 'data/db.sqlite';

// Throws instead of skipping: migrations must not run without a backup
const backupDB = (date = new Date()) => {
  fs.mkdirSync(backupDir, { recursive: true });

  const slug = slugify(date);
  let destPath = join(backupDir, slug);

  for (let n = 1; fs.existsSync(destPath); n++) {
    destPath = join(backupDir, slug.replace(/\.sqlite$/, `-${n}.sqlite`));
  }

  fs.copyFileSync(srcPath, destPath, fs.constants.COPYFILE_EXCL);

  return destPath;
};

module.exports = backupDB;

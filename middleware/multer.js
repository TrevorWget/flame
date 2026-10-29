const fs = require('fs');
const { join } = require('path');
const { randomUUID } = require('crypto');
const multer = require('multer');
const ErrorResponse = require('../utils/ErrorResponse');
const { processIcon } = require('../utils/icons');

const UPLOADS_DIR = join(__dirname, '../data/uploads');
const MAX_ICON_SIZE_MB = 2;

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ICON_SIZE_MB * 1024 * 1024, files: 1 },
}).single('icon');

const uploadIcon = (req, res, next) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return next(
        err.code === 'LIMIT_FILE_SIZE'
          ? new ErrorResponse(`Icon must be ${MAX_ICON_SIZE_MB} MB or smaller`, 413)
          : new ErrorResponse(err.message, 400)
      );
    }

    if (err) {
      return next(err);
    }

    if (!req.file) {
      return next();
    }

    const icon = processIcon(req.file.buffer);

    if (!icon) {
      return next(
        new ErrorResponse('Icon must be a PNG, JPEG, ICO, WebP or SVG image', 400)
      );
    }

    try {
      const filename = `${randomUUID()}.${icon.ext}`;
      await fs.promises.writeFile(join(UPLOADS_DIR, filename), icon.data, {
        flag: 'wx',
      });

      req.file.filename = filename;
      delete req.file.buffer;
      next();
    } catch (e) {
      next(e);
    }
  });
};

module.exports = uploadIcon;

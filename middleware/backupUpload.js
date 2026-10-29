const multer = require('multer');
const ErrorResponse = require('../utils/ErrorResponse');
const { MAX_ARCHIVE_SIZE } = require('../utils/backup');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ARCHIVE_SIZE, files: 1, fields: 0, parts: 1 },
}).single('backup');

// Accepts a single backup archive in the "backup" field, kept in memory
const backupUpload = (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return next(
        err.code === 'LIMIT_FILE_SIZE'
          ? new ErrorResponse(
              `Backup must be ${
                MAX_ARCHIVE_SIZE / 1024 / 1024
              } MB or smaller (BACKUP_MAX_SIZE_MB)`,
              413
            )
          : new ErrorResponse(err.message, 400)
      );
    }

    if (err) {
      return next(err);
    }

    if (!req.file) {
      return next(new ErrorResponse('Choose a backup file to restore', 400));
    }

    next();
  });
};

module.exports = backupUpload;

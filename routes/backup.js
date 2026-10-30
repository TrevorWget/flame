const express = require('express');
const router = express.Router();

// middleware
const { auth, requireAuth, validate } = require('../middleware');
const backupUpload = require('../middleware/backupUpload');
const { backup: schemas } = require('../validation');

const {
  exportBackup,
  previewRestore,
  restoreBackup,
  getBackupFiles,
  downloadBackupFile,
} = require('../controllers/backup');

// Authenticate before reading uploads, so anonymous requests never buffer an archive
router.use(auth, requireAuth);

router.route('/export').get(exportBackup);

router.route('/restore/preview').post(backupUpload, previewRestore);

router.route('/restore').post(backupUpload, restoreBackup);

router.route('/files').get(getBackupFiles);

router
  .route('/files/:name')
  .get(validate(schemas.downloadFile), downloadBackupFile);

module.exports = router;

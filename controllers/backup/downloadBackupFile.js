const { resolve } = require('path');
const ErrorResponse = require('../../utils/ErrorResponse');
const { getBackupFilePath } = require('../../utils/backup');

// @desc      Download a backup saved in data/backups
// @route     GET /api/backup/files/:name
// @access    Private
const downloadBackupFile = (req, res, next) => {
  const notFound = () =>
    next(new ErrorResponse(`Backup ${req.params.name} was not found`, 404));

  const path = getBackupFilePath(req.params.name);

  if (!path) return notFound();

  res.set('Cache-Control', 'no-store');
  res.download(resolve(path), req.params.name, (err) => {
    if (err && !res.headersSent) notFound();
  });
};

module.exports = downloadBackupFile;

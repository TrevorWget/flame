const asyncWrapper = require('../../middleware/asyncWrapper');
const { listBackupFiles } = require('../../utils/backup');

// @desc      List the backups saved in data/backups
// @route     GET /api/backup/files
// @access    Private
const getBackupFiles = asyncWrapper(async (req, res, next) => {
  res.status(200).json({
    success: true,
    data: await listBackupFiles(),
  });
});

module.exports = getBackupFiles;

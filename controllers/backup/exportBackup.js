const asyncWrapper = require('../../middleware/asyncWrapper');
const { createBackup, stamp } = require('../../utils/backup');

// @desc      Download a backup of everything but secrets
// @route     GET /api/backup/export
// @access    Private
const exportBackup = asyncWrapper(async (req, res, next) => {
  const date = new Date();
  const archive = await createBackup(date);

  res.attachment(`flame-backup-${stamp(date)}.zip`);
  res.set('Cache-Control', 'no-store');
  res.status(200).send(archive);
});

module.exports = exportBackup;

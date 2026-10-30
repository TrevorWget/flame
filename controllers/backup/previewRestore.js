const asyncWrapper = require('../../middleware/asyncWrapper');
const { readBackup, previewBackup } = require('../../utils/backup');

// @desc      Validate a backup and count what restoring it would bring back
// @route     POST /api/backup/restore/preview
// @access    Private
const previewRestore = asyncWrapper(async (req, res, next) => {
  const backup = await readBackup(req.file.buffer);

  res.status(200).json({
    success: true,
    data: await previewBackup(backup),
  });
});

module.exports = previewRestore;

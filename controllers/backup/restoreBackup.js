const asyncWrapper = require('../../middleware/asyncWrapper');
const backups = require('../../utils/backup');
const { syncBackupJobs } = require('../../utils/backupJobs');
const { syncIntegrations } = require('../../utils/integrationSync');
const { syncWeatherJobs } = require('../../utils/weatherJobs');

// @desc      Replace apps, bookmarks, categories, settings, themes, search
//            providers, custom CSS and icons with a backup
// @route     POST /api/backup/restore
// @access    Private
const restoreBackup = asyncWrapper(async (req, res, next) => {
  const backup = await backups.readBackup(req.file.buffer);
  const preRestoreBackup = await backups.restoreBackup(backup);

  await syncWeatherJobs();
  await syncBackupJobs();

  res.status(200).json({
    success: true,
    data: { preRestoreBackup },
  });

  syncIntegrations();
});

module.exports = restoreBackup;

const { syncWeatherJobs } = require('./weatherJobs');
const { syncBackupJobs } = require('./backupJobs');

module.exports = async function () {
  await syncWeatherJobs();
  await syncBackupJobs();
};

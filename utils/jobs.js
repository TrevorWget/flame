const { syncWeatherJobs } = require('./weatherJobs');

module.exports = async function () {
  await syncWeatherJobs();
};

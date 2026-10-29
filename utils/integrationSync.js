const schedule = require('node-schedule');
const { useDocker, useKubernetes } = require('../controllers/apps/docker');
const { streamContainerEvents } = require('../controllers/apps/docker/dockerApi');
const loadConfig = require('./loadConfig');
const Logger = require('./Logger');
const logger = new Logger();

const SYNC_JOB = 'syncIntegrations';
const SYNC_SCHEDULE = '*/30 * * * * *';
const EVENT_DEBOUNCE_MS = 1000;

let running = null;
let rerun = false;

let dockerEvents = null;
let lastEventsError = null;
let debounceTimer = null;

const scheduleSync = () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(syncIntegrations, EVENT_DEBOUNCE_MS);
};

const stopDockerEvents = () => {
  if (dockerEvents) {
    dockerEvents.controller.abort();
    dockerEvents = null;
  }
};

// Keeps one Docker events stream open while the integration is enabled. A
// dropped stream is reopened by the next scheduled sync, which also covers
// hosts that don't support events.
const watchDockerEvents = ({ dockerApps, dockerHost }) => {
  if (!dockerApps) {
    return stopDockerEvents();
  }

  if (dockerEvents && dockerEvents.host === dockerHost) {
    return;
  }

  stopDockerEvents();

  const current = { host: dockerHost, controller: new AbortController() };
  dockerEvents = current;

  streamContainerEvents(dockerHost, current.controller.signal)
    .then((stream) => {
      lastEventsError = null;

      const release = () => {
        if (dockerEvents === current) {
          dockerEvents = null;
        }
      };

      // The API only sends the filtered container events, one JSON object per line
      stream.on('data', scheduleSync);
      stream.on('error', release);
      stream.on('close', release);
    })
    .catch((err) => {
      if (dockerEvents === current) {
        dockerEvents = null;
      }

      if (!current.controller.signal.aborted && err.message !== lastEventsError) {
        lastEventsError = err.message;
        logger.log(
          `Docker events unavailable on ${dockerHost}, apps will be synced every 30 seconds: ${err.message}`,
          'WARN'
        );
      }
    });
};

const runSync = async () => {
  const config = await loadConfig();

  watchDockerEvents(config);

  if (config.dockerApps) {
    await useDocker();
  }

  if (config.kubernetesApps) {
    await useKubernetes();
  }
};

// Runs are serialized; requests made during a run trigger one more run after it
const syncIntegrations = () => {
  if (running) {
    rerun = true;
    return running;
  }

  running = (async () => {
    try {
      do {
        rerun = false;

        try {
          await runSync();
        } catch (err) {
          logger.log(`Integration sync failed: ${err.message}`, 'ERROR');
        }
      } while (rerun);
    } finally {
      running = null;
    }
  })();

  return running;
};

const startIntegrationSync = () => {
  if (!schedule.scheduledJobs[SYNC_JOB]) {
    schedule.scheduleJob(SYNC_JOB, SYNC_SCHEDULE, () => syncIntegrations());
  }

  return syncIntegrations();
};

module.exports = {
  startIntegrationSync,
  syncIntegrations,
};

const axios = require('axios');
const https = require('https');
const App = require('../models/App');
const { listAllContainers } = require('../controllers/apps/docker/dockerApi');
const { toHttpUrl } = require('./urlSchemes');
const loadConfig = require('./loadConfig');
const Logger = require('./Logger');
const logger = new Logger();

const CONCURRENCY = 8;
const RETRY_INTERVAL = 60;

// Self-signed certificates are common on home networks. A check never sends
// credentials and only reads the status code, so certificates aren't verified.
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// appId -> { status: 'up' | 'unhealthy' | 'down', detail, since }
let statuses = new Map();

let timer = null;
let running = null;
let rerun = false;
let lastDockerError = null;

// up: the app answers normally. unhealthy: it answers, but with a server
// error or slowly, or its container is restarting or failing its health
// check. down: no answer at all, or its container isn't running.
const up = (detail) => ({ status: 'up', detail });
const unhealthy = (detail) => ({ status: 'unhealthy', detail });
const down = (detail) => ({ status: 'down', detail });

// Error messages can contain internal addresses and are shown to guests, so
// only a fixed description is kept
const describeError = (err, timeoutSeconds) => {
  switch (err.code) {
    case 'ERR_CANCELED':
    case 'ECONNABORTED':
    case 'ETIMEDOUT':
      return `Timed out after ${timeoutSeconds} s`;
    case 'ECONNREFUSED':
      return 'Connection refused';
    case 'ECONNRESET':
      return 'Connection reset';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'Host not found';
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return 'Host unreachable';
    default:
      return 'Unreachable';
  }
};

const formatSeconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

// Any answer below 500 means the service is up: redirects to a login page and
// 401/403 are normal for apps behind auth. The response time is measured up to
// the response headers; slowSeconds 0 turns the slow check off.
const checkHttp = async (url, timeoutSeconds, slowSeconds = 0) => {
  const timeout = timeoutSeconds * 1000;
  const started = performance.now();

  try {
    const res = await axios.get(url, {
      httpsAgent,
      timeout,
      signal: AbortSignal.timeout(timeout),
      maxRedirects: 0,
      responseType: 'stream',
      validateStatus: () => true,
      headers: { 'User-Agent': 'Flame status check', Accept: '*/*' },
    });

    const elapsed = performance.now() - started;
    res.data.destroy();

    if (res.status >= 500) {
      return unhealthy(`HTTP ${res.status}`);
    }

    if (slowSeconds > 0 && elapsed > slowSeconds * 1000) {
      return unhealthy(`Slow: HTTP ${res.status} in ${formatSeconds(elapsed)}`);
    }

    return up(`HTTP ${res.status}`);
  } catch (err) {
    return down(describeError(err, timeoutSeconds));
  }
};

// State is created, running, paused, restarting, removing, exited or dead.
// Status is text like "Up 2 hours (healthy)" or "Up 5 seconds (health: starting)".
const containerStatus = (container) => {
  const { State, Status = '' } = container;

  // A restart loop usually means a crashing app that is about to come back
  if (State === 'restarting') {
    return unhealthy('Container restarting');
  }

  if (State !== 'running') {
    return down(`Container ${State}`);
  }

  if (Status.includes('(unhealthy)')) {
    return unhealthy('Container unhealthy');
  }

  if (Status.includes('(health: starting)')) {
    return unhealthy('Container starting');
  }

  return up(
    Status.includes('(healthy)')
      ? 'Container running (healthy)'
      : 'Container running'
  );
};

// "qBittorrent", "qbittorrent" and "q-bittorrent" all match
const normalizeName = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

// Multi-container apps usually call their web container <app>-server,
// <app>_server-1 and so on, next to <app>-worker, <app>-db...
const MAIN_SUFFIXES = ['server', 'web', 'webserver', 'app', 'frontend'];
const MAIN_NAME = new RegExp(
  `^(.+?)[-_.](?:${MAIN_SUFFIXES.join('|')})(?:[-_.]\\d+)?$`
);

const mainContainerKeys = (container) => {
  const labels = container.Labels || {};
  const keys = new Set();

  for (const name of container.Names || []) {
    const match = name.replace(/^\//, '').toLowerCase().match(MAIN_NAME);
    if (match) keys.add(normalizeName(match[1]));
  }

  const project = labels['com.docker.compose.project'];
  const service = (labels['com.docker.compose.service'] || '').toLowerCase();

  if (project && MAIN_SUFFIXES.includes(service)) {
    keys.add(normalizeName(project));
  }

  keys.delete('');
  return keys;
};

/**
 * Returns a function that finds the container of an app, or null. Apps from
 * the Docker integration are named after their flame.name label (one
 * container can define several apps); other apps match a container named
 * like them, a Compose service name that only one container uses, or the
 * main container of a multi-container app (authentik-server for Authentik).
 */
const containerFinder = (containers) => {
  const byLabel = new Map();
  const byName = new Map();
  const byService = new Map();
  const byMain = new Map();

  // A running container wins over stopped duplicates
  const addLabel = (name, container) => {
    const existing = byLabel.get(name);

    if (!existing || (existing.State !== 'running' && container.State === 'running')) {
      byLabel.set(name, container);
    }
  };

  for (const container of containers) {
    const labels = container.Labels || {};

    if (labels['flame.name']) {
      for (const name of labels['flame.name'].split(';')) {
        addLabel(name, container);
      }
    }

    for (const name of container.Names || []) {
      const key = normalizeName(name);
      if (key) byName.set(key, container);
    }

    const service = normalizeName(labels['com.docker.compose.service'] || '');

    if (service) {
      // Services like "db" or "server" exist in many projects
      byService.set(service, byService.has(service) ? null : container);
    }

    for (const key of mainContainerKeys(container)) {
      // Two candidates, e.g. immich-server and immich-web, match neither
      const existing = byMain.get(key);
      byMain.set(key, existing === undefined || existing === container ? container : null);
    }
  }

  return (app) => {
    const key = normalizeName(app.name);

    return (
      byLabel.get(app.name) ||
      byName.get(key) ||
      byService.get(key) ||
      byMain.get(key) ||
      null
    );
  };
};

const mapLimit = async (items, limit, fn) => {
  const results = new Array(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

  return results;
};

const loadContainers = async (dockerHost) => {
  try {
    const findContainer = containerFinder(await listAllContainers(dockerHost));
    lastDockerError = null;

    return findContainer;
  } catch (err) {
    if (err.message !== lastDockerError) {
      lastDockerError = err.message;
      logger.log(
        `Status checks can't read container states from ${dockerHost}: ${err.message}`,
        'WARN'
      );
    }

    return null;
  }
};

// Returns the seconds until the next run, or null when checks are disabled
const runChecks = async () => {
  const config = await loadConfig();

  if (!config.statusChecks) {
    statuses = new Map();
    return null;
  }

  const apps = (await App.findAll()).filter((app) => app.statusCheck);

  // The container state replaces the HTTP check of every app whose container
  // is found, manual apps included, unless the app has a check URL. Apps
  // without a container, or all of them when the Docker API can't be
  // reached, get the HTTP check.
  const mayUseContainer = (app) =>
    config.statusCheckDocker && config.dockerApps && !app.statusUrl;

  const findContainer = apps.some(mayUseContainer)
    ? await loadContainers(config.dockerHost)
    : null;

  const results = await mapLimit(apps, CONCURRENCY, async (app) => {
    const container =
      findContainer && mayUseContainer(app) ? findContainer(app) : null;

    if (container) {
      return containerStatus(container);
    }

    const url = toHttpUrl(app.statusUrl || app.url);

    // Links like ssh:// or steam:// can't be checked
    return url
      ? checkHttp(url, config.statusCheckTimeout, config.statusCheckSlow)
      : null;
  });

  const now = new Date().toISOString();
  const next = new Map();

  apps.forEach((app, i) => {
    const result = results[i];

    if (!result) return;

    const previous = statuses.get(app.id);
    const since =
      previous && previous.status === result.status ? previous.since : now;

    next.set(app.id, { ...result, since });
  });

  statuses = next;

  return config.statusCheckInterval;
};

const scheduleNext = (seconds) => {
  clearTimeout(timer);
  timer = setTimeout(runStatusChecks, seconds * 1000);
  // Never keeps the process (or a test run) alive on its own
  timer.unref();
};

// Runs are serialized; a request during a run (e.g. a settings change)
// triggers one more run after it. Every run reschedules the next one, so
// interval changes apply immediately.
const runStatusChecks = () => {
  if (running) {
    rerun = true;
    return running;
  }

  clearTimeout(timer);
  timer = null;

  running = (async () => {
    let nextRun = null;

    try {
      do {
        rerun = false;

        try {
          nextRun = await runChecks();
        } catch (err) {
          logger.log(`Status checks failed: ${err.message}`, 'ERROR');
          nextRun = RETRY_INTERVAL;
        }
      } while (rerun);
    } finally {
      running = null;

      if (nextRun) {
        scheduleNext(nextRun);
      }
    }
  })();

  return running;
};

const getStatuses = () => statuses;

module.exports = {
  runStatusChecks,
  getStatuses,
  checkHttp,
  containerStatus,
  containerFinder,
};

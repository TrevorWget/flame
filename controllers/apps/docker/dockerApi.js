const axios = require('axios');
const https = require('https');
const { parseDockerHost, loadTlsOptions } = require('./dockerHost');

const REQUEST_TIMEOUT = 10000;
const CONTAINER_EVENTS = ['start', 'die', 'destroy', 'pause', 'unpause'];

let tlsAgent = null;
let tlsAgentKey = null;

const getTlsAgent = () => {
  const options = loadTlsOptions();
  const key = [options.ca, options.cert, options.key].map((b) => (b ? b.toString('base64') : '')).join('|');

  if (key !== tlsAgentKey) {
    tlsAgent = new https.Agent({ ...options, keepAlive: true });
    tlsAgentKey = key;
  }

  return tlsAgent;
};

const connectionOptions = (host) => {
  const target = parseDockerHost(host);

  if (target.type === 'socket') {
    return { baseURL: 'http://docker', socketPath: target.socketPath, maxRedirects: 0 };
  }

  return {
    baseURL: target.baseURL,
    maxRedirects: 0,
    ...(target.tls ? { httpsAgent: getTlsAgent() } : {}),
  };
};

const listRunningContainers = async (host) => {
  const { data } = await axios.get('/containers/json', {
    ...connectionOptions(host),
    params: { filters: JSON.stringify({ status: ['running'] }) },
    timeout: REQUEST_TIMEOUT,
  });

  return data;
};

// Stopped containers included, so the status indicators can show them as down
const listAllContainers = async (host) => {
  const { data } = await axios.get('/containers/json', {
    ...connectionOptions(host),
    params: { all: 1 },
    timeout: REQUEST_TIMEOUT,
  });

  return data;
};

// Resolves with a readable stream of newline-delimited JSON events; abort with `signal`.
// The timeout only covers connecting, an idle stream stays open.
const streamContainerEvents = async (host, signal) => {
  const options = connectionOptions(host);
  const controller = new AbortController();
  const abort = () => controller.abort();
  const connectTimer = setTimeout(abort, REQUEST_TIMEOUT);

  signal.addEventListener('abort', abort, { once: true });

  try {
    const { data } = await axios.get('/events', {
      ...options,
      params: {
        filters: JSON.stringify({ type: ['container'], event: CONTAINER_EVENTS }),
      },
      responseType: 'stream',
      signal: controller.signal,
    });

    return data;
  } finally {
    clearTimeout(connectTimer);
  }
};

module.exports = {
  listRunningContainers,
  listAllContainers,
  streamContainerEvents,
};

const axios = require('axios');

const REQUEST_TIMEOUT = 10000;
const CONTAINER_EVENTS = ['start', 'die', 'destroy', 'pause', 'unpause'];

const connectionOptions = (host) =>
  host.includes('localhost')
    ? { baseURL: `http://${host}`, socketPath: '/var/run/docker.sock' }
    : { baseURL: `http://${host}` };

const listRunningContainers = async (host) => {
  const { data } = await axios.get('/containers/json', {
    ...connectionOptions(host),
    params: { filters: JSON.stringify({ status: ['running'] }) },
    timeout: REQUEST_TIMEOUT,
  });

  return data;
};

// Resolves with a readable stream of newline-delimited JSON events; abort with `signal`
const streamContainerEvents = async (host, signal) => {
  const { data } = await axios.get('/events', {
    ...connectionOptions(host),
    params: {
      filters: JSON.stringify({ type: ['container'], event: CONTAINER_EVENTS }),
    },
    responseType: 'stream',
    signal,
  });

  return data;
};

module.exports = {
  listRunningContainers,
  streamContainerEvents,
};

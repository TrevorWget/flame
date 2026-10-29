const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_SOCKET = '/var/run/docker.sock';

const isTlsEnabled = (env) =>
  (env.DOCKER_TLS_VERIFY !== undefined && env.DOCKER_TLS_VERIFY !== '' && env.DOCKER_TLS_VERIFY !== '0') ||
  Boolean(env.DOCKER_CERT_PATH);

// Parses the `dockerHost` setting into connection details. Accepted forms:
//   unix:///var/run/docker.sock       local socket (also the legacy `localhost` value)
//   npipe:////./pipe/docker_engine    Windows named pipe
//   tcp://host:2375 / host:2375       TCP; TLS when DOCKER_TLS_VERIFY=1 or DOCKER_CERT_PATH is set
//   http://host:2375, https://host:2376
// Throws on anything else, so the setting can only point at a Docker API root.
const parseDockerHost = (value, env = process.env) => {
  const input = typeof value === 'string' ? value.trim() : '';

  if (input === '' || /^localhost(:\d+)?$/i.test(input)) {
    return { type: 'socket', socketPath: DEFAULT_SOCKET, label: `unix://${DEFAULT_SOCKET}` };
  }

  const scheme = /^([a-z]+):\/\//i.exec(input);

  if (scheme) {
    const name = scheme[1].toLowerCase();
    const rest = input.slice(scheme[0].length);

    if (name === 'unix') {
      if (!rest.startsWith('/') || /[\0?#]/.test(rest)) {
        throw new Error('unix:// needs an absolute socket path, e.g. unix:///var/run/docker.sock');
      }
      return { type: 'socket', socketPath: rest, label: input };
    }

    if (name === 'npipe') {
      const pipe = rest.replace(/\//g, '\\');
      if (!/^\\\\\.\\pipe\\[^\\]+$/.test(pipe)) {
        throw new Error('npipe:// needs a pipe path, e.g. npipe:////./pipe/docker_engine');
      }
      return { type: 'socket', socketPath: pipe, label: input };
    }

    if (!['tcp', 'http', 'https'].includes(name)) {
      throw new Error(`Unsupported Docker host scheme "${name}://"; use unix://, npipe://, tcp://, http:// or https://`);
    }
  }

  const name = scheme ? scheme[1].toLowerCase() : 'tcp';
  const tls = name === 'https' || (name === 'tcp' && isTlsEnabled(env));
  const authority = scheme ? input.slice(scheme[0].length) : input;

  let url;
  try {
    url = new URL(`${tls ? 'https' : 'http'}://${authority}`);
  } catch {
    throw new Error(`"${input}" is not a valid Docker host`);
  }

  if (
    !url.hostname ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new Error('Docker host must be just host[:port], without credentials or a path');
  }

  const port = url.port || (tls ? '2376' : '2375');
  const baseURL = `${url.protocol}//${url.hostname}:${port}`;

  return { type: 'tcp', tls, baseURL, label: baseURL };
};

// ca.pem / cert.pem / key.pem from DOCKER_CERT_PATH (default ~/.docker), as for the docker CLI.
// The server certificate is always verified; ca.pem replaces the system CAs when present.
const loadTlsOptions = (env = process.env) => {
  const certPath = env.DOCKER_CERT_PATH || path.join(os.homedir(), '.docker');
  const read = (file) => {
    const fullPath = path.join(certPath, file);
    return fs.existsSync(fullPath) ? fs.readFileSync(fullPath) : undefined;
  };

  const options = { ca: read('ca.pem'), cert: read('cert.pem'), key: read('key.pem') };

  if (Boolean(options.cert) !== Boolean(options.key)) {
    throw new Error(`Both cert.pem and key.pem are needed in ${certPath} for Docker TLS client authentication`);
  }

  return options;
};

module.exports = {
  parseDockerHost,
  loadTlsOptions,
  DEFAULT_SOCKET,
};

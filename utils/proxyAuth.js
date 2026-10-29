const Logger = require('./Logger');
const logger = new Logger();

const MAX_USER_LENGTH = 256;
const MAX_WARNED_ADDRESSES = 100;

const warnedAddresses = new Set();

// e.g. X-authentik-username or Remote-User; unset disables forward-auth login
const getProxyAuthHeader = () =>
  (process.env.AUTH_PROXY_HEADER || '').trim() || null;

// Shown instead of Flame's own logout, which can't end the proxy's session
const getProxyLogoutUrl = () => {
  const url = (process.env.AUTH_PROXY_LOGOUT_URL || '').trim();

  return /^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) ? url : null;
};

// Why the header can't be trusted with this "trust proxy" setting, or null.
// `true` and hop counts trust whoever connects, so any client could send it.
const getProxyAuthProblem = (trustProxy) => {
  if (trustProxy === undefined || trustProxy === false) {
    return 'TRUST_PROXY is not set';
  }

  if (trustProxy === true || typeof trustProxy === 'number') {
    return 'TRUST_PROXY must list the reverse proxy addresses or subnets (e.g. "172.18.0.0/16"), not true or a hop count, so that Flame can tell the proxy apart from other clients';
  }

  return null;
};

const warnUntrusted = (header, address) => {
  if (
    warnedAddresses.has(address) ||
    warnedAddresses.size >= MAX_WARNED_ADDRESSES
  ) {
    return;
  }

  warnedAddresses.add(address);
  logger.log(
    `Ignoring ${header} header from ${address}, which is not in TRUST_PROXY`,
    'WARN'
  );
};

// User name asserted by a trusted reverse proxy, or null. Only the direct peer
// counts: X-Forwarded-For is client controlled up to the first trusted hop.
const getProxyUser = (req) => {
  const header = getProxyAuthHeader();

  if (!header || getProxyAuthProblem(req.app.get('trust proxy'))) {
    return null;
  }

  const value = req.get(header);

  if (value === undefined) {
    return null;
  }

  const address = req.socket.remoteAddress;

  if (!address || !req.app.get('trust proxy fn')(address, 0)) {
    warnUntrusted(header, address);
    return null;
  }

  const user = value.trim();

  return user && user.length <= MAX_USER_LENGTH ? user : null;
};

module.exports = {
  getProxyAuthHeader,
  getProxyLogoutUrl,
  getProxyAuthProblem,
  getProxyUser,
};

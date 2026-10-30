const crypto = require('crypto');

const CALLBACK_PATH = '/api/auth/oidc/callback';

const trimmed = (value) => (value || '').trim();

const list = (value) =>
  trimmed(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const getOidcSettings = () => {
  const env = process.env;

  return {
    discoveryUrl: trimmed(env.OIDC_DISCOVERY_URL),
    clientId: trimmed(env.OIDC_CLIENT_ID),
    clientSecret: env.OIDC_CLIENT_SECRET || '',
    redirectUri: trimmed(env.OIDC_REDIRECT_URI),
    scope: trimmed(env.OIDC_SCOPES) || 'openid profile email',
    allowedGroups: list(env.OIDC_ALLOWED_GROUPS),
    groupsClaim: trimmed(env.OIDC_GROUPS_CLAIM) || 'groups',
    usernameClaim: trimmed(env.OIDC_USERNAME_CLAIM) || 'preferred_username',
    providerName: trimmed(env.OIDC_PROVIDER_NAME) || 'SSO',
    allowInsecureHttp: trimmed(env.OIDC_ALLOW_INSECURE_HTTP) === 'true',
  };
};

const isOidcConfigured = () => {
  const { discoveryUrl, clientId } = getOidcSettings();

  return Boolean(discoveryUrl || clientId);
};

const parseUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

// Why the OIDC settings can't be used, or null
const getOidcProblem = () => {
  const settings = getOidcSettings();

  if (!settings.discoveryUrl || !settings.clientId) {
    return 'OIDC_DISCOVERY_URL and OIDC_CLIENT_ID are both required';
  }

  for (const [name, value] of [
    ['OIDC_DISCOVERY_URL', settings.discoveryUrl],
    ['OIDC_REDIRECT_URI', settings.redirectUri],
  ]) {
    if (!value) continue;

    const url = parseUrl(value);

    if (!url || !['http:', 'https:'].includes(url.protocol)) {
      return `${name} must be an http(s) URL`;
    }

    if (url.protocol === 'http:' && !settings.allowInsecureHttp) {
      return `${name} uses plain HTTP; use HTTPS or set OIDC_ALLOW_INSECURE_HTTP=true`;
    }
  }

  if (
    settings.redirectUri &&
    parseUrl(settings.redirectUri).pathname !== CALLBACK_PATH
  ) {
    return `OIDC_REDIRECT_URI must end in ${CALLBACK_PATH}`;
  }

  if (!settings.scope.split(/\s+/).includes('openid')) {
    return 'OIDC_SCOPES must include "openid"';
  }

  return null;
};

const isOidcEnabled = () => isOidcConfigured() && getOidcProblem() === null;

// Embedded in OIDC session tokens, so switching provider or client, or
// changing the allowed groups, ends existing OIDC sessions
const getOidcFingerprint = () => {
  const { discoveryUrl, clientId, allowedGroups } = getOidcSettings();

  return crypto
    .createHmac('sha256', process.env.SECRET)
    .update(JSON.stringify([discoveryUrl, clientId, [...allowedGroups].sort()]))
    .digest('base64')
    .slice(0, 22);
};

// openid-client is ESM-only
const loadClient = () => import('openid-client');

let cached;

// Discovery runs on the first login rather than at startup, so Flame starts
// even while the provider is down; failures are retried on the next login
const getOidcConfiguration = async () => {
  const settings = getOidcSettings();
  const key = JSON.stringify(settings);

  if (cached?.key === key) {
    return cached.promise;
  }

  const client = await loadClient();

  const promise = client.discovery(
    new URL(settings.discoveryUrl),
    settings.clientId,
    settings.clientSecret ? { client_secret: settings.clientSecret } : {},
    settings.clientSecret ? undefined : client.None(),
    {
      timeout: 10,
      execute: settings.allowInsecureHttp ? [client.allowInsecureRequests] : [],
    }
  );

  cached = { key, promise };
  promise.catch(() => {
    if (cached?.promise === promise) cached = undefined;
  });

  return promise;
};

const getRedirectUri = (req) =>
  getOidcSettings().redirectUri ||
  `${req.protocol}://${req.get('host')}${CALLBACK_PATH}`;

module.exports = {
  CALLBACK_PATH,
  getOidcSettings,
  isOidcConfigured,
  getOidcProblem,
  isOidcEnabled,
  getOidcFingerprint,
  getOidcConfiguration,
  getRedirectUri,
  loadClient,
};

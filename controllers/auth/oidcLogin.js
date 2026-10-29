const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const Logger = require('../../utils/Logger');
const logger = new Logger();
const {
  isOidcEnabled,
  getOidcSettings,
  getOidcConfiguration,
  getRedirectUri,
  loadClient,
} = require('../../utils/oidc');
const { setOidcState } = require('../../utils/oidcState');

const LOGIN_PAGE = '/settings/app';

// Errors are reported on the login page; details only go to the log
const redirectWithError = (res, code) =>
  res.redirect(303, `${LOGIN_PAGE}?ssoError=${code}`);

// @desc      Start an OIDC login (authorization code flow with PKCE)
// @route     GET /api/auth/oidc/login
// @access    Public
const oidcLogin = asyncWrapper(async (req, res, next) => {
  if (!isOidcEnabled()) {
    return next(new ErrorResponse('OIDC login is not configured', 404));
  }

  let config;

  try {
    config = await getOidcConfiguration();
  } catch (e) {
    logger.log(`OIDC discovery failed: ${e.message}`, 'ERROR');
    return redirectWithError(res, 'unavailable');
  }

  const client = await loadClient();
  const verifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const redirectUri = getRedirectUri(req);

  setOidcState(req, res, {
    state,
    nonce,
    verifier,
    redirectUri,
    duration: req.query.duration || '14d',
  });

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: getOidcSettings().scope,
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  res.redirect(303, url.href);
});

module.exports = oidcLogin;
module.exports.LOGIN_PAGE = LOGIN_PAGE;
module.exports.redirectWithError = redirectWithError;

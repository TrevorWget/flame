const jwt = require('jsonwebtoken');
const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const Logger = require('../../utils/Logger');
const logger = new Logger();
const signToken = require('../../utils/signToken');
const { setTokenCookie } = require('../../utils/authCookie');
const {
  isOidcEnabled,
  getOidcSettings,
  getOidcConfiguration,
  loadClient,
} = require('../../utils/oidc');
const { takeOidcState } = require('../../utils/oidcState');
const { LOGIN_PAGE, redirectWithError } = require('./oidcLogin');

const MAX_USER_LENGTH = 256;

class LoginRejected extends Error {}

const getGroups = async (client, config, tokens, claims, groupsClaim) => {
  if (claims[groupsClaim] !== undefined) {
    return claims[groupsClaim];
  }

  const userInfo = await client.fetchUserInfo(
    config,
    tokens.access_token,
    claims.sub
  );

  return userInfo[groupsClaim];
};

const getUserName = (claims, usernameClaim) => {
  for (const value of [claims[usernameClaim], claims.email, claims.sub]) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim().slice(0, MAX_USER_LENGTH);
    }
  }

  throw new LoginRejected('the ID token has no usable user name');
};

// @desc      Finish an OIDC login and start a Flame session
// @route     GET /api/auth/oidc/callback
// @access    Public
const oidcCallback = asyncWrapper(async (req, res, next) => {
  const state = takeOidcState(req, res);

  if (!isOidcEnabled()) {
    return next(new ErrorResponse('OIDC login is not configured', 404));
  }

  if (!state) {
    logger.log(
      'OIDC callback without a pending login from this browser (expired or blocked cookie)',
      'WARN'
    );
    return redirectWithError(res, 'expired');
  }

  const settings = getOidcSettings();
  const client = await loadClient();

  try {
    const config = await getOidcConfiguration();

    // Must be the exact redirect_uri sent to the provider
    const currentUrl = new URL(state.redirectUri);
    const query = req.originalUrl.indexOf('?');
    currentUrl.search = query > -1 ? req.originalUrl.slice(query) : '';

    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: state.verifier,
      expectedState: state.state,
      expectedNonce: state.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();

    if (settings.allowedGroups.length) {
      const groups = await getGroups(
        client,
        config,
        tokens,
        claims,
        settings.groupsClaim
      );

      if (
        !Array.isArray(groups) ||
        !groups.some((group) => settings.allowedGroups.includes(group))
      ) {
        throw new LoginRejected(
          `${claims.sub} is not in any of OIDC_ALLOWED_GROUPS`
        );
      }
    }

    const token = signToken(state.duration, {
      oidc: getUserName(claims, settings.usernameClaim),
    });

    setTokenCookie(req, res, token, new Date(jwt.decode(token).exp * 1000));
    res.redirect(303, LOGIN_PAGE);
  } catch (e) {
    const code =
      e instanceof LoginRejected
        ? 'forbidden'
        : e instanceof client.AuthorizationResponseError
          ? 'denied'
          : 'failed';

    logger.log(`OIDC login failed: ${e.message}`, 'ERROR');
    redirectWithError(res, code);
  }
});

module.exports = oidcCallback;

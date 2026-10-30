const asyncWrapper = require('../../middleware/asyncWrapper');
const { isLoginEnabled } = require('../../utils/password');
const { isOidcEnabled, getOidcSettings } = require('../../utils/oidc');

// @desc      Login methods the login form should offer
// @route     GET /api/auth/providers
// @access    Public
const getProviders = asyncWrapper(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      password: isLoginEnabled(),
      oidc: isOidcEnabled() ? { name: getOidcSettings().providerName } : null,
    },
  });
});

module.exports = getProviders;

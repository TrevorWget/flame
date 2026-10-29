const express = require('express');
const router = express.Router();

const {
  login,
  validate,
  getSession,
  getProviders,
  oidcLogin,
  oidcCallback,
  logout,
  logoutAll,
} = require('../controllers/auth');
const { auth, requireAuth, requireCsrf } = require('../middleware');
const validateRequest = require('../middleware/validate');
const loginRateLimit = require('../middleware/loginRateLimit');
const { auth: schemas } = require('../validation');

router
  .route('/')
  .get(auth, validateRequest(schemas.getSession), getSession)
  .post(requireCsrf, loginRateLimit, validateRequest(schemas.login), login);

router
  .route('/providers')
  .get(validateRequest(schemas.getProviders), getProviders);

// Browser navigations, not XHR: no CSRF header. The callback is protected by
// the state, nonce and PKCE verifier bound to this browser's flame_oidc cookie.
router.route('/oidc/login').get(validateRequest(schemas.oidcLogin), oidcLogin);

router
  .route('/oidc/callback')
  .get(validateRequest(schemas.oidcCallback), oidcCallback);

router
  .route('/validate')
  .post(validateRequest(schemas.validateToken), validate);

router
  .route('/logout')
  .post(requireCsrf, validateRequest(schemas.logout), logout);

router
  .route('/logout-all')
  .post(auth, requireAuth, validateRequest(schemas.logoutAll), logoutAll);

module.exports = router;

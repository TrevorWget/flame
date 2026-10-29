const express = require('express');
const router = express.Router();

const {
  login,
  validate,
  getSession,
  logout,
  logoutAll,
} = require('../controllers/auth');
const { auth, requireAuth, requireBody, requireCsrf } = require('../middleware');
const loginRateLimit = require('../middleware/loginRateLimit');

router
  .route('/')
  .get(auth, getSession)
  .post(
    requireCsrf,
    loginRateLimit,
    requireBody(['password', 'duration']),
    login
  );

router.route('/validate').post(requireBody(['token']), validate);

router.route('/logout').post(requireCsrf, logout);

router.route('/logout-all').post(auth, requireAuth, logoutAll);

module.exports = router;

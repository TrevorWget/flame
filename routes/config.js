const express = require('express');
const router = express.Router();

// middleware
const { auth, requireAuth } = require('../middleware');

const {
  getCSS,
  updateCSS,
  getConfig,
  getAdminConfig,
  updateConfig,
} = require('../controllers/config');

router.route('/').get(getConfig).put(auth, requireAuth, updateConfig);

router.route('/admin').get(auth, requireAuth, getAdminConfig);

router.route('/0/css').get(getCSS).put(auth, requireAuth, updateCSS);

module.exports = router;

const express = require('express');
const router = express.Router();

// middleware
const { auth, requireAuth, validate } = require('../middleware');
const { config: schemas } = require('../validation');

const {
  getCSS,
  updateCSS,
  getConfig,
  getAdminConfig,
  updateConfig,
} = require('../controllers/config');

router
  .route('/')
  .get(getConfig)
  .put(auth, requireAuth, validate(schemas.updateConfig), updateConfig);

router.route('/admin').get(auth, requireAuth, getAdminConfig);

router
  .route('/0/css')
  .get(getCSS)
  .put(auth, requireAuth, validate(schemas.updateCSS), updateCSS);

module.exports = router;

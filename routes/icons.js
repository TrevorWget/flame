const express = require('express');
const router = express.Router();

// middleware
const { auth, requireAuth, validate } = require('../middleware');
const { icons: schemas } = require('../validation');

const { fetchIcon } = require('../controllers/icons');

router
  .route('/fetch')
  .post(auth, requireAuth, validate(schemas.fetchIcon), fetchIcon);

module.exports = router;

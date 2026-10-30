const express = require('express');
const router = express.Router();

// middleware
const { auth, requireAuth, validate } = require('../middleware');
const { icons: schemas } = require('../validation');

const {
  fetchIcon,
  searchSelfhst,
  suggestSelfhst,
  previewSelfhst,
  storeSelfhst,
} = require('../controllers/icons');

router
  .route('/fetch')
  .post(auth, requireAuth, validate(schemas.fetchIcon), fetchIcon);

router
  .route('/selfhst')
  .post(auth, requireAuth, validate(schemas.storeSelfhst), storeSelfhst);

router
  .route('/selfhst/search')
  .get(auth, requireAuth, validate(schemas.searchSelfhst), searchSelfhst);

router
  .route('/selfhst/suggest')
  .get(auth, requireAuth, validate(schemas.suggestSelfhst), suggestSelfhst);

router
  .route('/selfhst/preview/:reference')
  .get(auth, requireAuth, validate(schemas.previewSelfhst), previewSelfhst);

module.exports = router;

const express = require('express');
const router = express.Router();

// middleware
const { auth, requireAuth, upload, validate } = require('../middleware');
const { apps: schemas } = require('../validation');

const {
  createApp,
  getAllApps,
  getSingleApp,
  updateApp,
  deleteApp,
  reorderApps,
} = require('../controllers/apps');

router
  .route('/')
  .post(auth, requireAuth, upload, validate(schemas.createApp), createApp)
  .get(auth, getAllApps);

router
  .route('/:id')
  .get(auth, getSingleApp)
  .put(auth, requireAuth, upload, validate(schemas.updateApp), updateApp)
  .delete(auth, requireAuth, validate(schemas.deleteApp), deleteApp);

router
  .route('/0/reorder')
  .put(auth, requireAuth, validate(schemas.reorderApps), reorderApps);

module.exports = router;

const express = require('express');
const router = express.Router();

// middleware
const { auth, requireAuth, validate } = require('../middleware');
const { queries: schemas } = require('../validation');

const {
  getQueries,
  addQuery,
  deleteQuery,
  updateQuery,
} = require('../controllers/queries/');

router
  .route('/')
  .post(auth, requireAuth, validate(schemas.addQuery), addQuery)
  .get(getQueries);

router
  .route('/:prefix')
  .delete(auth, requireAuth, validate(schemas.deleteQuery), deleteQuery)
  .put(auth, requireAuth, validate(schemas.updateQuery), updateQuery);

module.exports = router;

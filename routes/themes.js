const express = require('express');
const router = express.Router();

// middleware
const { auth, requireAuth, validate } = require('../middleware');
const { themes: schemas } = require('../validation');

const {
  getThemes,
  addTheme,
  deleteTheme,
  updateTheme,
} = require('../controllers/themes/');

router
  .route('/')
  .get(getThemes)
  .post(auth, requireAuth, validate(schemas.addTheme), addTheme);

router
  .route('/:name')
  .delete(auth, requireAuth, validate(schemas.deleteTheme), deleteTheme)
  .put(auth, requireAuth, validate(schemas.updateTheme), updateTheme);

module.exports = router;

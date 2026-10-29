const express = require('express');
const router = express.Router();

// middleware
const { upload, auth, requireAuth, validate } = require('../middleware');
const { bookmarks: schemas } = require('../validation');

const {
  createBookmark,
  getAllBookmarks,
  getSingleBookmark,
  updateBookmark,
  deleteBookmark,
  reorderBookmarks,
} = require('../controllers/bookmarks');

router
  .route('/')
  .post(
    auth,
    requireAuth,
    upload,
    validate(schemas.createBookmark),
    createBookmark
  )
  .get(auth, getAllBookmarks);

router
  .route('/:id')
  .get(auth, getSingleBookmark)
  .put(
    auth,
    requireAuth,
    upload,
    validate(schemas.updateBookmark),
    updateBookmark
  )
  .delete(auth, requireAuth, validate(schemas.deleteBookmark), deleteBookmark);

router
  .route('/0/reorder')
  .put(auth, requireAuth, validate(schemas.reorderBookmarks), reorderBookmarks);

module.exports = router;

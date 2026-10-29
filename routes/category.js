const express = require('express');
const router = express.Router();

// middleware
const { auth, requireAuth, validate } = require('../middleware');
const { categories: schemas } = require('../validation');

const {
  createCategory,
  getAllCategories,
  getSingleCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} = require('../controllers/categories');

router
  .route('/')
  .post(auth, requireAuth, validate(schemas.createCategory), createCategory)
  .get(auth, getAllCategories);

router
  .route('/:id')
  .get(auth, getSingleCategory)
  .put(auth, requireAuth, validate(schemas.updateCategory), updateCategory)
  .delete(auth, requireAuth, validate(schemas.deleteCategory), deleteCategory);

router
  .route('/0/reorder')
  .put(
    auth,
    requireAuth,
    validate(schemas.reorderCategories),
    reorderCategories
  );

module.exports = router;

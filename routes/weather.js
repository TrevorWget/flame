const express = require('express');
const router = express.Router();

// middleware
const { auth, requireAuth } = require('../middleware');

const {
  getWeather, updateWeather
} = require('../controllers/weather');

router
  .route('/')
  .get(getWeather);

router
  .route('/update')
  .get(auth, requireAuth, updateWeather);


module.exports = router;

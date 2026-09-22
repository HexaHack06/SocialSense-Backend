const express = require('express');
const { getSentiment } = require('../controllers/sentimentController');

const router = express.Router();

// GET /api/sentiment
router.get('/', getSentiment);

module.exports = router;

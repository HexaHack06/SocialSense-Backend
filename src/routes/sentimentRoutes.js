const express = require('express');
const { getSentiment, analyzePostSentiment } = require('../controllers/sentimentController');

const router = express.Router();

// GET /api/sentiment
router.get('/', getSentiment);

// POST /api/sentiment/analyze
router.post('/analyze', analyzePostSentiment);

module.exports = router;


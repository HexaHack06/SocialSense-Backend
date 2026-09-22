const express = require('express');
const { getOverview } = require('../controllers/overviewController');

const router = express.Router();

// GET /api/overview
router.get('/', getOverview);

module.exports = router;

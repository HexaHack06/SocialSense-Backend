const express = require('express');
const { importTwitterData } = require('../controllers/datasetController');

const router = express.Router();

// POST /api/datasets/twitter/import
router.post('/twitter/import', importTwitterData);

module.exports = router;

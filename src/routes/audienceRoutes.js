const express = require('express');
const router = express.Router();
const { getAudience } = require('../controllers/audienceController');

router.get('/', getAudience);

module.exports = router;

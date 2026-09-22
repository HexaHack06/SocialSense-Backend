const express = require('express');
const { syncTelegram } = require('../controllers/telegramController');

const router = express.Router();

// POST /api/telegram/sync
router.post('/sync', syncTelegram);

module.exports = router;

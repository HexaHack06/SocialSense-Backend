const express = require('express');
const router = express.Router();
const { getAlerts } = require('../controllers/alertsController');

router.get('/', getAlerts);

module.exports = router;

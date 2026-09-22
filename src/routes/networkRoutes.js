const express = require('express');
const router = express.Router();
const { getNetwork } = require('../controllers/networkController');

router.get('/', getNetwork);

module.exports = router;

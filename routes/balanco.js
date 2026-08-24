const express = require('express');
const router = express.Router();
const balancoController = require('../controllers/balancoController');

router.get('/', balancoController.index);

module.exports = router;
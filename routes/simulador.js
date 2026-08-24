const express = require('express');
const router = express.Router();
const simuladorController = require('../controllers/simuladorController');

router.get('/', simuladorController.index);
router.post('/calcular', simuladorController.calcular);

module.exports = router;
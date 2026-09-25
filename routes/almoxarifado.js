const express = require('express');
const router = express.Router();
const almoxarifadoController = require('../controllers/almoxarifadoController');

// Rota principal sem o authMiddleware (seguindo o padrão do seu sistema)
router.get('/', almoxarifadoController.getIndex);

module.exports = router;
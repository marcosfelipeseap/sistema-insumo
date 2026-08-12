const express = require('express');
const router = express.Router();
const envioController = require('../controllers/envioController');

router.get('/', envioController.index);
router.get('/:processoId', envioController.gerenciar);
// Rota atualizada para o envio combinado
router.post('/:processoId/saida-multipla', envioController.registrarSaidaMultipla);

module.exports = router;
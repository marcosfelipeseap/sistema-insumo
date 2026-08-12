const express = require('express');
const router = express.Router();
const estoqueController = require('../controllers/estoqueController');

router.get('/', estoqueController.index);
router.get('/:processoId', estoqueController.gerenciar);
router.post('/:processoId/entrada', estoqueController.registrarEntrada);

module.exports = router;
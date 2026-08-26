const express = require('express');
const router = express.Router();
const envioController = require('../controllers/envioController');
// A trava requireRoleAcoes foi removida das rotas de POST abaixo para liberar o Monitor

router.get('/', envioController.index);

// Rota do comprovante
router.get('/comprovante/:movimentacaoId', envioController.comprovante);

// Aceita tanto o clique no botão do index (/envios/3) quanto rotas mais longas
router.get('/:id', envioController.painelEnvio);
router.get('/processo/:id', envioController.painelEnvio);

// Aceita o formulário de envio de qualquer uma das telas (LIBERADO PARA O MONITOR)
router.post('/:id/saida', envioController.registrarEnvio);
router.post('/processo/:id/saida', envioController.registrarEnvio);

module.exports = router;
const express = require('express');
const router = express.Router();
const estoqueController = require('../controllers/estoqueController');

// Rotas Específicas
router.get('/entrada/nova', estoqueController.novaEntrada);
router.post('/entrada/lote', estoqueController.registrarEntradaLote);

// Gestão de Reservas (Novas Rotas)
router.post('/reserva/editar', estoqueController.editarReserva);
router.post('/reserva/transferir', estoqueController.transferirReserva);
router.post('/reserva/deletar', estoqueController.deletarReserva);

// Detalhes e Separação
router.get('/insumo/:insumoId/detalhes', estoqueController.detalhesInsumo);
router.get('/processo/:processoId/separacao', estoqueController.gerenciarSeparacao);
router.post('/processo/:processoId/separar', estoqueController.separarInsumo);

// Rota Raiz
router.get('/', estoqueController.index);

module.exports = router;
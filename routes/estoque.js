const express = require('express');
const router = express.Router();
const estoqueController = require('../controllers/estoqueController');
const { requireRoleAcoes } = require('../middlewares/auth');

// Rotas Específicas
router.get('/entrada/nova', requireRoleAcoes, estoqueController.novaEntrada);
router.post('/entrada/lote', requireRoleAcoes, estoqueController.registrarEntradaLote);

// Gestão de Reservas (Novas Rotas)
router.post('/reserva/editar', requireRoleAcoes, estoqueController.editarReserva);
router.post('/reserva/transferir', requireRoleAcoes, estoqueController.transferirReserva);
router.post('/reserva/deletar', requireRoleAcoes, estoqueController.deletarReserva);

// Detalhes e Separação
router.get('/insumo/:insumoId/detalhes', estoqueController.detalhesInsumo);
router.get('/processo/:processoId/separacao', requireRoleAcoes, estoqueController.gerenciarSeparacao);
router.post('/processo/:processoId/separar', requireRoleAcoes, estoqueController.separarInsumo);

// Rota Raiz
router.get('/', estoqueController.index);

router.post('/insumo/ajustar', requireRoleAcoes, estoqueController.ajustarEstoque);

module.exports = router;
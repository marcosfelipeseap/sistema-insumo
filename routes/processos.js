const express = require('express');
const router = express.Router();
const processoController = require('../controllers/processoController');
const { requireLogin, requireRoleAcoes, requireAdmin } = require('../middlewares/auth');

// Rotas liberadas para visualização 
router.get('/', requireLogin, processoController.index);
router.get('/solicitacoes', requireLogin, processoController.solicitacoes);
router.get('/novo', requireLogin, processoController.novo);
router.post('/criar', requireLogin, processoController.criar);

router.get('/:id/detalhes', requireLogin, processoController.detalhes);
router.get('/:id/composicao', requireLogin, processoController.composicao); 

// Rotas de edição/deleção blindadas
router.get('/:id/editar', requireRoleAcoes, processoController.editar);
router.post('/:id/atualizar', requireRoleAcoes, processoController.atualizar);
router.post('/:id/deletar', requireRoleAcoes, processoController.deletar);

// Novas rotas de avaliação (Apenas Admin)
router.post('/:id/aprovar', requireAdmin, processoController.aprovar);
router.post('/:id/recusar', requireAdmin, processoController.recusar);

module.exports = router;
const express = require('express');
const router = express.Router();
const processoController = require('../controllers/processoController');
const { requireRoleAcoes } = require('../middlewares/auth');

// Adicionamos a trava 'requireRoleAcoes' em todas as rotas para blindar o acesso do Monitor
router.get('/', requireRoleAcoes, processoController.index);
router.get('/novo', requireRoleAcoes, processoController.novo);
router.post('/criar', requireRoleAcoes, processoController.criar);

router.get('/:id/detalhes', requireRoleAcoes, processoController.detalhes);
router.get('/:id/composicao', requireRoleAcoes, processoController.composicao); 
router.get('/:id/editar', requireRoleAcoes, processoController.editar);

router.post('/:id/atualizar', requireRoleAcoes, processoController.atualizar);
router.post('/:id/deletar', requireRoleAcoes, processoController.deletar);

module.exports = router;
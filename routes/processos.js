const express = require('express');
const router = express.Router();
const processoController = require('../controllers/processoController');

router.get('/', processoController.index);
router.get('/novo', processoController.novo);
router.post('/criar', processoController.criar);
router.get('/:id/detalhes', processoController.detalhes);

router.get('/:id/editar', processoController.editar);
router.post('/:id/atualizar', processoController.atualizar);
router.post('/:id/deletar', processoController.deletar);

module.exports = router;
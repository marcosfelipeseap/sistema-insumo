const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAdmin } = require('../middlewares/auth');

router.use(requireAdmin); 

router.get('/usuarios', adminController.listarUsuarios);
router.post('/usuarios/:id/status', adminController.alterarStatus);
router.post('/usuarios/:id/promover', adminController.promover);
router.post('/usuarios/:id/excluir', adminController.excluir);

module.exports = router;
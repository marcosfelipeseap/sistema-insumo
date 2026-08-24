const express = require('express');
const router = express.Router();
const perfilController = require('../controllers/perfilController');

router.get('/', perfilController.index);
router.post('/dados', perfilController.atualizarDados);
router.post('/senha', perfilController.atualizarSenha);

module.exports = router;
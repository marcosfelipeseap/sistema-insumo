// routes/insumosSemVinculo.js
const express = require('express');
const router = express.Router();
const insumoSemVinculoController = require('../controllers/insumoSemVinculoController');
const { requireRoleAcoes } = require('../middlewares/auth');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Configuração do Multer para salvar os PDFs de ajuste em public/uploads/ajustes/
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../public/uploads/ajustes');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, 'doc-sv-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
    }
});
const upload = multer({ storage });

router.get('/', insumoSemVinculoController.index);
router.get('/comprovante/:loteId', insumoSemVinculoController.comprovante);
router.get('/:id/detalhes', insumoSemVinculoController.detalhes);

router.post('/criar', insumoSemVinculoController.criar);
router.post('/entrada/lote', insumoSemVinculoController.registrarEntradaLote);
router.post('/saida/lote', insumoSemVinculoController.registrarSaidaLote);

router.post('/:id/editar', insumoSemVinculoController.editar);
router.post('/:id/ajustar', requireRoleAcoes, upload.single('documento'), insumoSemVinculoController.ajustarEstoque);
router.post('/:id/excluir', requireRoleAcoes, insumoSemVinculoController.excluir);

module.exports = router;
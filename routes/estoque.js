const express = require('express');
const router = express.Router();
const estoqueController = require('../controllers/estoqueController');
const { requireRoleAcoes } = require('../middlewares/auth');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Configuração do Multer para salvar os PDFs na pasta public/uploads/ajustes/
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
        cb(null, 'doc-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
    }
});
const upload = multer({ storage });

router.get('/historico', estoqueController.historicoEstoque);

router.get('/entrada/nova', estoqueController.novaEntrada);
router.post('/entrada/lote', estoqueController.registrarEntradaLote);

router.get('/insumo/:insumoId/detalhes', estoqueController.detalhesInsumo);
router.get('/processo/:processoId/separacao', estoqueController.gerenciarSeparacao);
router.post('/processo/:processoId/separar', estoqueController.separarInsumo);

router.post('/reserva/editar', requireRoleAcoes, estoqueController.editarReserva);
router.post('/reserva/transferir', requireRoleAcoes, estoqueController.transferirReserva);
router.post('/reserva/deletar', requireRoleAcoes, estoqueController.deletarReserva);

// Rota de Ajuste agora usa o Multer para receber o PDF
router.post('/insumo/ajustar', requireRoleAcoes, upload.single('documento'), estoqueController.ajustarEstoque);

router.get('/', estoqueController.index);

module.exports = router;
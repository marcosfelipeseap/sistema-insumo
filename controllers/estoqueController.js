const ProcessoService = require('../services/processoService');
const EstoqueService = require('../services/estoqueService');

exports.index = async (req, res) => {
    try {
        // Usa o listarTodos de processos, pois o estoque é organizado por processo
        const processos = await ProcessoService.listarTodos();
        res.render('estoque/index', { processos, user: res.locals.user });
    } catch (error) {
        console.error(error);
        res.status(500).send('Erro ao carregar almoxarifado');
    }
};

exports.gerenciar = async (req, res) => {
    try {
        const processoId = req.params.processoId;
        const processo = await EstoqueService.listarEstoqueProcesso(processoId);
        
        if (!processo) return res.status(404).send('Processo não encontrado');
        
        res.render('estoque/gerenciar', { processo, user: res.locals.user });
    } catch (error) {
        console.error(error);
        res.status(500).send('Erro ao carregar estoque do processo');
    }
};

exports.registrarEntrada = async (req, res) => {
    try {
        const processoId = req.params.processoId;
        const { insumo_id, quantidade } = req.body;
        const usuario = res.locals.user ? res.locals.user.username : 'Sistema';

        // TRAVA DE PERFIL: Oculta ação no backend também
        if (res.locals.user && (res.locals.user.role === 'Monitor' || res.locals.user.role === 'Coordenador')) {
            return res.status(403).send('Acesso Negado: Perfil sem permissão para entrada de estoque.');
        }

        await EstoqueService.registrarEntrada(processoId, insumo_id, Number(quantidade), usuario);
        
        res.redirect(`/estoque/${processoId}`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Erro ao registrar entrada');
    }
};
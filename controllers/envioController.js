const ProcessoService = require('../services/processoService');
const EnvioService = require('../services/envioService');

exports.index = async (req, res) => {
    try {
        const processos = await ProcessoService.listarTodos();
        res.render('envios/index', { processos, user: res.locals.user });
    } catch (error) {
        res.status(500).send('Erro ao carregar módulo de envios');
    }
};

exports.gerenciar = async (req, res) => {
    try {
        const processoId = req.params.processoId;
        const processo = await EnvioService.obterDadosEnvio(processoId);
        
        if (!processo) return res.status(404).send('Processo não encontrado');
        
        // Agora busca opções de empréstimo para TODOS os insumos, para permitir composição
        for (let ins of processo.insumos_estoque) {
            ins.opcoes_emprestimo = await EnvioService.buscarProcessosComSaldo(ins.insumo_id, processoId);
        }
        
        res.render('envios/gerenciar', { processo, user: res.locals.user });
    } catch (error) {
        res.status(500).send('Erro ao carregar envios do processo');
    }
};

// NOVA FUNÇÃO: Processa o envio misto (próprio + empréstimo)
exports.registrarSaidaMultipla = async (req, res) => {
    try {
        const processoDestinoId = req.params.processoId;
        const { insumo_id, recebido_por, qtd_propria } = req.body;
        const entregue_por = res.locals.user ? res.locals.user.username : 'Sistema';

        // Trava de perfil
        if (res.locals.user && (res.locals.user.role === 'Monitor' || res.locals.user.role === 'Coordenador')) {
            return res.status(403).send('Acesso Negado: Perfil sem permissão para realizar envios.');
        }

        // Mapeia os inputs de empréstimo gerados dinamicamente no frontend (começam com 'emprestimo_')
        let emprestimos = [];
        for (let key in req.body) {
            if (key.startsWith('emprestimo_')) {
                const procOrigemId = key.split('_')[1]; // Extrai o ID do processo origem
                const qtd = Number(req.body[key]);
                if (qtd > 0) {
                    emprestimos.push({ processoOrigemId: procOrigemId, quantidade: qtd });
                }
            }
        }

        await EnvioService.registrarSaidaMultipla(processoDestinoId, insumo_id, Number(qtd_propria || 0), emprestimos, entregue_por, recebido_por);
        
        res.redirect(`/envios/${processoDestinoId}`);
    } catch (error) {
        res.status(500).send('Erro ao registrar envio para produção');
    }
};
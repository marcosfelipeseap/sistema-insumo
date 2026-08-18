const EstoqueService = require('../services/estoqueService');

const estoqueController = {
    index: async (req, res) => {
        try {
            let insumosGeral = await EstoqueService.listarEstoqueGeral();
            // FILTRO: Remove insumos que não possuem "ref" (como salários/taxas)
            insumosGeral = insumosGeral.filter(i => i.ref && i.ref.trim() !== '');

            const { map, processos } = await EstoqueService.mapearUsoPorProcesso();
            res.render('estoque/index', { insumosGeral, insumoProcessoMap: JSON.stringify(map), processosAtivos: processos, user: res.locals.user });
        } catch (error) { res.status(500).send('Erro ao carregar almoxarifado geral'); }
    },

    novaEntrada: async (req, res) => {
        try {
            if (res.locals.user && (res.locals.user.role === 'Monitor' || res.locals.user.role === 'Coordenador')) return res.status(403).send('Sem permissão.');
            let insumosGeral = await EstoqueService.listarEstoqueGeral();
            // FILTRO: Remove insumos que não possuem "ref"
            insumosGeral = insumosGeral.filter(i => i.ref && i.ref.trim() !== '');

            const { map, processos } = await EstoqueService.mapearUsoPorProcesso(); 
            res.render('estoque/entrada', { insumosGeral, insumoProcessoMap: JSON.stringify(map), processosAtivos: processos, user: res.locals.user });
        } catch (error) { res.status(500).send('Erro ao carregar tela'); }
    },

    registrarEntradaLote: async (req, res) => {
        try {
            if (res.locals.user && (res.locals.user.role === 'Monitor' || res.locals.user.role === 'Coordenador')) return res.status(403).send('Sem permissão.');
            
            // Adicionada a captura do qtd_regional do formulário de entrada
            const { insumos_ids, qtd_sede, qtd_complexo, qtd_regional } = req.body;
            const usuario = res.locals.user ? res.locals.user.username : 'Sistema';
            
            if (insumos_ids && Array.isArray(insumos_ids)) {
                for (let i = 0; i < insumos_ids.length; i++) {
                    if (Number(qtd_sede[i]) > 0) await EstoqueService.registrarEntradaGeral(insumos_ids[i], 'SEDE', Number(qtd_sede[i]), usuario);
                    if (Number(qtd_complexo[i]) > 0) await EstoqueService.registrarEntradaGeral(insumos_ids[i], 'COMPLEXO', Number(qtd_complexo[i]), usuario);
                    if (qtd_regional && Number(qtd_regional[i]) > 0) await EstoqueService.registrarEntradaGeral(insumos_ids[i], 'REGIONAL', Number(qtd_regional[i]), usuario);
                }
            }
            res.redirect('/estoque');
        } catch (error) { res.status(500).send('Erro ao registrar entradas'); }
    },

    gerenciarSeparacao: async (req, res) => {
        try {
            const processo = await EstoqueService.listarReservasProcesso(req.params.processoId);
            res.render('estoque/separacao', { processo, user: res.locals.user });
        } catch (error) { res.status(500).send('Erro ao carregar painel'); }
    },

    separarInsumo: async (req, res) => {
        try {
            if (res.locals.user && (res.locals.user.role === 'Monitor' || res.locals.user.role === 'Coordenador')) return res.status(403).send('Sem permissão.');
            await EstoqueService.separarParaProcesso(req.params.processoId, req.body.insumo_id, req.body.local, Number(req.body.quantidade), res.locals.user ? res.locals.user.username : 'Sistema');
            res.redirect(`/estoque/processo/${req.params.processoId}/separacao`);
        } catch (error) { res.status(400).send(error.message); }
    },

    detalhesInsumo: async (req, res) => {
        try {
            const insumo = await EstoqueService.obterDetalhesInsumo(req.params.insumoId);
            res.render('estoque/insumo-detalhes', { insumo, user: res.locals.user });
        } catch (error) { res.status(500).send('Erro ao carregar detalhes'); }
    },

    editarReserva: async (req, res) => {
        try {
            if (res.locals.user && (res.locals.user.role === 'Monitor' || res.locals.user.role === 'Coordenador')) return res.status(403).send('Sem permissão.');
            const { reserva_id, insumo_id, nova_quantidade, local_ajuste } = req.body;
            await EstoqueService.editarReserva(reserva_id, Number(nova_quantidade), local_ajuste, res.locals.user ? res.locals.user.username : 'Sistema');
            res.redirect(`/estoque/insumo/${insumo_id}/detalhes`);
        } catch (error) { res.status(400).send(`<script>alert('${error.message}'); window.history.back();</script>`); }
    },

    transferirReserva: async (req, res) => {
        try {
            if (res.locals.user && (res.locals.user.role === 'Monitor' || res.locals.user.role === 'Coordenador')) return res.status(403).send('Sem permissão.');
            const { reserva_id, insumo_id, novo_processo_id } = req.body;
            await EstoqueService.transferirReserva(reserva_id, novo_processo_id, res.locals.user ? res.locals.user.username : 'Sistema');
            res.redirect(`/estoque/insumo/${insumo_id}/detalhes`);
        } catch (error) { res.status(400).send(`<script>alert('${error.message}'); window.history.back();</script>`); }
    },

    deletarReserva: async (req, res) => {
        try {
            if (res.locals.user && (res.locals.user.role === 'Monitor' || res.locals.user.role === 'Coordenador')) return res.status(403).send('Sem permissão.');
            const { reserva_id, insumo_id, local_retorno } = req.body;
            await EstoqueService.deletarReserva(reserva_id, local_retorno, res.locals.user ? res.locals.user.username : 'Sistema');
            res.redirect(`/estoque/insumo/${insumo_id}/detalhes`);
        } catch (error) { res.status(400).send(`<script>alert('${error.message}'); window.history.back();</script>`); }
    },

    // ==========================================
    // NOVO: ROTA DE AJUSTE MANUAL DE ESTOQUE
    // ==========================================
    ajustarEstoque: async (req, res) => {
        try {
            if (res.locals.user && (res.locals.user.role === 'Monitor' || res.locals.user.role === 'Coordenador')) return res.status(403).send('Sem permissão.');
            
            const { insumo_id, qtd_sede, qtd_complexo, qtd_regional, justificativa } = req.body;
            const usuario = res.locals.user ? res.locals.user.username : 'Sistema';
            
            await EstoqueService.ajustarEstoque(insumo_id, qtd_sede, qtd_complexo, qtd_regional, usuario, justificativa);
            
            // Redireciona de volta pra tela de detalhes, recarregando os saldos
            res.redirect(`/estoque/insumo/${insumo_id}/detalhes`);
        } catch (error) { 
            res.status(400).send(`<script>alert('${error.message}'); window.history.back();</script>`); 
        }
    }
};

module.exports = estoqueController;
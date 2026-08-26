const EstoqueService = require('../services/estoqueService');

const estoqueController = {
    index: async (req, res) => {
        try {
            let insumosGeral = await EstoqueService.listarEstoqueGeral();
            insumosGeral = insumosGeral.filter(i => i.ref && i.ref.trim() !== '');

            const { map, processos } = await EstoqueService.mapearUsoPorProcesso();
            res.render('estoque/index', { insumosGeral, insumoProcessoMap: JSON.stringify(map), processosAtivos: processos, user: res.locals.user });
        } catch (error) { res.status(500).send('Erro ao carregar almoxarifado geral'); }
    },

    historicoEstoque: async (req, res) => {
        try {
            const { data_inicio, data_fim, insumos, busca_geral } = req.query;
            let insumosSelecionados = [];
            if (insumos) { insumosSelecionados = Array.isArray(insumos) ? insumos : [insumos]; }

            const resultado = await EstoqueService.obterHistoricoGeralEstoque({ data_inicio, data_fim, busca_geral, insumos: insumosSelecionados });

            const filtrosFormatados = {
                data_inicio: data_inicio || '',
                data_fim: data_fim || '',
                busca_geral: busca_geral || '',
                insumos: insumosSelecionados.map(String)
            };

            if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
                return res.render('estoque/historico', { movimentacoes: resultado.movimentacoes, insumosDisponiveis: resultado.insumosDisponiveis, filtros: filtrosFormatados, user: res.locals.user });
            }

            res.render('estoque/historico', { movimentacoes: resultado.movimentacoes, insumosDisponiveis: resultado.insumosDisponiveis, filtros: filtrosFormatados, user: res.locals.user });
        } catch (error) { res.status(500).send('Erro ao carregar histórico de estoque.'); }
    },

    novaEntrada: async (req, res) => {
        try {
            let insumosGeral = await EstoqueService.listarEstoqueGeral();
            insumosGeral = insumosGeral.filter(i => i.ref && i.ref.trim() !== '');
            const { map, processos } = await EstoqueService.mapearUsoPorProcesso(); 
            res.render('estoque/entrada', { insumosGeral, insumoProcessoMap: JSON.stringify(map), processosAtivos: processos, user: res.locals.user });
        } catch (error) { res.status(500).send('Erro ao carregar tela'); }
    },

    registrarEntradaLote: async (req, res) => {
        try {
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
            const { reserva_id, insumo_id, nova_quantidade, local_ajuste } = req.body;
            await EstoqueService.editarReserva(reserva_id, Number(nova_quantidade), local_ajuste, res.locals.user ? res.locals.user.username : 'Sistema');
            res.redirect(`/estoque/insumo/${insumo_id}/detalhes`);
        } catch (error) { res.status(400).send(`<script>alert('${error.message}'); window.history.back();</script>`); }
    },

    transferirReserva: async (req, res) => {
        try {
            const { reserva_id, insumo_id, novo_processo_id } = req.body;
            await EstoqueService.transferirReserva(reserva_id, novo_processo_id, res.locals.user ? res.locals.user.username : 'Sistema');
            res.redirect(`/estoque/insumo/${insumo_id}/detalhes`);
        } catch (error) { res.status(400).send(`<script>alert('${error.message}'); window.history.back();</script>`); }
    },

    deletarReserva: async (req, res) => {
        try {
            const { reserva_id, insumo_id, local_retorno } = req.body;
            await EstoqueService.deletarReserva(reserva_id, local_retorno, res.locals.user ? res.locals.user.username : 'Sistema');
            res.redirect(`/estoque/insumo/${insumo_id}/detalhes`);
        } catch (error) { res.status(400).send(`<script>alert('${error.message}'); window.history.back();</script>`); }
    },

    ajustarEstoque: async (req, res) => {
        try {
            const { insumo_id, qtd_sede, qtd_complexo, qtd_regional, justificativa } = req.body;
            const usuario = res.locals.user ? res.locals.user.username : 'Sistema';
            const cargo = res.locals.user ? res.locals.user.cargo : null;
            
            // Pega o caminho do arquivo gerado pelo Multer
            let documentoPath = null;
            if (req.file) {
                documentoPath = '/uploads/ajustes/' + req.file.filename;
            }

            // Trava de PDF obrigatório para todos exceto admin
            if (cargo !== 'admin' && !documentoPath) {
                throw new Error("O upload de um documento PDF justificando a alteração é obrigatório para o seu nível de acesso.");
            }
            
            await EstoqueService.ajustarEstoque(insumo_id, qtd_sede, qtd_complexo, qtd_regional, usuario, justificativa, documentoPath);
            
            res.redirect(`/estoque/insumo/${insumo_id}/detalhes`);
        } catch (error) { 
            res.status(400).send(`<script>alert('${error.message}'); window.history.back();</script>`); 
        }
    }
};

module.exports = estoqueController;
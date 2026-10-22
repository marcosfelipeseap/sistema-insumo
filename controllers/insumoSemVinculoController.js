// controllers/insumoSemVinculoController.js
const InsumoSemVinculoService = require('../services/insumoSemVinculoService');

const insumoSemVinculoController = {
    index: async (req, res) => {
        try {
            const [insumos, oficinas, movimentacoes, lotesSaida] = await Promise.all([
                InsumoSemVinculoService.listarTodos(),
                InsumoSemVinculoService.listarOficinas(),
                InsumoSemVinculoService.listarUltimasMovimentacoes(100),
                InsumoSemVinculoService.obterHistoricoLotesSaida(50)
            ]);

            res.render('insumos-sem-vinculo/index', {
                insumos,
                oficinas,
                movimentacoes,
                lotesSaida,
                user: res.locals.user
            });
        } catch (error) {
            console.error('Erro ao carregar Insumos Sem Vínculo:', error);
            res.status(500).send('Erro ao carregar a página de Insumos Sem Vínculo.');
        }
    },

    detalhes: async (req, res) => {
        try {
            const [insumo, oficinas] = await Promise.all([
                InsumoSemVinculoService.obterDetalhesInsumo(req.params.id),
                InsumoSemVinculoService.listarOficinas()
            ]);

            if (!insumo) {
                req.session.erro = 'Insumo sem vínculo não encontrado.';
                return res.redirect('/insumos-sem-vinculo');
            }

            res.render('insumos-sem-vinculo/detalhes', {
                insumo,
                oficinas,
                user: res.locals.user
            });
        } catch (error) {
            console.error('Erro ao carregar detalhes do insumo sem vínculo:', error);
            res.status(500).send('Erro ao carregar detalhes do insumo.');
        }
    },

    criar: async (req, res) => {
        try {
            const usuario = res.locals.user ? res.locals.user.username : 'Sistema';
            await InsumoSemVinculoService.criarInsumo(req.body, usuario);
            req.session.sucesso = 'Insumo sem vínculo cadastrado com sucesso!';
            res.redirect('/insumos-sem-vinculo');
        } catch (error) {
            console.error('Erro ao criar insumo sem vínculo:', error);
            req.session.erro = error.message;
            res.redirect('/insumos-sem-vinculo');
        }
    },

    editar: async (req, res) => {
        const redirectUrl = req.body.return_to === 'detalhes'
            ? `/insumos-sem-vinculo/${req.params.id}/detalhes`
            : '/insumos-sem-vinculo';
        try {
            const usuario = res.locals.user ? res.locals.user.username : 'Sistema';
            await InsumoSemVinculoService.editarInsumo(req.params.id, req.body, usuario);
            req.session.sucesso = 'Insumo atualizado com sucesso!';
            res.redirect(redirectUrl);
        } catch (error) {
            console.error('Erro ao editar insumo sem vínculo:', error);
            req.session.erro = error.message;
            res.redirect(redirectUrl);
        }
    },

    ajustarEstoque: async (req, res) => {
        const id = req.params.id;
        try {
            const usuario = res.locals.user ? res.locals.user.username : 'Sistema';
            const cargo = res.locals.user ? res.locals.user.cargo : null;

            let documentoPath = null;
            if (req.file) {
                documentoPath = '/uploads/ajustes/' + req.file.filename;
            }

            if (cargo !== 'admin' && !documentoPath) {
                throw new Error('O upload de um documento PDF justificando a alteração é obrigatório para o seu nível de acesso.');
            }

            await InsumoSemVinculoService.ajustarEstoqueDireto(id, req.body, usuario, documentoPath);
            req.session.sucesso = 'Saldos físicos ajustados com sucesso!';
            res.redirect(`/insumos-sem-vinculo/${id}/detalhes`);
        } catch (error) {
            console.error('Erro ao ajustar estoque sem vínculo:', error);
            req.session.erro = error.message;
            res.redirect(`/insumos-sem-vinculo/${id}/detalhes`);
        }
    },

    registrarEntradaLote: async (req, res) => {
        const redirectUrl = req.body.return_to || '/insumos-sem-vinculo';
        try {
            const usuario = res.locals.user ? res.locals.user.username : 'Sistema';
            const { insumos_ids, qtd_sede, qtd_complexo, qtd_regional, observacao } = req.body;

            const itensEntrada = [];
            if (insumos_ids) {
                const ids = Array.isArray(insumos_ids) ? insumos_ids : [insumos_ids];
                const sedes = Array.isArray(qtd_sede) ? qtd_sede : [qtd_sede];
                const comps = Array.isArray(qtd_complexo) ? qtd_complexo : [qtd_complexo];
                const regs = Array.isArray(qtd_regional) ? qtd_regional : [qtd_regional];

                for (let i = 0; i < ids.length; i++) {
                    const s = Number(sedes[i] || 0);
                    const c = Number(comps[i] || 0);
                    const r = Number(regs[i] || 0);
                    if (s > 0 || c > 0 || r > 0) {
                        itensEntrada.push({
                            insumo_id: ids[i],
                            qtd_sede: s,
                            qtd_complexo: c,
                            qtd_regional: r
                        });
                    }
                }
            }

            await InsumoSemVinculoService.registrarEntradaLote(itensEntrada, observacao, usuario);
            req.session.sucesso = `Entrada registrada com sucesso (${itensEntrada.length} item(ns) atualizado(s))!`;
            res.redirect(redirectUrl);
        } catch (error) {
            console.error('Erro ao registrar entrada em lote:', error);
            req.session.erro = error.message;
            res.redirect(redirectUrl);
        }
    },

    registrarSaidaLote: async (req, res) => {
        const redirectUrl = req.body.return_to || '/insumos-sem-vinculo';
        try {
            const entregue_por = res.locals.user ? res.locals.user.username : 'Sistema';
            const { selecionados, recebido_por, observacao } = req.body;

            if (!selecionados) {
                throw new Error('Selecione pelo menos um insumo para registrar a saída.');
            }

            const idsSelecionados = Array.isArray(selecionados) ? selecionados : [selecionados];
            const loteSaidas = [];

            for (const id of idsSelecionados) {
                const qtd = req.body[`qtd_${id}`];
                const origem = req.body[`origem_${id}`];
                loteSaidas.push({
                    insumo_id: id,
                    quantidade: qtd,
                    origem: origem
                });
            }

            const loteId = await InsumoSemVinculoService.registrarSaidaLote(
                loteSaidas,
                entregue_por,
                recebido_por,
                observacao
            );

            res.redirect(`/insumos-sem-vinculo/comprovante/${loteId}`);
        } catch (error) {
            console.error('Erro ao registrar saída em lote:', error);
            req.session.erro = error.message;
            res.redirect(redirectUrl);
        }
    },

    comprovante: async (req, res) => {
        try {
            const comprovante = await InsumoSemVinculoService.obterComprovanteSaida(req.params.loteId);
            if (!comprovante) {
                return res.status(404).send('Comprovante de saída não encontrado.');
            }
            res.render('insumos-sem-vinculo/comprovante', { comprovante });
        } catch (error) {
            console.error('Erro ao gerar comprovante:', error);
            res.status(500).send('Erro ao gerar comprovante de saída.');
        }
    },

    excluir: async (req, res) => {
        try {
            await InsumoSemVinculoService.excluirInsumo(req.params.id);
            req.session.sucesso = 'Insumo removido com sucesso!';
            res.redirect('/insumos-sem-vinculo');
        } catch (error) {
            console.error('Erro ao excluir insumo sem vínculo:', error);
            req.session.erro = error.message;
            res.redirect('/insumos-sem-vinculo');
        }
    }
};

module.exports = insumoSemVinculoController;
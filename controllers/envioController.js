// controllers/envioController.js
const EstoqueService = require('../services/estoqueService');
const ProcessoService = require('../services/processoService');
const InsumoSemVinculoService = require('../services/insumoSemVinculoService');
const supabase = require('../config/db');

const envioController = {
    index: async (req, res) => {
        try {
            const processos = await ProcessoService.listarTodos(res.locals.user || req.session.user, 'aprovados');
            const ativos = processos.filter(p => p.status !== 'Concluído');
            const oficinas = await EstoqueService.listarOficinas();
            res.render('envios/index', { processos: ativos, oficinas, user: res.locals.user });
        } catch (error) {
            console.error(error);
            res.status(500).send('Erro ao carregar processos');
        }
    },

    painelEnvio: async (req, res) => {
        try {
            const processo = await EstoqueService.listarSaldosEnvio(req.params.id);
            if (!processo) return res.status(404).send("Processo não encontrado");

            const oficinas = await EstoqueService.listarOficinas();
            const insumosGerais = await EstoqueService.listarEstoqueGeral();
            
            const mapaRef = {};
            const mapaOficinasInsumo = {};
            insumosGerais.forEach(item => {
                if (item.ids && Array.isArray(item.ids)) {
                    item.ids.forEach(id => {
                        mapaRef[id] = item.ref;
                        mapaOficinasInsumo[id] = {
                            oficina_ids: item.oficina_ids || [],
                            oficinas_nomes: item.oficinas_nomes || []
                        };
                    });
                } else if (item.id) {
                    mapaRef[item.id] = item.ref;
                    mapaOficinasInsumo[item.id] = {
                        oficina_ids: item.oficina_ids || [],
                        oficinas_nomes: item.oficinas_nomes || []
                    };
                }
            });

            if (processo.insumos_envio) {
                processo.insumos_envio = processo.insumos_envio
                    .filter(ins => {
                        const ref = ins.ref !== undefined ? ins.ref : mapaRef[ins.insumo_id];
                        return ref && String(ref).trim() !== '';
                    })
                    .map(ins => {
                        const infoOf = mapaOficinasInsumo[ins.insumo_id] || { oficina_ids: [], oficinas_nomes: [] };
                        return {
                            ...ins,
                            oficina_ids: infoOf.oficina_ids,
                            oficinas_nomes: infoOf.oficinas_nomes
                        };
                    });
            }

            const { data: listaTodos } = await supabase.schema('orcamento').from('insumo').select('id, descricao, unidade').order('descricao');
            const { data: saldosGerais } = await supabase.schema('insumo').from('estoque_geral').select('*');

            const mapaSaldosPorDescricao = {};
            const descPorId = {};
            (listaTodos || []).forEach(i => {
                descPorId[i.id] = (i.descricao || '').trim().toLowerCase();
            });

            (saldosGerais || []).forEach(s => {
                const desc = descPorId[s.insumo_id];
                if (desc) {
                    if (!mapaSaldosPorDescricao[desc]) {
                        mapaSaldosPorDescricao[desc] = { sede: 0, complexo: 0, regional: 0 };
                    }
                    mapaSaldosPorDescricao[desc].sede += Number(s.qtd_sede || 0);
                    mapaSaldosPorDescricao[desc].complexo += Number(s.qtd_complexo || 0);
                    mapaSaldosPorDescricao[desc].regional += Number(s.qtd_regional || 0);
                }
            });

            const mapaCatalogoUnico = {};
            (listaTodos || []).forEach(ins => {
                const descKey = (ins.descricao || '').trim().toLowerCase();
                if (!mapaCatalogoUnico[descKey]) {
                    const saldo = mapaSaldosPorDescricao[descKey] || { sede: 0, complexo: 0, regional: 0 };
                    const infoOf = mapaOficinasInsumo[ins.id] || { oficina_ids: [], oficinas_nomes: [] };
                    mapaCatalogoUnico[descKey] = {
                        id: ins.id,
                        insumo_id: ins.id,
                        is_sem_vinculo: false,
                        descricao: ins.descricao,
                        unidade: ins.unidade,
                        saldo_sede: saldo.sede,
                        saldo_complexo: saldo.complexo,
                        saldo_regional: saldo.regional,
                        oficina_ids: infoOf.oficina_ids,
                        oficinas_nomes: infoOf.oficinas_nomes
                    };
                }
            });

            const catalogoExtras = Object.values(mapaCatalogoUnico).filter(ins => 
                ins.saldo_sede > 0 || ins.saldo_complexo > 0 || ins.saldo_regional > 0
            );

            const semVinculo = await EstoqueService.listarInsumosSemVinculoFormatados();
            semVinculo.forEach(sv => {
                if (sv.total_geral > 0) {
                    catalogoExtras.push({
                        id: 'sv_' + sv.id,
                        insumo_id: sv.id,
                        is_sem_vinculo: true,
                        descricao: sv.descricao,
                        unidade: sv.unidade,
                        saldo_sede: sv.qtd_sede,
                        saldo_complexo: sv.qtd_complexo,
                        saldo_regional: sv.qtd_regional,
                        oficina_ids: sv.oficina_ids,
                        oficinas_nomes: sv.oficinas_nomes
                    });
                }
            });

            catalogoExtras.sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));

            const idsPadrao = new Set((processo.insumos_envio || []).map(i => String(i.insumo_id)));
            const { data: movsExtras } = await supabase.schema('insumo').from('movimentacoes')
                .select('insumo_id')
                .eq('processo_destino_id', processo.id)
                .eq('tipo', 'SAIDA_PRODUCAO');

            const idsExtrasJaEnviados = [...new Set((movsExtras || []).map(m => String(m.insumo_id)))].filter(id => !idsPadrao.has(id));
            
            processo.extras_anteriores = [];
            idsExtrasJaEnviados.forEach(id => {
                const extraItem = catalogoExtras.find(c => String(c.id) === String(id));
                if (extraItem) {
                    processo.extras_anteriores.push(extraItem);
                }
            });

            processo.historico_lotes = await EstoqueService.obterHistoricoEnvios(processo.id);

            res.render('envios/gerenciar', { processo, oficinas, user: res.locals.user, catalogoExtras });
        } catch(error) {
            console.error(error);
            res.status(500).send(`<h2 style="color:red;">ERRO:</h2><pre>${error.stack}</pre>`);
        }
    },

    registrarEnvio: async (req, res) => {
        try {
            const { selecionados, recebido_por } = req.body;
            const processoId = req.params.id;
            const entregue_por = res.locals.user ? res.locals.user.username : 'Sistema';

            if (!recebido_por || recebido_por.trim() === '') {
                return res.status(400).send(`<script>alert('É obrigatório informar quem recebeu o material.'); window.history.back();</script>`);
            }

            if (!selecionados) {
                return res.status(400).send(`<script>alert('Nenhum insumo foi selecionado para envio.'); window.history.back();</script>`);
            }

            const idsSelecionados = Array.isArray(selecionados) ? selecionados : [selecionados];
            
            const loteEnviosPadrao = [];
            const loteEnviosSemVinculo = [];

            for (let idStr of idsSelecionados) {
                const qtd = req.body[`qtd_${idStr}`];
                const origem = req.body[`origem_${idStr}`];
                
                if (!qtd || !origem) throw new Error("Preencha a quantidade e origem de todos os itens selecionados.");

                if (String(idStr).startsWith('sv_')) {
                    loteEnviosSemVinculo.push({
                        insumo_id: idStr.replace('sv_', ''),
                        quantidade: qtd,
                        origem: origem.replace('GERAL_', '')
                    });
                } else {
                    loteEnviosPadrao.push({ 
                        insumo_id: idStr, 
                        quantidade: qtd, 
                        origem: origem 
                    });
                }
            }

            const loteIdUnico = Date.now().toString();

            if (loteEnviosPadrao.length > 0) {
                await EstoqueService.registrarEnvioProducaoLote(processoId, loteEnviosPadrao, entregue_por, recebido_por, loteIdUnico);
            }

            if (loteEnviosSemVinculo.length > 0) {
                // ADD PROCID: X para conseguir achar independente dos itens normais
                const obsGeral = `Envio p/ Produção [ProcID: ${processoId}] [LoteID: ${loteIdUnico}]`;
                await InsumoSemVinculoService.registrarSaidaLote(loteEnviosSemVinculo, entregue_por, recebido_por, obsGeral, loteIdUnico);
            }
            
            res.redirect(`/envios/comprovante/${loteIdUnico}`);
            
        } catch(error) {
            console.error("Erro no registrarEnvio:", error);
            res.status(400).send(`<script>alert('${error.message}'); window.history.back();</script>`);
        }
    },

    comprovante: async (req, res) => {
        try {
            const comprovante = await EstoqueService.obterComprovanteEnvioLote(req.params.movimentacaoId);
            if (!comprovante) return res.status(404).send('Comprovante não encontrado.');
            
            res.render('envios/comprovante', { comprovante });
        } catch (error) {
            console.error(error);
            res.status(500).send('Erro ao gerar comprovante.');
        }
    }
};

module.exports = envioController;
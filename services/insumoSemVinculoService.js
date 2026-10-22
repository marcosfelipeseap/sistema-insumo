// services/insumoSemVinculoService.js
const supabase = require('../config/db');

class InsumoSemVinculoService {

    static async listarOficinas() {
        const { data: oficinas, error } = await supabase
            .schema('orcamento')
            .from('oficinas')
            .select('id, nome')
            .order('nome');
        if (error) return [];
        return (oficinas || []).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
    }

    static async listarTodos() {
        const { data, error } = await supabase
            .schema('insumo')
            .from('insumos_sem_vinculo')
            .select('*')
            .order('descricao', { ascending: true });

        if (error) throw error;

        return (data || []).map(item => ({
            ...item,
            qtd_sede: Number(item.qtd_sede || 0),
            qtd_complexo: Number(item.qtd_complexo || 0),
            qtd_regional: Number(item.qtd_regional || 0),
            total_geral: Number(item.qtd_sede || 0) + Number(item.qtd_complexo || 0) + Number(item.qtd_regional || 0)
        }));
    }

    static async obterDetalhesInsumo(id) {
        const { data: insumo, error } = await supabase
            .schema('insumo')
            .from('insumos_sem_vinculo')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !insumo) return null;

        insumo.qtd_sede = Number(insumo.qtd_sede || 0);
        insumo.qtd_complexo = Number(insumo.qtd_complexo || 0);
        insumo.qtd_regional = Number(insumo.qtd_regional || 0);
        insumo.total_geral = insumo.qtd_sede + insumo.qtd_complexo + insumo.qtd_regional;

        const { data: movs } = await supabase
            .schema('insumo')
            .from('movimentacoes_sem_vinculo')
            .select('*')
            .eq('insumo_id', id)
            .order('data_movimentacao', { ascending: false });

        insumo.historico_movimentacoes = movs || [];
        return insumo;
    }

    static async listarUltimasMovimentacoes(limite = 100) {
        const { data: movs, error } = await supabase
            .schema('insumo')
            .from('movimentacoes_sem_vinculo')
            .select('*')
            .order('data_movimentacao', { ascending: false })
            .limit(limite);

        if (error) throw error;

        const { data: insumos } = await supabase
            .schema('insumo')
            .from('insumos_sem_vinculo')
            .select('id, descricao, unidade, ref, oficina');

        const mapaInsumos = {};
        (insumos || []).forEach(i => { mapaInsumos[i.id] = i; });

        return (movs || []).map(m => {
            const ins = mapaInsumos[m.insumo_id] || {};
            return {
                ...m,
                insumo_nome: ins.descricao || 'Insumo Removido',
                unidade: ins.unidade || 'UN',
                ref: ins.ref || '-',
                oficina: ins.oficina || 'Uso Geral'
            };
        });
    }

    static async obterHistoricoLotesSaida(limite = 50) {
        const { data: movs, error } = await supabase
            .schema('insumo')
            .from('movimentacoes_sem_vinculo')
            .select('*')
            .eq('tipo', 'SAIDA')
            .order('data_movimentacao', { ascending: false })
            .limit(limite * 4);

        if (error || !movs || movs.length === 0) return [];

        const { data: insumos } = await supabase
            .schema('insumo')
            .from('insumos_sem_vinculo')
            .select('id, descricao, unidade, ref, oficina');

        const mapaInsumos = {};
        (insumos || []).forEach(i => { mapaInsumos[i.id] = i; });

        const lotesMap = {};
        movs.forEach(m => {
            const chaveLote = m.lote_id || String(m.id);
            if (!lotesMap[chaveLote]) {
                lotesMap[chaveLote] = {
                    lote_id: chaveLote,
                    data: m.data_movimentacao,
                    entregue_por: m.responsavel || 'Sistema',
                    recebido_por: m.retirado_por || 'Não informado',
                    observacao: m.observacao || '-',
                    itens: []
                };
            }
            const ins = mapaInsumos[m.insumo_id] || {};
            lotesMap[chaveLote].itens.push({
                insumo_id: m.insumo_id,
                nome: ins.descricao || 'Insumo Removido',
                unidade: ins.unidade || 'UN',
                local: m.local,
                quantidade: Math.abs(Number(m.quantidade || 0))
            });
        });

        return Object.values(lotesMap)
            .sort((a, b) => new Date(b.data) - new Date(a.data))
            .slice(0, limite);
    }

    static async criarInsumo({ descricao, unidade, ref, oficina, qtd_sede, qtd_complexo, qtd_regional }, usuario) {
        if (!descricao || descricao.trim() === '') {
            throw new Error('A descrição do insumo é obrigatória.');
        }

        const sede = Math.max(0, Number(qtd_sede || 0));
        const comp = Math.max(0, Number(qtd_complexo || 0));
        const reg = Math.max(0, Number(qtd_regional || 0));

        const { data: novo, error } = await supabase
            .schema('insumo')
            .from('insumos_sem_vinculo')
            .insert([{
                descricao: descricao.trim(),
                unidade: (unidade || 'UN').trim().toUpperCase(),
                ref: ref ? ref.trim() : null,
                oficina: oficina ? oficina.trim() : 'Uso Geral',
                qtd_sede: sede,
                qtd_complexo: comp,
                qtd_regional: reg
            }])
            .select()
            .single();

        if (error) throw new Error(`Erro ao cadastrar insumo: ${error.message}`);

        const movsIniciais = [];
        let saldoAcumulado = 0;

        if (sede > 0) {
            saldoAcumulado += sede;
            movsIniciais.push({
                insumo_id: novo.id,
                tipo: 'ENTRADA',
                local: 'SEDE',
                quantidade: sede,
                saldo_momento: saldoAcumulado,
                responsavel: usuario,
                observacao: 'Saldo inicial no cadastro'
            });
        }
        if (comp > 0) {
            saldoAcumulado += comp;
            movsIniciais.push({
                insumo_id: novo.id,
                tipo: 'ENTRADA',
                local: 'COMPLEXO',
                quantidade: comp,
                saldo_momento: saldoAcumulado,
                responsavel: usuario,
                observacao: 'Saldo inicial no cadastro'
            });
        }
        if (reg > 0) {
            saldoAcumulado += reg;
            movsIniciais.push({
                insumo_id: novo.id,
                tipo: 'ENTRADA',
                local: 'REGIONAL',
                quantidade: reg,
                saldo_momento: saldoAcumulado,
                responsavel: usuario,
                observacao: 'Saldo inicial no cadastro'
            });
        }

        if (movsIniciais.length > 0) {
            await supabase.schema('insumo').from('movimentacoes_sem_vinculo').insert(movsIniciais);
        }

        return novo;
    }

    static async editarInsumo(id, { descricao, unidade, ref, oficina, qtd_sede, qtd_complexo, qtd_regional, observacao_ajuste }, usuario, documentoPath = null) {
        if (!descricao || descricao.trim() === '') {
            throw new Error('A descrição do insumo é obrigatória.');
        }

        const { data: atual, error: errBusca } = await supabase
            .schema('insumo')
            .from('insumos_sem_vinculo')
            .select('*')
            .eq('id', id)
            .single();

        if (errBusca || !atual) throw new Error('Insumo não encontrado.');

        const updates = {
            descricao: descricao.trim(),
            unidade: (unidade || 'UN').trim().toUpperCase(),
            ref: ref ? ref.trim() : null,
            oficina: oficina ? oficina.trim() : 'Uso Geral',
            updated_at: new Date().toISOString()
        };

        const temAjusteSaldo = qtd_sede !== undefined && qtd_complexo !== undefined && qtd_regional !== undefined;

        if (temAjusteSaldo) {
            const nSede = Number(qtd_sede);
            const nComp = Number(qtd_complexo);
            const nReg = Number(qtd_regional);

            if (isNaN(nSede) || isNaN(nComp) || isNaN(nReg) || nSede < 0 || nComp < 0 || nReg < 0) {
                throw new Error('Os saldos informados devem ser valores válidos maiores ou iguais a zero.');
            }

            const diffSede = nSede - Number(atual.qtd_sede || 0);
            const diffComp = nComp - Number(atual.qtd_complexo || 0);
            const diffReg = nReg - Number(atual.qtd_regional || 0);
            const totalDiff = diffSede + diffComp + diffReg;

            updates.qtd_sede = nSede;
            updates.qtd_complexo = nComp;
            updates.qtd_regional = nReg;

            const { error: errUpd } = await supabase
                .schema('insumo')
                .from('insumos_sem_vinculo')
                .update(updates)
                .eq('id', id);

            if (errUpd) throw new Error(`Erro ao salvar alterações: ${errUpd.message}`);

            if (diffSede !== 0 || diffComp !== 0 || diffReg !== 0) {
                const novoTotal = nSede + nComp + nReg;
                const partes = [];
                if (diffSede !== 0) partes.push(`Sede: ${diffSede > 0 ? '+' : ''}${diffSede}`);
                if (diffComp !== 0) partes.push(`Complexo: ${diffComp > 0 ? '+' : ''}${diffComp}`);
                if (diffReg !== 0) partes.push(`Regional: ${diffReg > 0 ? '+' : ''}${diffReg}`);

                await supabase.schema('insumo').from('movimentacoes_sem_vinculo').insert([{
                    insumo_id: id,
                    tipo: 'AJUSTE_MANUAL',
                    local: 'GERAL',
                    quantidade: totalDiff,
                    saldo_momento: novoTotal,
                    responsavel: usuario,
                    documento_url: documentoPath,
                    observacao: `${observacao_ajuste || 'Ajuste manual de estoque'} [Alterou: ${partes.join(' | ')}]`
                }]);
            }
        } else {
            const { error: errUpd } = await supabase
                .schema('insumo')
                .from('insumos_sem_vinculo')
                .update(updates)
                .eq('id', id);

            if (errUpd) throw new Error(`Erro ao atualizar cadastro: ${errUpd.message}`);
        }
    }

    static async ajustarEstoqueDireto(id, { qtd_sede, qtd_complexo, qtd_regional, justificativa }, usuario, documentoPath = null) {
        const { data: atual, error } = await supabase
            .schema('insumo')
            .from('insumos_sem_vinculo')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !atual) throw new Error('Insumo não encontrado.');

        await this.editarInsumo(
            id,
            {
                descricao: atual.descricao,
                unidade: atual.unidade,
                ref: atual.ref,
                oficina: atual.oficina,
                qtd_sede,
                qtd_complexo,
                qtd_regional,
                observacao_ajuste: justificativa
            },
            usuario,
            documentoPath
        );
    }

    // Entrada Única ou Múltipla (Lote)
    static async registrarEntradaLote(itensEntrada, observacaoGeral, usuario) {
        if (!itensEntrada || itensEntrada.length === 0) {
            throw new Error('Informe a quantidade de entrada para pelo menos um insumo.');
        }

        const loteId = 'ENT-' + Date.now().toString();
        const insercoesMov = [];

        for (const item of itensEntrada) {
            const insumoId = Number(item.insumo_id);
            const addSede = Math.max(0, Number(item.qtd_sede || 0));
            const addComp = Math.max(0, Number(item.qtd_complexo || 0));
            const addReg = Math.max(0, Number(item.qtd_regional || 0));

            if (addSede === 0 && addComp === 0 && addReg === 0) continue;

            const { data: atual, error } = await supabase
                .schema('insumo')
                .from('insumos_sem_vinculo')
                .select('*')
                .eq('id', insumoId)
                .single();

            if (error || !atual) continue;

            let sede = Number(atual.qtd_sede || 0);
            let comp = Number(atual.qtd_complexo || 0);
            let reg = Number(atual.qtd_regional || 0);

            if (addSede > 0) {
                sede += addSede;
                insercoesMov.push({
                    insumo_id: insumoId,
                    tipo: 'ENTRADA',
                    local: 'SEDE',
                    quantidade: addSede,
                    saldo_momento: sede + comp + reg,
                    responsavel: usuario,
                    lote_id: loteId,
                    observacao: observacaoGeral || 'Entrada no Almoxarifado Sede'
                });
            }
            if (addComp > 0) {
                comp += addComp;
                insercoesMov.push({
                    insumo_id: insumoId,
                    tipo: 'ENTRADA',
                    local: 'COMPLEXO',
                    quantidade: addComp,
                    saldo_momento: sede + comp + reg,
                    responsavel: usuario,
                    lote_id: loteId,
                    observacao: observacaoGeral || 'Entrada no Almoxarifado Complexo'
                });
            }
            if (addReg > 0) {
                reg += addReg;
                insercoesMov.push({
                    insumo_id: insumoId,
                    tipo: 'ENTRADA',
                    local: 'REGIONAL',
                    quantidade: addReg,
                    saldo_momento: sede + comp + reg,
                    responsavel: usuario,
                    lote_id: loteId,
                    observacao: observacaoGeral || 'Entrada no Almoxarifado Regional'
                });
            }

            await supabase
                .schema('insumo')
                .from('insumos_sem_vinculo')
                .update({
                    qtd_sede: sede,
                    qtd_complexo: comp,
                    qtd_regional: reg,
                    updated_at: new Date().toISOString()
                })
                .eq('id', insumoId);
        }

        if (insercoesMov.length === 0) {
            throw new Error('Nenhuma quantidade válida foi informada para entrada.');
        }

        const { error: errMov } = await supabase
            .schema('insumo')
            .from('movimentacoes_sem_vinculo')
            .insert(insercoesMov);

        if (errMov) throw new Error(`Erro ao gravar histórico de entradas: ${errMov.message}`);

        return loteId;
    }

    // Saída Única ou Múltipla (Lote) com geração de recibo/comprovante
    static async registrarSaidaLote(loteSaidas, entreguePor, recebidoPor, observacaoGeral) {
        if (!recebidoPor || recebidoPor.trim() === '') {
            throw new Error('É obrigatório informar quem está recebendo/retirando o material.');
        }
        if (!loteSaidas || loteSaidas.length === 0) {
            throw new Error('Selecione pelo menos um insumo para registrar a saída.');
        }

        const loteId = Date.now().toString();
        const operacoesValidadas = [];

        // 1. Valida todos os saldos antes de debitar qualquer item
        for (const item of loteSaidas) {
            const insumoId = Number(item.insumo_id);
            const qtd = Number(item.quantidade);
            const local = String(item.origem || '').trim().toUpperCase();

            if (isNaN(qtd) || qtd <= 0) {
                throw new Error('Todas as quantidades de saída devem ser maiores que zero.');
            }
            if (!['SEDE', 'COMPLEXO', 'REGIONAL'].includes(local)) {
                throw new Error('Selecione a origem (Sede, Complexo ou Regional) para todos os itens.');
            }

            const { data: insumo, error } = await supabase
                .schema('insumo')
                .from('insumos_sem_vinculo')
                .select('*')
                .eq('id', insumoId)
                .single();

            if (error || !insumo) {
                throw new Error(`Insumo ID ${insumoId} não encontrado.`);
            }

            let sede = Number(insumo.qtd_sede || 0);
            let comp = Number(insumo.qtd_complexo || 0);
            let reg = Number(insumo.qtd_regional || 0);

            if (local === 'SEDE') {
                if (sede < qtd) throw new Error(`Saldo insuficiente na Sede para "${insumo.descricao}". Disponível: ${sede}, Solicitado: ${qtd}`);
                sede -= qtd;
            } else if (local === 'COMPLEXO') {
                if (comp < qtd) throw new Error(`Saldo insuficiente no Complexo para "${insumo.descricao}". Disponível: ${comp}, Solicitado: ${qtd}`);
                comp -= qtd;
            } else if (local === 'REGIONAL') {
                if (reg < qtd) throw new Error(`Saldo insuficiente na Regional para "${insumo.descricao}". Disponível: ${reg}, Solicitado: ${qtd}`);
                reg -= qtd;
            }

            operacoesValidadas.push({
                insumo_id: insumo.id,
                local,
                qtd,
                novo_sede: sede,
                novo_comp: comp,
                novo_reg: reg,
                novo_total: sede + comp + reg
            });
        }

        // 2. Aplica os débitos e grava as movimentações com o mesmo lote_id
        const insercoesMov = [];
        for (const op of operacoesValidadas) {
            const { error: errUpd } = await supabase
                .schema('insumo')
                .from('insumos_sem_vinculo')
                .update({
                    qtd_sede: op.novo_sede,
                    qtd_complexo: op.novo_comp,
                    qtd_regional: op.novo_reg,
                    updated_at: new Date().toISOString()
                })
                .eq('id', op.insumo_id);

            if (errUpd) throw new Error(`Erro ao debitar estoque: ${errUpd.message}`);

            insercoesMov.push({
                insumo_id: op.insumo_id,
                tipo: 'SAIDA',
                local: op.local,
                quantidade: -op.qtd,
                saldo_momento: op.novo_total,
                responsavel: entreguePor,
                retirado_por: recebidoPor.trim(),
                lote_id: loteId,
                observacao: observacaoGeral && observacaoGeral.trim() !== ''
                    ? observacaoGeral.trim()
                    : `Saída avulsa - Almoxarifado ${op.local}`
            });
        }

        const { error: errMov } = await supabase
            .schema('insumo')
            .from('movimentacoes_sem_vinculo')
            .insert(insercoesMov);

        if (errMov) throw new Error(`Erro ao registrar saída: ${errMov.message}`);

        return loteId;
    }

    static async obterComprovanteSaida(loteId) {
        let movs = [];
        const { data: movsPorLote } = await supabase
            .schema('insumo')
            .from('movimentacoes_sem_vinculo')
            .select('*')
            .eq('lote_id', String(loteId))
            .eq('tipo', 'SAIDA');

        if (movsPorLote && movsPorLote.length > 0) {
            movs = movsPorLote;
        } else if (!isNaN(Number(loteId))) {
            const { data: movUnica } = await supabase
                .schema('insumo')
                .from('movimentacoes_sem_vinculo')
                .select('*')
                .eq('id', Number(loteId))
                .single();
            if (movUnica) movs = [movUnica];
        }

        if (movs.length === 0) return null;

        const insumoIds = [...new Set(movs.map(m => m.insumo_id))];
        const { data: insumos } = await supabase
            .schema('insumo')
            .from('insumos_sem_vinculo')
            .select('*')
            .in('id', insumoIds);

        const mapaInsumos = {};
        (insumos || []).forEach(i => { mapaInsumos[i.id] = i; });

        const mapaOrigem = {
            'SEDE': 'Almoxarifado Sede',
            'COMPLEXO': 'Almoxarifado Complexo',
            'REGIONAL': 'Almoxarifado Regional'
        };

        const itens = movs.map(m => {
            const ins = mapaInsumos[m.insumo_id] || {};
            return {
                descricao: ins.descricao || `Insumo ID ${m.insumo_id}`,
                ref: ins.ref || '-',
                oficina: ins.oficina || 'Uso Geral',
                unidade: ins.unidade || 'UN',
                quantidade: Math.abs(Number(m.quantidade || 0)),
                origem: mapaOrigem[m.local] || m.local
            };
        });

        return {
            lote_id: movs[0].lote_id || movs[0].id,
            data_movimentacao: movs[0].data_movimentacao,
            entregue_por: movs[0].responsavel || 'Sistema',
            recebido_por: movs[0].retirado_por || 'Não informado',
            observacao: movs[0].observacao || '-',
            itens
        };
    }

    static async excluirInsumo(id) {
        const { error } = await supabase
            .schema('insumo')
            .from('insumos_sem_vinculo')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Erro ao excluir insumo: ${error.message}`);
    }
}

module.exports = InsumoSemVinculoService;
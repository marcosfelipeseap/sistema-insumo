const supabase = require('../config/db');
const ProcessoService = require('./processoService');

class EstoqueService {
    
    static async listarOficinas() {
        const { data: oficinas, error } = await supabase.schema('orcamento').from('oficinas').select('id, nome').order('nome');
        if (error) throw error;
        return (oficinas || []).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
    }

    static async listarEstoqueGeral() {
        const { data: insumos, error } = await supabase.schema('orcamento').from('insumo').select('id, descricao, unidade, ref').order('descricao');
        if (error) throw error;
        
        const { data: composicoesProd } = await supabase.schema('orcamento').from('produto_composicao').select('insumo_id, produto_id');
        const { data: produtos } = await supabase.schema('orcamento').from('produto').select('id, grupo_id');
        const { data: grupos } = await supabase.schema('orcamento').from('grupos').select('id, nome, oficina_id');
        const { data: oficinas } = await supabase.schema('orcamento').from('oficinas').select('id, nome');

        const mapaProdGrupo = {};
        if (produtos) produtos.forEach(p => { mapaProdGrupo[p.id] = p.grupo_id; });

        const mapaGrupoOficina = {};
        if (grupos) grupos.forEach(g => { mapaGrupoOficina[g.id] = g.oficina_id; });

        const mapaOficinaNome = {};
        if (oficinas) oficinas.forEach(o => { mapaOficinaNome[o.id] = o.nome; });

        const idsComProduto = new Set();
        const insumoOficinasMap = {};

        if (composicoesProd) {
            composicoesProd.forEach(c => {
                idsComProduto.add(c.insumo_id);
                const grupoId = mapaProdGrupo[c.produto_id];
                const oficinaId = grupoId ? mapaGrupoOficina[grupoId] : null;
                if (oficinaId) {
                    if (!insumoOficinasMap[c.insumo_id]) insumoOficinasMap[c.insumo_id] = new Set();
                    insumoOficinasMap[c.insumo_id].add(oficinaId);
                }
            });
        }
        
        const { data: estoque } = await supabase.schema('insumo').from('estoque_geral').select('*');
        const mapaEstoque = {};
        if (estoque) { estoque.forEach(e => { mapaEstoque[e.insumo_id] = e; }); }
        
        const { data: reservas } = await supabase.schema('insumo').from('estoque_reservas').select('insumo_id, quantidade_reservada');
        const mapaReservas = {};
        if (reservas) { 
            reservas.forEach(r => { 
                if (!mapaReservas[r.insumo_id]) mapaReservas[r.insumo_id] = 0; 
                mapaReservas[r.insumo_id] += Number(r.quantidade_reservada); 
            }); 
        }

        const grupoMap = {};
        insumos.forEach(ins => {
            if (!ins.ref || String(ins.ref).trim() === '') return; 
            
            const desc = ins.descricao.trim();
            if (!grupoMap[desc]) {
                grupoMap[desc] = { 
                    id_representante: ins.id, 
                    descricao: desc, 
                    unidade: ins.unidade, 
                    ref: ins.ref, 
                    ids: [], 
                    oficina_ids_set: new Set(),
                    qtd_sede: 0, 
                    qtd_complexo: 0, 
                    qtd_regional: 0, 
                    qtd_separada: 0, 
                    tem_ligacao: false 
                };
            }
            grupoMap[desc].ids.push(ins.id);
            if (idsComProduto.has(ins.id)) grupoMap[desc].tem_ligacao = true;
            
            if (insumoOficinasMap[ins.id]) {
                insumoOficinasMap[ins.id].forEach(ofId => grupoMap[desc].oficina_ids_set.add(ofId));
            }

            const est = mapaEstoque[ins.id];
            if (est) { 
                grupoMap[desc].qtd_sede += Number(est.qtd_sede || 0); 
                grupoMap[desc].qtd_complexo += Number(est.qtd_complexo || 0); 
                grupoMap[desc].qtd_regional += Number(est.qtd_regional || 0); 
            }
            const res = mapaReservas[ins.id];
            if (res) { grupoMap[desc].qtd_separada += Number(res); }
        });

        return Object.values(grupoMap)
            .filter(item => item.tem_ligacao)
            .map(item => {
                const oficinaIds = Array.from(item.oficina_ids_set);
                const oficinasNomes = oficinaIds
                    .map(id => mapaOficinaNome[id])
                    .filter(Boolean)
                    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

                return { 
                    id: item.id_representante,
                    id_representante: item.id_representante,
                    descricao: item.descricao,
                    unidade: item.unidade,
                    ref: item.ref,
                    ids: item.ids,
                    oficina_ids: oficinaIds,
                    oficinas_nomes: oficinasNomes,
                    oficinas_texto: oficinasNomes.length > 0 ? oficinasNomes.join(', ') : 'Sem Oficina',
                    qtd_sede: item.qtd_sede,
                    qtd_complexo: item.qtd_complexo,
                    qtd_regional: item.qtd_regional,
                    qtd_separada: item.qtd_separada,
                    total_geral: item.qtd_sede + item.qtd_complexo + item.qtd_regional 
                };
            })
            .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
    }

    static async listarInsumosSemVinculoFormatados() {
        const { data, error } = await supabase
            .schema('insumo')
            .from('insumos_sem_vinculo')
            .select('*')
            .order('descricao', { ascending: true });

        if (error) return [];

        return (data || []).map(item => {
            const sede = Number(item.qtd_sede || 0);
            const complexo = Number(item.qtd_complexo || 0);
            const regional = Number(item.qtd_regional || 0);
            return {
                id: item.id,
                is_sem_vinculo: true,
                descricao: item.descricao,
                unidade: item.unidade || 'UN',
                ref: item.ref || 'S/REF',
                ids: [item.id],
                oficina_ids: [],
                oficinas_nomes: [item.oficina || 'Uso Geral'],
                oficinas_texto: item.oficina || 'Uso Geral',
                qtd_sede: sede,
                qtd_complexo: complexo,
                qtd_regional: regional,
                qtd_separada: 0,
                total_geral: sede + complexo + regional
            };
        });
    }

    static async obterHistoricoGeralEstoque(filtros = {}) {
        const { data: insumos } = await supabase.schema('orcamento').from('insumo').select('id, descricao, unidade, ref');
        const insumoMap = {};
        if (insumos) insumos.forEach(i => insumoMap[i.id] = i);

        const { data: estoqueGeral } = await supabase.schema('insumo').from('estoque_geral').select('*');
        const { data: estoqueReservas } = await supabase.schema('insumo').from('estoque_reservas').select('*');
        
        const saldoAtual = {};
        if (insumos) insumos.forEach(i => saldoAtual[i.id] = 0);
        if (estoqueGeral) {
            estoqueGeral.forEach(e => { saldoAtual[e.insumo_id] += Number(e.qtd_sede || 0) + Number(e.qtd_complexo || 0) + Number(e.qtd_regional || 0); });
        }
        if (estoqueReservas) {
            estoqueReservas.forEach(r => { saldoAtual[r.insumo_id] += Number(r.quantidade_reservada || 0); });
        }

        const { data: allMovs, error } = await supabase.schema('insumo').from('movimentacoes').select('*').order('data_movimentacao', { ascending: false });
        if (error) throw error;

        let movimentacoesFormatadas = (allMovs || []).map(m => {
            const ins = insumoMap[m.insumo_id] || {};
            let obsLimpa = m.observacao || '-';
            let localAfetado = 'Geral / Outros';
            let qtdExibicao = m.quantidade;
            let variacaoEcossistema = 0;
            let docLink = null;

            if (obsLimpa.includes('| [Doc: ')) {
                const parts = obsLimpa.split('| [Doc: ');
                obsLimpa = parts[0].trim();
                docLink = parts[1].replace(']', '').trim();
            }

            if (m.tipo.includes('SEDE') || obsLimpa.includes('Sede')) localAfetado = 'Almoxarifado Sede';
            else if (m.tipo.includes('COMPLEXO') || obsLimpa.includes('Complexo')) localAfetado = 'Almoxarifado Complexo';
            else if (m.tipo.includes('REGIONAL') || obsLimpa.includes('Regional')) localAfetado = 'Almoxarifado Regional';
            else if (m.tipo === 'RESERVA' || m.tipo.includes('RESERVA')) localAfetado = 'Reserva / Separação';

            if (m.tipo.includes('ENTRADA') || m.tipo === 'RESERVA_AJUSTE_MAIS') {
                variacaoEcossistema = m.quantidade;
            } else if (m.tipo === 'SAIDA_PRODUCAO' || m.tipo === 'RESERVA_AJUSTE_MENOS') {
                variacaoEcossistema = -m.quantidade;
                qtdExibicao = -m.quantidade; 
            } else if (m.tipo === 'AJUSTE_MANUAL') {
                if (obsLimpa.includes('Diferenças ->')) {
                    const partes = obsLimpa.split('Diferenças ->');
                    obsLimpa = partes[0].trim();
                    const diffsStr = partes[1];
                    const vSede = parseFloat((diffsStr.match(/Sede:\s*([\+\-]?\d+\.?\d*)/) || [0, 0])[1]);
                    const vComp = parseFloat((diffsStr.match(/Complexo:\s*([\+\-]?\d+\.?\d*)/) || [0, 0])[1]);
                    const vReg = parseFloat((diffsStr.match(/Reg:\s*([\+\-]?\d+\.?\d*)/) || [0, 0])[1]);
                    
                    variacaoEcossistema = vSede + vComp + vReg;
                    qtdExibicao = variacaoEcossistema;

                    let mudancas = [];
                    if (vSede !== 0) mudancas.push(`Sede: ${vSede > 0 ? '+' : ''}${vSede}`);
                    if (vComp !== 0) mudancas.push(`Complexo: ${vComp > 0 ? '+' : ''}${vComp}`);
                    if (vReg !== 0) mudancas.push(`Regional: ${vReg > 0 ? '+' : ''}${vReg}`);
                    
                    obsLimpa += mudancas.length > 0 ? ` [Alterou: ${mudancas.join(' | ')}]` : ` [Nenhuma alteração real]`;
                } else {
                    variacaoEcossistema = m.quantidade;
                    qtdExibicao = m.quantidade;
                }
            } else if (m.tipo.includes('DEVOLUCAO')) {
                variacaoEcossistema = 0;
                qtdExibicao = m.quantidade; 
            } else if (m.tipo === 'RESERVA' || m.tipo === 'TRANSFERENCIA_RESERVA') {
                variacaoEcossistema = 0;
            }

            const saldoNoMomento = saldoAtual[m.insumo_id] || 0;
            saldoAtual[m.insumo_id] = saldoNoMomento - variacaoEcossistema;

            return {
                id: m.id,
                data: m.data_movimentacao || m.created_at,
                tipo: m.tipo,
                local: localAfetado,
                insumo_id: m.insumo_id,
                insumo_nome: ins.descricao || 'Insumo Removido',
                unidade: ins.unidade || '-',
                ref: ins.ref || '-',
                quantidade_exibicao: qtdExibicao,
                saldo_momento: saldoNoMomento,
                usuario: m.recebido_por || m.entregue_por || 'Sistema',
                observacao: obsLimpa,
                documento_url: docLink
            };
        });

        let filtradosPreliminares = movimentacoesFormatadas;

        if (filtros.data_inicio) {
            const dataInicio = new Date(`${filtros.data_inicio}T00:00:00`).getTime();
            filtradosPreliminares = filtradosPreliminares.filter(m => new Date(m.data).getTime() >= dataInicio);
        }
        if (filtros.data_fim) {
            const dataFim = new Date(`${filtros.data_fim}T23:59:59`).getTime();
            filtradosPreliminares = filtradosPreliminares.filter(m => new Date(m.data).getTime() <= dataFim);
        }
        if (filtros.busca_geral && filtros.busca_geral.trim() !== '') {
            const termo = filtros.busca_geral.toLowerCase();
            filtradosPreliminares = filtradosPreliminares.filter(m => 
                m.observacao.toLowerCase().includes(termo) ||
                m.usuario.toLowerCase().includes(termo) ||
                m.tipo.toLowerCase().includes(termo) ||
                m.insumo_nome.toLowerCase().includes(termo) ||
                m.local.toLowerCase().includes(termo) ||
                m.ref.toLowerCase().includes(termo)
            );
        }

        const insumosSobreviventesIds = [...new Set(filtradosPreliminares.map(m => String(m.insumo_id)))];
        const insumosDisponiveis = insumosSobreviventesIds.map(id => insumoMap[id]).filter(Boolean).sort((a, b) => a.descricao.localeCompare(b.descricao));

        let movimentacoesFinais = filtradosPreliminares;
        if (filtros.insumos && filtros.insumos.length > 0) {
            const idsFiltro = filtros.insumos.map(String);
            movimentacoesFinais = movimentacoesFinais.filter(m => idsFiltro.includes(String(m.insumo_id)));
        }

        return { movimentacoes: movimentacoesFinais, insumosDisponiveis: insumosDisponiveis };
    }

    static async ajustarEstoque(insumoId, novaQtdSede, novaQtdComplexo, novaQtdRegional, usuario, justificativa, documentoPath) {
        const sede = Number(novaQtdSede);
        const comp = Number(novaQtdComplexo);
        const reg = Number(novaQtdRegional);

        if (isNaN(sede) || isNaN(comp) || isNaN(reg) || sede < 0 || comp < 0 || reg < 0) {
            throw new Error("Valores inválidos para ajuste de estoque. Apenas números positivos são permitidos.");
        }

        const { data: insumoBase } = await supabase.schema('orcamento').from('insumo').select('descricao').eq('id', insumoId).single();
        if (!insumoBase) throw new Error("Insumo não encontrado.");

        const descricaoAlvo = insumoBase.descricao.trim();
        const { data: todosComMesmaDesc } = await supabase.schema('orcamento').from('insumo').select('id').eq('descricao', descricaoAlvo);
        const allIds = todosComMesmaDesc ? todosComMesmaDesc.map(i => i.id) : [insumoId];

        const { data: estoqueList } = await supabase.schema('insumo').from('estoque_geral').select('*').in('insumo_id', allIds);
        
        let sumSede = 0, sumComp = 0, sumReg = 0;
        if (estoqueList) {
            estoqueList.forEach(e => {
                sumSede += Number(e.qtd_sede || 0);
                sumComp += Number(e.qtd_complexo || 0);
                sumReg += Number(e.qtd_regional || 0);
            });
        }

        const diffSede = sede - sumSede;
        const diffComp = comp - sumComp;
        const diffReg = reg - sumReg;

        const { data: geralTarget } = await supabase.schema('insumo').from('estoque_geral').select('*').eq('insumo_id', insumoId).single();
        if (geralTarget) {
            await supabase.schema('insumo').from('estoque_geral').update({ qtd_sede: sede, qtd_complexo: comp, qtd_regional: reg, updated_at: new Date().toISOString() }).eq('insumo_id', insumoId);
        } else {
            await supabase.schema('insumo').from('estoque_geral').insert([{ insumo_id: insumoId, qtd_sede: sede, qtd_complexo: comp, qtd_regional: reg }]);
        }

        const otherIds = allIds.filter(id => id !== insumoId);
        if (otherIds.length > 0) {
            await supabase.schema('insumo').from('estoque_geral').update({ qtd_sede: 0, qtd_complexo: 0, qtd_regional: 0 }).in('insumo_id', otherIds);
        }

        const sinalSede = diffSede > 0 ? '+' : '';
        const sinalComp = diffComp > 0 ? '+' : '';
        const sinalReg = diffReg > 0 ? '+' : '';
        
        let observacaoDetalhada = `Ajuste Manual (${justificativa}). Diferenças -> Sede: ${sinalSede}${diffSede.toFixed(2)} | Complexo: ${sinalComp}${diffComp.toFixed(2)} | Reg: ${sinalReg}${diffReg.toFixed(2)}`;
        
        if (documentoPath) {
            observacaoDetalhada += ` | [Doc: ${documentoPath}]`;
        }

        const totalDiff = diffSede + diffComp + diffReg;
        
        await supabase.schema('insumo').from('movimentacoes').insert([{
            tipo: 'AJUSTE_MANUAL',
            insumo_id: insumoId,
            quantidade: totalDiff, 
            recebido_por: usuario,
            observacao: observacaoDetalhada
        }]);
    }

    static async mapearUsoPorProcesso() {
        const { data: procProdutos } = await supabase.schema('insumo').from('processo_produtos').select('processo_id, produto_id');
        const { data: comp } = await supabase.schema('orcamento').from('produto_composicao').select('produto_id, insumo_id');
        const { data: processos } = await supabase.schema('insumo').from('processos').select('id, numero, nome, status');
        
        const map = {};
        if (procProdutos && comp) {
            procProdutos.forEach(pp => {
                const comps = comp.filter(c => c.produto_id === pp.produto_id);
                comps.forEach(c => { 
                    if (!map[c.insumo_id]) map[c.insumo_id] = []; 
                    if (!map[c.insumo_id].includes(pp.processo_id)) map[c.insumo_id].push(pp.processo_id); 
                });
            });
        }
        return { map, processos: processos || [] };
    }

    static async registrarEntradaGeral(insumoId, local, quantidade, usuario) {
        const { data: atual } = await supabase.schema('insumo').from('estoque_geral').select('*').eq('insumo_id', insumoId).single();
        
        if (atual) {
            const updates = { updated_at: new Date().toISOString() };
            if (local === 'SEDE') updates.qtd_sede = Number(atual.qtd_sede) + Number(quantidade);
            if (local === 'COMPLEXO') updates.qtd_complexo = Number(atual.qtd_complexo) + Number(quantidade);
            if (local === 'REGIONAL') updates.qtd_regional = Number(atual.qtd_regional) + Number(quantidade);
            await supabase.schema('insumo').from('estoque_geral').update(updates).eq('insumo_id', insumoId);
        } else {
            const insertData = { insumo_id: insumoId, qtd_sede: local === 'SEDE' ? quantidade : 0, qtd_complexo: local === 'COMPLEXO' ? quantidade : 0, qtd_regional: local === 'REGIONAL' ? quantidade : 0 };
            await supabase.schema('insumo').from('estoque_geral').insert([insertData]);
        }
        await supabase.schema('insumo').from('movimentacoes').insert([{ tipo: `ENTRADA_${local}`, insumo_id: insumoId, quantidade: quantidade, recebido_por: usuario, observacao: `Entrada via Almoxarifado ${local}` }]);
    }

    static async listarReservasProcesso(processoId) {
        const processo = await ProcessoService.obterDetalhesComposicao(processoId);
        if (!processo) return null;
        
        const { data: reservas } = await supabase.schema('insumo').from('estoque_reservas').select('*').eq('processo_id', processoId);
        const mapaReservas = {};
        if (reservas) { reservas.forEach(r => { mapaReservas[r.insumo_id] = Number(r.quantidade_reservada); }); }
        
        const { data: estoqueGeral } = await supabase.schema('insumo').from('estoque_geral').select('*');
        const mapaGeral = {};
        if (estoqueGeral) { estoqueGeral.forEach(e => { mapaGeral[e.insumo_id] = e; }); }

        processo.insumos_separacao = processo.insumos_consolidados.map(ins => {
            const reservado = mapaReservas[ins.insumo_id] || 0;
            const geral = mapaGeral[ins.insumo_id] || { qtd_sede: 0, qtd_complexo: 0, qtd_regional: 0 };
            const pendenteSeparacao = ins.qtd_arredondada - reservado;
            
            return { 
                ...ins, 
                quantidade_reservada: reservado, 
                quantidade_pendente_separacao: pendenteSeparacao > 0 ? pendenteSeparacao : 0, 
                saldo_sede: geral.qtd_sede, 
                saldo_complexo: geral.qtd_complexo, 
                saldo_regional: geral.qtd_regional, 
                status_separacao: reservado >= ins.qtd_arredondada 
            };
        });
        return processo;
    }

    static async separarParaProcesso(processoId, insumoId, local, quantidade, usuario) {
        const { data: geral } = await supabase.schema('insumo').from('estoque_geral').select('*').eq('insumo_id', insumoId).single();
        if (!geral) throw new Error("Insumo não encontrado no estoque geral");
        
        let saldoLocal = 0;
        if (local === 'SEDE') saldoLocal = geral.qtd_sede;
        else if (local === 'COMPLEXO') saldoLocal = geral.qtd_complexo;
        else if (local === 'REGIONAL') saldoLocal = geral.qtd_regional;

        if (saldoLocal < quantidade) throw new Error(`Saldo insuficiente na ${local}`);

        const updatesGeral = { updated_at: new Date().toISOString() };
        if (local === 'SEDE') updatesGeral.qtd_sede = Number(geral.qtd_sede) - Number(quantidade);
        if (local === 'COMPLEXO') updatesGeral.qtd_complexo = Number(geral.qtd_complexo) - Number(quantidade);
        if (local === 'REGIONAL') updatesGeral.qtd_regional = Number(geral.qtd_regional) - Number(quantidade);
        await supabase.schema('insumo').from('estoque_geral').update(updatesGeral).eq('insumo_id', insumoId);

        const { data: reserva } = await supabase.schema('insumo').from('estoque_reservas').select('*').eq('processo_id', processoId).eq('insumo_id', insumoId).single();
        if (reserva) {
            await supabase.schema('insumo').from('estoque_reservas').update({ quantidade_reservada: Number(reserva.quantidade_reservada) + Number(quantidade), updated_at: new Date().toISOString() }).eq('id', reserva.id);
        } else {
            await supabase.schema('insumo').from('estoque_reservas').insert([{ processo_id: processoId, insumo_id: insumoId, quantidade_reservada: quantidade }]);
        }
        await supabase.schema('insumo').from('movimentacoes').insert([{ tipo: 'RESERVA', processo_destino_id: processoId, insumo_id: insumoId, quantidade: quantidade, entregue_por: usuario, observacao: `Separação do Almoxarifado ${local} para a demanda` }]);
    }

    static async editarReserva(reservaId, novaQuantidade, localAjuste, usuario) {
        const { data: reserva } = await supabase.schema('insumo').from('estoque_reservas').select('*').eq('id', reservaId).single();
        if (!reserva) throw new Error("Reserva não encontrada.");
        const diff = Number(novaQuantidade) - Number(reserva.quantidade_reservada);
        if (diff === 0) return;

        const { data: geral } = await supabase.schema('insumo').from('estoque_geral').select('*').eq('insumo_id', reserva.insumo_id).single();
        const updatesGeral = { updated_at: new Date().toISOString() };
        
        if (diff > 0) { 
            let saldo = 0;
            if (localAjuste === 'SEDE') saldo = Number(geral.qtd_sede);
            else if (localAjuste === 'COMPLEXO') saldo = Number(geral.qtd_complexo);
            else if (localAjuste === 'REGIONAL') saldo = Number(geral.qtd_regional);

            if (saldo < diff) throw new Error(`Saldo insuficiente na ${localAjuste}.`);
            
            if (localAjuste === 'SEDE') updatesGeral.qtd_sede = Number(geral.qtd_sede) - diff;
            if (localAjuste === 'COMPLEXO') updatesGeral.qtd_complexo = Number(geral.qtd_complexo) - diff;
            if (localAjuste === 'REGIONAL') updatesGeral.qtd_regional = Number(geral.qtd_regional) - diff;
        } else { 
            const devolucao = Math.abs(diff);
            if (localAjuste === 'SEDE') updatesGeral.qtd_sede = Number(geral.qtd_sede) + devolucao;
            if (localAjuste === 'COMPLEXO') updatesGeral.qtd_complexo = Number(geral.qtd_complexo) + devolucao;
            if (localAjuste === 'REGIONAL') updatesGeral.qtd_regional = Number(geral.qtd_regional) + devolucao;
        }
        await supabase.schema('insumo').from('estoque_geral').update(updatesGeral).eq('insumo_id', reserva.insumo_id);
        await supabase.schema('insumo').from('estoque_reservas').update({ quantidade_reservada: novaQuantidade, updated_at: new Date().toISOString() }).eq('id', reservaId);
        await supabase.schema('insumo').from('movimentacoes').insert([{ tipo: diff > 0 ? 'RESERVA_AJUSTE_MAIS' : 'RESERVA_AJUSTE_MENOS', processo_destino_id: reserva.processo_id, insumo_id: reserva.insumo_id, quantidade: Math.abs(diff), recebido_por: usuario, observacao: `Ajuste manual da reserva (${localAjuste})` }]);
    }

    static async transferirReserva(reservaId, novoProcessoId, usuario) {
        const { data: reserva } = await supabase.schema('insumo').from('estoque_reservas').select('*').eq('id', reservaId).single();
        if (!reserva || reserva.processo_id == novoProcessoId) return;
        const { data: reservaExistente } = await supabase.schema('insumo').from('estoque_reservas').select('*').eq('processo_id', novoProcessoId).eq('insumo_id', reserva.insumo_id).single();
        
        if (reservaExistente) {
            await supabase.schema('insumo').from('estoque_reservas').update({ quantidade_reservada: Number(reservaExistente.quantidade_reservada) + Number(reserva.quantidade_reservada), updated_at: new Date().toISOString() }).eq('id', reservaExistente.id);
            await supabase.schema('insumo').from('estoque_reservas').delete().eq('id', reservaId);
        } else {
            await supabase.schema('insumo').from('estoque_reservas').update({ processo_id: novoProcessoId, updated_at: new Date().toISOString() }).eq('id', reservaId);
        }
        await supabase.schema('insumo').from('movimentacoes').insert([{ tipo: 'TRANSFERENCIA_RESERVA', processo_origem_id: reserva.processo_id, processo_destino_id: novoProcessoId, insumo_id: reserva.insumo_id, quantidade: reserva.quantidade_reservada, recebido_por: usuario, observacao: 'Transferência de reserva para outro processo' }]);
    }

    static async deletarReserva(reservaId, localRetorno, usuario) {
        const { data: reserva } = await supabase.schema('insumo').from('estoque_reservas').select('*').eq('id', reservaId).single();
        if (!reserva) return;
        const { data: geral } = await supabase.schema('insumo').from('estoque_geral').select('*').eq('insumo_id', reserva.insumo_id).single();
        
        if (geral) {
            const updatesGeral = { updated_at: new Date().toISOString() };
            if (localRetorno === 'SEDE') updatesGeral.qtd_sede = Number(geral.qtd_sede) + Number(reserva.quantidade_reservada);
            if (localRetorno === 'COMPLEXO') updatesGeral.qtd_complexo = Number(geral.qtd_complexo) + Number(reserva.quantidade_reservada);
            if (localRetorno === 'REGIONAL') updatesGeral.qtd_regional = Number(geral.qtd_regional) + Number(reserva.quantidade_reservada);
            await supabase.schema('insumo').from('estoque_geral').update(updatesGeral).eq('insumo_id', reserva.insumo_id);
        }
        await supabase.schema('insumo').from('estoque_reservas').delete().eq('id', reservaId);
        await supabase.schema('insumo').from('movimentacoes').insert([{ tipo: `DEVOLUCAO_${localRetorno}`, processo_origem_id: reserva.processo_id, insumo_id: reserva.insumo_id, quantidade: reserva.quantidade_reservada, recebido_por: usuario, observacao: `Reserva apagada - material retornado para ${localRetorno}` }]);
    }

    static async obterDetalhesInsumo(insumoId) {
        const { data: insumoBase } = await supabase.schema('orcamento').from('insumo').select('*').eq('id', insumoId).single();
        if (!insumoBase) return null;
        
        const descricaoAlvo = insumoBase.descricao.trim();
        const { data: todosComMesmaDesc } = await supabase.schema('orcamento').from('insumo').select('id, descricao, unidade, ref').eq('descricao', descricaoAlvo);
        const allIds = todosComMesmaDesc ? todosComMesmaDesc.map(i => i.id) : [insumoId];

        const { data: estoqueList } = await supabase.schema('insumo').from('estoque_geral').select('*').in('insumo_id', allIds);
        let qtd_sede = 0; let qtd_complexo = 0; let qtd_regional = 0;
        
        if (estoqueList) { 
            estoqueList.forEach(e => { 
                qtd_sede += Number(e.qtd_sede || 0); 
                qtd_complexo += Number(e.qtd_complexo || 0); 
                qtd_regional += Number(e.qtd_regional || 0);
            }); 
        }
        insumoBase.estoque = { qtd_sede, qtd_complexo, qtd_regional };

        const { data: reservas } = await supabase.schema('insumo').from('estoque_reservas').select('id, processo_id, quantidade_reservada').in('insumo_id', allIds);
        let separacoes = [];
        
        if (reservas && reservas.length > 0) {
            const procIds = [...new Set(reservas.map(r => r.processo_id))];
            const { data: processosReserva } = await supabase.schema('insumo').from('processos').select('id, numero, nome, status').in('id', procIds);
            let sepMap = {};
            reservas.forEach(r => {
                if (!sepMap[r.processo_id]) sepMap[r.processo_id] = { id: r.id, qtd: 0 };
                sepMap[r.processo_id].qtd += Number(r.quantidade_reservada);
            });
            if (processosReserva) { 
                separacoes = processosReserva.map(p => ({ 
                    reserva_id: sepMap[p.id].id, processo_id: p.id, numero: p.numero, nome: p.nome, status: p.status, quantidade_separada: sepMap[p.id].qtd 
                })); 
            }
        }
        insumoBase.separacoes = separacoes;

        const { data: procAtivos } = await supabase.schema('insumo').from('processos').select('id, numero, nome').neq('status', 'Concluído').order('numero');
        insumoBase.todos_processos_ativos = procAtivos || [];
        
        const { data: composicoes } = await supabase.schema('orcamento').from('produto_composicao').select('produto_id, insumo_id, indice').in('insumo_id', allIds);
        insumoBase.produtos_orcamento = []; insumoBase.processos_utilizados = [];
        
        if (composicoes && composicoes.length > 0) {
            const produtoIds = [...new Set(composicoes.map(c => c.produto_id))];
            const { data: produtos } = await supabase.schema('orcamento').from('produto').select('id, nome, grupo_id').in('id', produtoIds);
            const grupoIds = produtos ? [...new Set(produtos.map(p => p.grupo_id).filter(id => id))] : [];
            const { data: grupos } = grupoIds.length > 0 ? await supabase.schema('orcamento').from('grupos').select('id, nome, oficina_id').in('id', grupoIds) : { data: [] };
            const oficinaIds = grupos ? [...new Set(grupos.map(g => g.oficina_id).filter(id => id))] : [];
            const { data: oficinas } = oficinaIds.length > 0 ? await supabase.schema('orcamento').from('oficinas').select('id, nome').in('id', oficinaIds) : { data: [] };

            insumoBase.produtos_orcamento = composicoes.map(comp => {
                const prod = produtos ? produtos.find(p => p.id === comp.produto_id) : null;
                const grupo = prod && grupos ? grupos.find(g => g.id === prod.grupo_id) : null;
                const oficina = grupo && oficinas ? oficinas.find(o => o.id === grupo.oficina_id) : null;
                return { 
                    produto_id: comp.produto_id, 
                    produto_nome: prod ? prod.nome : 'Desconhecido', 
                    grupo_nome: grupo ? grupo.nome : 'Sem Grupo', 
                    oficina_nome: oficina ? oficina.nome : 'Sem Oficina',
                    indice: Number(comp.indice) 
                };
            });

            const { data: procProdutos } = await supabase.schema('insumo').from('processo_produtos').select('processo_id, produto_id, quantidade').in('produto_id', produtoIds);
            if (procProdutos && procProdutos.length > 0) {
                const processoIds = [...new Set(procProdutos.map(p => p.processo_id))];
                const { data: processos } = await supabase.schema('insumo').from('processos').select('id, numero, nome, status').in('id', processoIds);
                let processosMap = {};
                
                procProdutos.forEach(pp => {
                    const proc = processos ? processos.find(p => p.id === pp.processo_id) : null;
                    const prod = produtos ? produtos.find(pr => pr.id === pp.produto_id) : null;
                    const comp = composicoes.find(c => c.produto_id === pp.produto_id);
                    
                    if (proc && prod && comp) {
                        if (!processosMap[proc.id]) processosMap[proc.id] = { processo_id: proc.id, numero: proc.numero, nome: proc.nome, status: proc.status, produtos: [] };
                        processosMap[proc.id].produtos.push({ produto_nome: prod.nome, quantidade_produto: pp.quantidade, quantidade_insumo_necessaria: Number(comp.indice) * Number(pp.quantidade) });
                    }
                });
                insumoBase.processos_utilizados = Object.values(processosMap);
            }
        }

        const { data: movimentacoes } = await supabase.schema('insumo').from('movimentacoes').select('*').in('insumo_id', allIds).order('id', { ascending: false }); 
            
        insumoBase.historico_movimentacoes = (movimentacoes || []).map(m => {
            let obs = m.observacao || '';
            let docLink = null;
            if (obs.includes('| [Doc: ')) {
                const parts = obs.split('| [Doc: ');
                obs = parts[0].trim();
                docLink = parts[1].replace(']', '').trim();
            }
            return { ...m, observacao: obs, documento_url: docLink };
        });

        return insumoBase;
    }

    static async listarSaldosEnvio(processoId) {
        const processo = await ProcessoService.obterDetalhesComposicao(processoId);
        if (!processo) return null;

        const isBOM = {};
        if (processo.insumos_consolidados) {
            processo.insumos_consolidados.forEach(i => {
                const ids = i.insumo_ids || [i.insumo_id];
                ids.forEach(id => isBOM[id] = true);
            });
        }

        const { data: reservas } = await supabase.schema('insumo').from('estoque_reservas').select('insumo_id, quantidade_reservada').eq('processo_id', processoId);
        const mapaReservas = {};
        if (reservas) {
            reservas.forEach(r => {
                if (!mapaReservas[r.insumo_id]) mapaReservas[r.insumo_id] = 0;
                mapaReservas[r.insumo_id] += Number(r.quantidade_reservada);
            });
        }

        const { data: movBanco } = await supabase.schema('insumo').from('movimentacoes')
            .select('insumo_id, quantidade')
            .eq('processo_destino_id', processoId)
            .eq('tipo', 'SAIDA_PRODUCAO');
            
        const mapaProducao = {};
        if (movBanco) {
            movBanco.forEach(m => {
                if (isBOM[m.insumo_id]) {
                    if (!mapaProducao[m.insumo_id]) mapaProducao[m.insumo_id] = 0;
                    mapaProducao[m.insumo_id] += Number(m.quantidade);
                }
            });
        }

        const { data: estoqueGeral } = await supabase.schema('insumo').from('estoque_geral').select('*');
        const mapaGeral = {};
        if (estoqueGeral) {
            estoqueGeral.forEach(e => { mapaGeral[e.insumo_id] = e; });
        }

        processo.insumos_envio = processo.insumos_consolidados.map(ins => {
            const ids = ins.insumo_ids || [ins.insumo_id];
            let reservado = 0;
            let enviado = 0;
            ids.forEach(id => {
                reservado += (mapaReservas[id] || 0);
                enviado += (mapaProducao[id] || 0);
            });

            const geral = mapaGeral[ins.insumo_id] || { qtd_sede: 0, qtd_complexo: 0, qtd_regional: 0 };
            const pendente = ins.qtd_arredondada - enviado;

            return {
                ...ins,
                quantidade_reservada: reservado,
                quantidade_enviada: enviado,
                quantidade_pendente: pendente > 0 ? pendente : 0,
                saldo_sede: Number(geral.qtd_sede || 0),
                saldo_complexo: Number(geral.qtd_complexo || 0),
                saldo_regional: Number(geral.qtd_regional || 0)
            };
        });

        return processo;
    }

    static async obterHistoricoEnvios(processoId) {
        const { data: movs, error } = await supabase.schema('insumo').from('movimentacoes')
            .select('*')
            .eq('processo_destino_id', processoId)
            .eq('tipo', 'SAIDA_PRODUCAO')
            .order('data_movimentacao', { ascending: false });

        if (error || !movs || movs.length === 0) return [];

        const insumoIds = [...new Set(movs.map(m => m.insumo_id))];
        const { data: insumos } = await supabase.schema('orcamento').from('insumo').select('id, descricao, unidade, ref').in('id', insumoIds);
        const insumoMap = {};
        if (insumos) insumos.forEach(i => insumoMap[i.id] = i);

        const gruposLote = {};
        movs.forEach(m => {
            const loteId = m.lote_envio_id || m.id; 
            if (!gruposLote[loteId]) {
                gruposLote[loteId] = {
                    lote_id: loteId,
                    data: m.data_movimentacao || m.created_at,
                    entregue_por: m.entregue_por || 'Sistema',
                    recebido_por: m.recebido_por || 'Não informado',
                    itens: []
                };
            }
            const ins = insumoMap[m.insumo_id] || {};
            gruposLote[loteId].itens.push({
                nome: ins.descricao || 'Insumo',
                quantidade: m.quantidade
            });
        });

        return Object.values(gruposLote);
    }

    static async registrarEnvioProducaoLote(processoId, loteEnvios, entreguePor, recebidoPor) {
        const loteId = 'lote_' + Date.now();
        const dataAtual = new Date().toISOString();

        for (let item of loteEnvios) {
            const qtd = Number(item.quantidade);
            if (isNaN(qtd) || qtd <= 0) continue;

            const { data: geral } = await supabase.schema('insumo').from('estoque_geral').select('*').eq('insumo_id', item.insumo_id).single();
            
            if (item.origem === 'RESERVA') {
                const { data: reserva } = await supabase.schema('insumo').from('estoque_reservas').select('*').eq('processo_id', processoId).eq('insumo_id', item.insumo_id).single();
                if (!reserva || Number(reserva.quantidade_reservada) < qtd) {
                    throw new Error(`Saldo insuficiente na Reserva para o insumo ID ${item.insumo_id}`);
                }
                const novaReserva = Number(reserva.quantidade_reservada) - qtd;
                if (novaReserva === 0) {
                    await supabase.schema('insumo').from('estoque_reservas').delete().eq('id', reserva.id);
                } else {
                    await supabase.schema('insumo').from('estoque_reservas').update({ quantidade_reservada: novaReserva, updated_at: dataAtual }).eq('id', reserva.id);
                }
            } else if (['GERAL_SEDE', 'GERAL_COMPLEXO', 'GERAL_REGIONAL'].includes(item.origem)) {
                if (!geral) throw new Error(`Insumo ID ${item.insumo_id} não encontrado no estoque geral.`);
                
                const updates = { updated_at: dataAtual };
                if (item.origem === 'GERAL_SEDE') {
                    if (Number(geral.qtd_sede) < qtd) throw new Error(`Saldo insuficiente no Almoxarifado Sede.`);
                    updates.qtd_sede = Number(geral.qtd_sede) - qtd;
                } else if (item.origem === 'GERAL_COMPLEXO') {
                    if (Number(geral.qtd_complexo) < qtd) throw new Error(`Saldo insuficiente no Almoxarifado Complexo.`);
                    updates.qtd_complexo = Number(geral.qtd_complexo) - qtd;
                } else if (item.origem === 'GERAL_REGIONAL') {
                    if (Number(geral.qtd_regional) < qtd) throw new Error(`Saldo insuficiente no Almoxarifado Regional.`);
                    updates.qtd_regional = Number(geral.qtd_regional) - qtd;
                }
                await supabase.schema('insumo').from('estoque_geral').update(updates).eq('insumo_id', item.insumo_id);
            }

            await supabase.schema('insumo').from('movimentacoes').insert([{
                tipo: 'SAIDA_PRODUCAO',
                processo_origem_id: processoId,
                processo_destino_id: processoId,
                insumo_id: item.insumo_id,
                quantidade: qtd,
                entregue_por: entreguePor,
                recebido_por: recebidoPor,
                observacao: `Baixa via Lote (${item.origem})`,
                lote_envio_id: loteId,
                data_movimentacao: dataAtual
            }]);
        }

        const { data: proc } = await supabase.schema('insumo').from('processos').select('status').eq('id', processoId).single();
        if (proc && proc.status === 'Demanda não iniciada') {
            await supabase.schema('insumo').from('processos').update({ status: 'Demanda em produção' }).eq('id', processoId);
        }

        return loteId;
    }

    static async obterComprovanteEnvioLote(loteId) {
        let { data: movs, error } = await supabase.schema('insumo').from('movimentacoes')
            .select('*')
            .eq('lote_envio_id', loteId);

        if (!movs || movs.length === 0) {
            const { data: movPorId } = await supabase.schema('insumo').from('movimentacoes')
                .select('*')
                .eq('id', loteId);
            movs = movPorId;
        }

        if (!movs || movs.length === 0) return null;

        const primeiraMov = movs[0];
        const processoId = primeiraMov.processo_destino_id;

        const { data: processo } = await supabase.schema('insumo').from('processos').select('id, numero, nome').eq('id', processoId).single();
        
        const insumoIds = [...new Set(movs.map(m => m.insumo_id))];
        const { data: insumos } = await supabase.schema('orcamento').from('insumo').select('id, descricao, unidade, ref').in('id', insumoIds);
        const insumoMap = {};
        if (insumos) insumos.forEach(i => insumoMap[i.id] = i);

        const itens = movs.map(m => {
            const i = insumoMap[m.insumo_id] || {};
            return {
                descricao: i.descricao || 'Insumo',
                unidade: i.unidade || 'UN',
                ref: i.ref || 'S/REF',
                quantidade: m.quantidade,
                origem: m.observacao || 'Baixa de Estoque'
            };
        });

        return {
            lote_id: loteId,
            data_movimentacao: primeiraMov.data_movimentacao || primeiraMov.created_at,
            entregue_por: primeiraMov.entregue_por || 'Sistema',
            recebido_por: primeiraMov.recebido_por || 'Não informado',
            processo_nome: processo ? processo.nome : 'Processo',
            processo_numero: processo ? processo.numero : '---',
            itens: itens
        };
    }
}

module.exports = EstoqueService;
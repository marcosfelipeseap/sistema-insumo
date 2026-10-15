const supabase = require('../config/db');

class ProcessoService {
    static async listarTodos(user = null, tipo = 'todos') {
        let query = supabase.schema('insumo').from('processos').select('*');
        
        if (user && user.cargo === 'solicitante') {
            query = query.eq('solicitante_id', user.id);
        }

        if (tipo === 'aprovados') {
            query = query.not('status', 'in', '("Pendente","Recusado")');
        } else if (tipo === 'solicitacoes') {
            query = query.in('status', ['Pendente', 'Recusado']);
        }

        const { data: processos, error } = await query;
        if (error) throw error;
        if (!processos || processos.length === 0) return [];

        const processoIds = processos.map(p => p.id);

        // Busca apenas os produtos vinculados aos processos listados (evita limite de 1000 linhas do Supabase)
        const { data: procProdutos } = await supabase
            .schema('insumo')
            .from('processo_produtos')
            .select('*')
            .in('processo_id', processoIds);

        const { data: orcProdutos } = await supabase.schema('orcamento').from('produto').select('id, nome, grupo_id');
        const { data: orcGrupos } = await supabase.schema('orcamento').from('grupos').select('id, nome, oficina_id');
        const { data: orcOficinas } = await supabase.schema('orcamento').from('oficinas').select('id, nome');
        const { data: produtoComposicao } = await supabase.schema('orcamento').from('produto_composicao').select('*');
        const { data: movimentacoes } = await supabase
            .schema('insumo')
            .from('movimentacoes')
            .select('*')
            .eq('tipo', 'SAIDA_PRODUCAO')
            .in('processo_destino_id', processoIds);

        // Mapas rápidos usando String() na chave para evitar falha entre Number e String
        const mapaProd = {};
        if (orcProdutos) orcProdutos.forEach(p => { mapaProd[String(p.id)] = p; });
        
        const mapaGrupo = {};
        if (orcGrupos) orcGrupos.forEach(g => { mapaGrupo[String(g.id)] = g; });
        
        const mapaOficina = {};
        if (orcOficinas) orcOficinas.forEach(o => { mapaOficina[String(o.id)] = o; });

        const listaProcessos = processos.map(p => {
            const prodsDoProcesso = (procProdutos || []).filter(prod => String(prod.processo_id) === String(p.id));
            const countProdutos = prodsDoProcesso.length;

            let totalNecessarioGeral = 0;
            let totalEnviadoGeral = 0;
            let oficinasSet = new Set();
            let oficinasIdsSet = new Set();

            const produtosDetalhados = prodsDoProcesso.map(pp => {
                const oProd = mapaProd[String(pp.produto_id)];
                const oGrupo = (oProd && oProd.grupo_id) ? mapaGrupo[String(oProd.grupo_id)] : null;
                const oOficina = (oGrupo && oGrupo.oficina_id) ? mapaOficina[String(oGrupo.oficina_id)] : null;
                
                if (oOficina && oOficina.nome) {
                    oficinasSet.add(oOficina.nome);
                    oficinasIdsSet.add(oOficina.id);
                }

                const nomeProd = oProd ? oProd.nome : `Produto #${pp.produto_id}`;

                return {
                    produto_id: pp.produto_id,
                    nome: nomeProd,
                    produto_nome: nomeProd,
                    quantidade: pp.quantidade,
                    qtd_solicitada: pp.quantidade,
                    grupo_nome: oGrupo ? oGrupo.nome : 'Sem Grupo',
                    oficina_id: oOficina ? oOficina.id : null,
                    oficina_nome: oOficina ? oOficina.nome : 'Sem Oficina'
                };
            });

            if (prodsDoProcesso.length > 0 && produtoComposicao) {
                let insumosTotaisMap = {};

                prodsDoProcesso.forEach(pp => {
                    const composicoes = produtoComposicao.filter(pc => String(pc.produto_id) === String(pp.produto_id));
                    composicoes.forEach(pc => {
                        const qtd_total = Number(pc.indice) * Number(pp.quantidade);
                        if (!insumosTotaisMap[pc.insumo_id]) {
                            insumosTotaisMap[pc.insumo_id] = 0;
                        }
                        insumosTotaisMap[pc.insumo_id] += qtd_total;
                    });
                });

                const movsProcesso = (movimentacoes || []).filter(m => String(m.processo_destino_id) === String(p.id));
                const mapaEnviado = {};
                movsProcesso.forEach(m => {
                    if (!mapaEnviado[m.insumo_id]) mapaEnviado[m.insumo_id] = 0;
                    mapaEnviado[m.insumo_id] += Number(m.quantidade);
                });

                Object.keys(insumosTotaisMap).forEach(insumoId => {
                    const necessario = Math.ceil(insumosTotaisMap[insumoId]);
                    const enviado = mapaEnviado[insumoId] || 0;

                    totalNecessarioGeral += necessario;
                    totalEnviadoGeral += Math.min(enviado, necessario);
                });
            }

            const percentualGeral = totalNecessarioGeral > 0 ? Math.round((totalEnviadoGeral / totalNecessarioGeral) * 100) : 0;
            const oficinasLista = Array.from(oficinasSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));

            return { 
                ...p, 
                qtd_produtos: countProdutos,
                produtos_lista: produtosDetalhados,
                produtos: produtosDetalhados,
                percentual_conclusao: percentualGeral,
                oficina_ids: Array.from(oficinasIdsSet),
                oficinas: oficinasLista,
                oficinas_texto: oficinasLista.length > 0 ? oficinasLista.join(', ') : 'Sem Oficina Vinculada'
            };
        });

        // Ordena em ordem alfabética pelo nome do processo
        listaProcessos.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' }));

        return listaProcessos;
    }

    static async buscarProdutosOrcamento() {
        const { data: produtos, error: errProd } = await supabase.schema('orcamento').from('produto').select('id, nome, grupo_id');
        if (errProd) throw errProd;

        const { data: grupos, error: errGrup } = await supabase.schema('orcamento').from('grupos').select('id, nome, oficina_id');
        if (errGrup) throw errGrup;

        const { data: oficinas, error: errOfic } = await supabase.schema('orcamento').from('oficinas').select('id, nome');
        if (errOfic) throw errOfic;

        const produtosCombo = (produtos || []).map(p => {
            const grupo = grupos ? grupos.find(g => String(g.id) === String(p.grupo_id)) : null;
            const oficina = (grupo && oficinas) ? oficinas.find(o => String(o.id) === String(grupo.oficina_id)) : null;
            
            const grupoNome = grupo ? grupo.nome : 'Sem Grupo';
            const oficinaNome = oficina ? oficina.nome : 'Sem Oficina';

            return {
                id: p.id,
                nome: p.nome,
                grupo_nome: grupoNome,
                oficina_nome: oficinaNome,
                nome_combo: `${p.nome} - (${oficinaNome} / ${grupoNome})`
            };
        });

        produtosCombo.sort((a, b) => a.nome_combo.localeCompare(b.nome_combo, 'pt-BR'));
        return produtosCombo;
    }

    static async criar(numero, nome, produtos_selecionados, user = null) {
        const numeroSanitizado = numero.replace(/\./g, '');
        
        const solicitante_id = user ? user.id : null;
        const solicitante_nome = user ? user.username : 'Desconhecido';
        
        let statusInicial = 'Pendente';
        let avaliador_nome = null;
        let avaliado_em = null;

        if (user && (user.cargo === 'admin' || user.cargo === 'Coordenador')) {
            statusInicial = 'Aprovado';
            avaliador_nome = user.username;
            avaliado_em = new Date().toISOString();
        }

        const { data: proc, error } = await supabase.schema('insumo').from('processos')
            .insert([{ 
                numero: numeroSanitizado, 
                nome,
                status: statusInicial,
                solicitante_id,
                solicitante_nome,
                avaliador_nome,
                avaliado_em
            }])
            .select('id').single();
            
        if (error) throw error;
        const processoId = proc.id;

        if (produtos_selecionados && produtos_selecionados.length > 0) {
            const mapaProd = {};
            produtos_selecionados.forEach(p => {
                const pId = Number(p.produto_id) || p.produto_id;
                const qtd = Number(p.quantidade);
                if (pId && qtd > 0) {
                    mapaProd[pId] = (mapaProd[pId] || 0) + qtd;
                }
            });

            const inserts = Object.keys(mapaProd).map(produto_id => ({
                processo_id: processoId,
                produto_id,
                quantidade: mapaProd[produto_id]
            }));
            
            if (inserts.length > 0) {
                await supabase.schema('insumo').from('processo_produtos').insert(inserts);
            }
        }
        return processoId;
    }

    static async obterDetalhesComposicao(processoId) {
        const { data: processo } = await supabase.schema('insumo').from('processos').select('*').eq('id', processoId).single();
        if (!processo) return null;

        const { data: processoProdutos } = await supabase.schema('insumo').from('processo_produtos').select('produto_id, quantidade').eq('processo_id', processoId);
        
        const produtoIds = (processoProdutos || []).map(p => p.produto_id);
        const { data: orcamentoProdutos } = await supabase.schema('orcamento').from('produto').select('id, nome, grupo_id').in('id', produtoIds.length > 0 ? produtoIds : [0]);
        
        const grupoIds = (orcamentoProdutos || []).map(p => p.grupo_id).filter(id => id);
        const { data: orcamentoGrupos } = await supabase.schema('orcamento').from('grupos').select('id, nome, oficina_id').in('id', grupoIds.length > 0 ? grupoIds : [0]);

        const oficinaIds = (orcamentoGrupos || []).map(g => g.oficina_id).filter(id => id);
        const { data: orcamentoOficinas } = await supabase.schema('orcamento').from('oficinas').select('id, nome').in('id', oficinaIds.length > 0 ? oficinaIds : [0]);

        const { data: produtoComposicao } = await supabase.schema('orcamento').from('produto_composicao').select('produto_id, insumo_id, indice').in('produto_id', produtoIds.length > 0 ? produtoIds : [0]);
        
        const insumoIds = (produtoComposicao || []).map(pc => pc.insumo_id);
        const { data: orcamentoInsumos } = await supabase.schema('orcamento').from('insumo').select('id, descricao, unidade, valor_unit, ref').in('id', insumoIds.length > 0 ? insumoIds : [0]);

        let insumosTotaisMap = {};
        let oficinasSet = new Set();
        let oficinasIdsSet = new Set();
        
        processo.produtos = (processoProdutos || []).map(pp => {
            const oProd = (orcamentoProdutos || []).find(p => String(p.id) === String(pp.produto_id));
            const oGrupo = (oProd && orcamentoGrupos) ? orcamentoGrupos.find(g => String(g.id) === String(oProd.grupo_id)) : null;
            const oOficina = (oGrupo && orcamentoOficinas) ? orcamentoOficinas.find(o => String(o.id) === String(oGrupo.oficina_id)) : null;
            
            if (oOficina && oOficina.nome) {
                oficinasSet.add(oOficina.nome);
                oficinasIdsSet.add(oOficina.id);
            }

            const composicoes = (produtoComposicao || []).filter(pc => String(pc.produto_id) === String(pp.produto_id));
            const itens = composicoes.map(pc => {
                const oInsumo = (orcamentoInsumos || []).find(i => String(i.id) === String(pc.insumo_id)) || { descricao: 'Desconhecido', unidade: '-', valor_unit: 0, ref: null };
                const qtd_base = Number(pc.indice);
                const qtd_total = qtd_base * Number(pp.quantidade);

                const refValida = (oInsumo.ref && String(oInsumo.ref).trim() !== '') ? String(oInsumo.ref).trim() : null;
                const descNormalizada = oInsumo.descricao.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim().toUpperCase();
                const chaveAgrupamento = refValida ? refValida : descNormalizada;

                if (!insumosTotaisMap[chaveAgrupamento]) {
                    insumosTotaisMap[chaveAgrupamento] = {
                        insumo_id: pc.insumo_id,
                        insumo_ids: [pc.insumo_id],
                        descricao: oInsumo.descricao,
                        unidade: oInsumo.unidade,
                        valor_unit: oInsumo.valor_unit,
                        ref: oInsumo.ref,
                        qtd_exata: 0
                    };
                } else {
                    if (!insumosTotaisMap[chaveAgrupamento].insumo_ids.includes(pc.insumo_id)) {
                        insumosTotaisMap[chaveAgrupamento].insumo_ids.push(pc.insumo_id);
                    }
                }
                
                insumosTotaisMap[chaveAgrupamento].qtd_exata += qtd_total;

                return {
                    insumo: oInsumo,
                    qtd_base: qtd_base,
                    qtd_total_solicitada: qtd_total,
                    custo_unitario: qtd_base * Number(oInsumo.valor_unit),
                    custo_total: qtd_total * Number(oInsumo.valor_unit)
                };
            });

            return {
                produto_id: pp.produto_id,
                qtd_solicitada: pp.quantidade,
                quantidade: pp.quantidade,
                produto_nome: oProd ? oProd.nome : 'Desconhecido',
                nome: oProd ? oProd.nome : 'Desconhecido',
                grupo_nome: oGrupo ? oGrupo.nome : 'Sem Grupo',
                oficina_id: oOficina ? oOficina.id : null,
                oficina_nome: oOficina ? oOficina.nome : 'Sem Oficina',
                itens: itens
            };
        });

        processo.oficina_ids = Array.from(oficinasIdsSet);
        processo.oficinas = Array.from(oficinasSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        processo.oficinas_texto = processo.oficinas.length > 0 ? processo.oficinas.join(', ') : 'Sem Oficina Vinculada';

        processo.insumos_consolidados = Object.values(insumosTotaisMap).map(ins => {
            return {
                ...ins,
                qtd_arredondada: Math.ceil(ins.qtd_exata),
                custo_arredondado: Math.ceil(ins.qtd_exata) * Number(ins.valor_unit)
            };
        }).sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));

        return processo;
    }

    static async buscarPorId(processoId) {
        const { data, error } = await supabase.schema('insumo').from('processos').select('*').eq('id', processoId).single();
        if (error) throw error;

        const { data: produtos } = await supabase.schema('insumo').from('processo_produtos').select('produto_id, quantidade').eq('processo_id', processoId);
        data.produtos = produtos || [];

        return data;
    }

    static async atualizar(processoId, numero, nome, produtos_selecionados = null) {
        const updateData = {};
        if (numero !== undefined && numero !== null) {
            updateData.numero = String(numero).replace(/\./g, '');
        }
        if (nome !== undefined && nome !== null) {
            updateData.nome = nome;
        }

        if (Object.keys(updateData).length > 0) {
            const { error } = await supabase.schema('insumo').from('processos').update(updateData).eq('id', processoId);
            if (error) throw error;
        }

        if (produtos_selecionados !== null) {
            await supabase.schema('insumo').from('processo_produtos').delete().eq('processo_id', processoId);

            const mapaProd = {};
            produtos_selecionados.forEach(p => {
                const pId = Number(p.produto_id) || p.produto_id;
                const qtd = Number(p.quantidade);
                if (pId && qtd > 0) {
                    mapaProd[pId] = (mapaProd[pId] || 0) + qtd;
                }
            });

            const inserts = Object.keys(mapaProd).map(produto_id => ({
                processo_id: processoId,
                produto_id,
                quantidade: mapaProd[produto_id]
            }));

            if (inserts.length > 0) {
                const { error: errIns } = await supabase.schema('insumo').from('processo_produtos').insert(inserts);
                if (errIns) throw errIns;
            }
        }
    }

    static async excluir(processoId) {
        await supabase.schema('insumo').from('movimentacoes').delete().or(`processo_origem_id.eq.${processoId},processo_destino_id.eq.${processoId}`);
        await supabase.schema('insumo').from('estoque').delete().eq('processo_id', processoId);
        await supabase.schema('insumo').from('processo_produtos').delete().eq('processo_id', processoId);
        const { error } = await supabase.schema('insumo').from('processos').delete().eq('id', processoId);
        if (error) throw error;
    }

    static async aprovar(processoId, avaliador) {
        const { error } = await supabase.schema('insumo').from('processos')
            .update({ 
                status: 'Aprovado',
                avaliador_nome: avaliador ? avaliador.username : 'Admin',
                avaliado_em: new Date().toISOString()
            }).eq('id', processoId);
        if (error) throw error;
    }

    static async recusar(processoId, avaliador, justificativa) {
        const { error } = await supabase.schema('insumo').from('processos')
            .update({ 
                status: 'Recusado',
                justificativa_recusa: justificativa,
                avaliador_nome: avaliador ? avaliador.username : 'Admin',
                avaliado_em: new Date().toISOString()
            }).eq('id', processoId);
        if (error) throw error;
    }
}

module.exports = ProcessoService;
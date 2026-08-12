const supabase = require('../config/db');

class ProcessoService {
    static async listarTodos() {
        const { data: processos, error } = await supabase.schema('insumo').from('processos').select('*').order('created_at', { ascending: false });
        if (error) throw error;

        const { data: produtos } = await supabase.schema('insumo').from('processo_produtos').select('processo_id');

        return processos.map(p => {
            const count = produtos ? produtos.filter(prod => prod.processo_id === p.id).length : 0;
            return { ...p, qtd_produtos: count };
        });
    }

    static async buscarProdutosOrcamento() {
        const { data: produtos, error: errProd } = await supabase.schema('orcamento').from('produto').select('id, nome, grupo_id');
        if (errProd) throw errProd;

        const { data: grupos, error: errGrup } = await supabase.schema('orcamento').from('grupos').select('id, nome');
        if (errGrup) throw errGrup;

        const produtosCombo = produtos.map(p => {
            const grupo = grupos.find(g => g.id === p.grupo_id);
            const grupoNome = grupo ? grupo.nome : 'Sem Grupo Vinculado';
            return {
                id: p.id,
                nome_combo: `${p.nome} - (${grupoNome})`
            };
        });

        produtosCombo.sort((a, b) => a.nome_combo.localeCompare(b.nome_combo));
        return produtosCombo;
    }

    static async criar(numero, nome, produtos_selecionados) {
        const numeroSanitizado = numero.replace(/\./g, '');
        
        const { data: proc, error } = await supabase.schema('insumo').from('processos')
            .insert([{ numero: numeroSanitizado, nome }])
            .select('id').single();
            
        if (error) throw error;
        const processoId = proc.id;

        if (produtos_selecionados && produtos_selecionados.length > 0) {
            const inserts = produtos_selecionados
                .filter(p => p.produto_id && p.quantidade > 0)
                .map(p => ({ processo_id: processoId, produto_id: p.produto_id, quantidade: p.quantidade }));
            
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
        
        const produtoIds = processoProdutos.map(p => p.produto_id);
        const { data: orcamentoProdutos } = await supabase.schema('orcamento').from('produto').select('id, nome, grupo_id').in('id', produtoIds);
        
        const grupoIds = orcamentoProdutos.map(p => p.grupo_id).filter(id => id);
        const { data: orcamentoGrupos } = await supabase.schema('orcamento').from('grupos').select('id, nome').in('id', grupoIds.length > 0 ? grupoIds : [0]);

        const { data: produtoComposicao } = await supabase.schema('orcamento').from('produto_composicao').select('produto_id, insumo_id, indice').in('produto_id', produtoIds);
        
        const insumoIds = produtoComposicao.map(pc => pc.insumo_id);
        const { data: orcamentoInsumos } = await supabase.schema('orcamento').from('insumo').select('id, descricao, unidade, valor_unit').in('id', insumoIds.length > 0 ? insumoIds : [0]);

        let insumosTotaisMap = {};
        
        processo.produtos = processoProdutos.map(pp => {
            const oProd = orcamentoProdutos.find(p => p.id === pp.produto_id);
            const oGrupo = oProd ? orcamentoGrupos.find(g => g.id === oProd.grupo_id) : null;
            
            const composicoes = produtoComposicao.filter(pc => pc.produto_id === pp.produto_id);
            const itens = composicoes.map(pc => {
                const oInsumo = orcamentoInsumos.find(i => i.id === pc.insumo_id);
                const qtd_base = Number(pc.indice);
                const qtd_total = qtd_base * Number(pp.quantidade);

                if (!insumosTotaisMap[pc.insumo_id]) {
                    insumosTotaisMap[pc.insumo_id] = {
                        insumo_id: pc.insumo_id,
                        descricao: oInsumo.descricao,
                        unidade: oInsumo.unidade,
                        valor_unit: oInsumo.valor_unit,
                        qtd_exata: 0
                    };
                }
                insumosTotaisMap[pc.insumo_id].qtd_exata += qtd_total;

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
                produto_nome: oProd ? oProd.nome : 'Desconhecido',
                grupo_nome: oGrupo ? oGrupo.nome : 'Sem Grupo',
                itens: itens
            };
        });

        processo.insumos_consolidados = Object.values(insumosTotaisMap).map(ins => {
            return {
                ...ins,
                qtd_arredondada: Math.ceil(ins.qtd_exata),
                custo_arredondado: Math.ceil(ins.qtd_exata) * Number(ins.valor_unit)
            };
        }).sort((a, b) => a.descricao.localeCompare(b.descricao));

        return processo;
    }

    static async buscarPorId(processoId) {
        const { data, error } = await supabase.schema('insumo').from('processos').select('*').eq('id', processoId).single();
        if (error) throw error;
        return data;
    }

    static async atualizar(processoId, numero, nome) {
        const numeroSanitizado = numero.replace(/\./g, '');
        const { error } = await supabase.schema('insumo').from('processos').update({ numero: numeroSanitizado, nome }).eq('id', processoId);
        if (error) throw error;
    }

    static async excluir(processoId) {
        await supabase.schema('insumo').from('movimentacoes').delete().or(`processo_origem_id.eq.${processoId},processo_destino_id.eq.${processoId}`);
        await supabase.schema('insumo').from('estoque').delete().eq('processo_id', processoId);
        await supabase.schema('insumo').from('processo_produtos').delete().eq('processo_id', processoId);
        const { error } = await supabase.schema('insumo').from('processos').delete().eq('id', processoId);
        if (error) throw error;
    }
}
module.exports = ProcessoService;
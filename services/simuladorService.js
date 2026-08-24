const supabase = require('../config/db');

class SimuladorService {
    static async obterProdutos() {
        const { data: produtos } = await supabase.schema('orcamento').from('produto').select('id, nome, grupo_id');
        const { data: grupos } = await supabase.schema('orcamento').from('grupos').select('id, nome');
        
        // Busca produtos em processos ativos para destacá-los
        const { data: procAtivos } = await supabase.schema('insumo').from('processos').select('id').neq('status', 'Concluído');
        let produtosEmUso = new Set();
        
        if (procAtivos && procAtivos.length > 0) {
            const ativosIds = procAtivos.map(p => p.id);
            const { data: procProd } = await supabase.schema('insumo').from('processo_produtos').select('produto_id').in('processo_id', ativosIds);
            if (procProd) procProd.forEach(pp => produtosEmUso.add(pp.produto_id));
        }

        const produtosFormatados = produtos.map(p => {
            const grupo = grupos ? grupos.find(g => g.id === p.grupo_id) : null;
            return {
                id: p.id,
                nome: p.nome,
                grupo: grupo ? grupo.nome : 'Sem Grupo',
                em_uso: produtosEmUso.has(p.id)
            };
        });

        // Ordena: Em Uso primeiro, depois alfabético
        produtosFormatados.sort((a, b) => {
            if (a.em_uso === b.em_uso) return a.nome.localeCompare(b.nome);
            return a.em_uso ? -1 : 1;
        });

        return produtosFormatados;
    }

    static async calcularSimulacao(selecao) {
        const produtoIds = selecao.map(s => s.produto_id);
        
        const { data: produtosDb } = await supabase.schema('orcamento').from('produto').select('id, nome').in('id', produtoIds);
        const { data: composicoes } = await supabase.schema('orcamento').from('produto_composicao').select('*').in('produto_id', produtoIds);
        
        // Soma a demanda total de cada insumo
        const demandaMap = {};
        selecao.forEach(item => {
            const compProduto = composicoes.filter(c => String(c.produto_id) === String(item.produto_id));
            compProduto.forEach(c => {
                if (!demandaMap[c.insumo_id]) demandaMap[c.insumo_id] = 0;
                demandaMap[c.insumo_id] += (Number(c.indice) * Number(item.quantidade));
            });
        });

        const insumosIds = Object.keys(demandaMap);
        if(insumosIds.length === 0) throw new Error("Os produtos selecionados não possuem Composição (Ficha Técnica).");

        // Busca insumos Trazendo a REFERÊNCIA (ref)
        const { data: insumosDb } = await supabase.schema('orcamento').from('insumo').select('id, descricao, unidade, valor_unit, ref').in('id', insumosIds);
        
        // FILTRO CRUCIAL: Remove insumos que não possuem "ref" (Ex: Salário, Transporte)
        const insumosValidos = insumosDb.filter(i => i.ref && String(i.ref).trim() !== '');
        
        if (insumosValidos.length === 0) throw new Error("Nenhum insumo físico válido foi encontrado na composição desses produtos.");

        const { data: estoqueDb } = await supabase.schema('insumo').from('estoque_geral').select('*').in('insumo_id', insumosValidos.map(i => i.id));
        
        const estoqueMap = {};
        if(estoqueDb) {
            estoqueDb.forEach(e => {
                estoqueMap[e.insumo_id] = Number(e.qtd_sede || 0) + Number(e.qtd_complexo || 0) + Number(e.qtd_regional || 0);
            });
        }

        const insumosResultado = [];

        // Monta o array detalhado de insumos (A matemática global agora é feita no Frontend)
        insumosValidos.forEach(ins => {
            const id = ins.id;
            const necessita = Math.ceil(demandaMap[id]); 
            const tem = estoqueMap[id] || 0;
            const valorUnit = Number(ins.valor_unit || 0);
            
            const falta = necessita > tem ? necessita - tem : 0;
            const custoNecessario = necessita * valorUnit;
            const custoEstoque = tem * valorUnit; 
            
            insumosResultado.push({
                id: ins.id,
                descricao: ins.descricao,
                unidade: ins.unidade,
                valor_unit: valorUnit,
                qtd_necessaria: necessita,
                qtd_estoque: tem,
                qtd_falta: falta,
                custo_total: custoNecessario,
                custo_estoque: custoEstoque
            });
        });

        // Prepara os produtos para a projeção
        const projecaoProdutos = selecao.map(s => {
            const pNome = produtosDb.find(p => String(p.id) === String(s.produto_id))?.nome || 'Desconhecido';
            return {
                nome: pNome,
                qtd_solicitada: Number(s.quantidade)
            };
        });

        return {
            insumos: insumosResultado.sort((a,b) => b.custo_total - a.custo_total),
            projecaoProdutos
        };
    }
}

module.exports = SimuladorService;
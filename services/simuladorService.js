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
        
        // Soma a demanda total de cada insumo (pelos IDs originais da composição)
        const demandaMap = {};
        selecao.forEach(item => {
            const compProduto = composicoes.filter(c => String(c.produto_id) === String(item.produto_id));
            compProduto.forEach(c => {
                if (!demandaMap[c.insumo_id]) demandaMap[c.insumo_id] = 0;
                demandaMap[c.insumo_id] += (Number(c.indice) * Number(item.quantidade));
            });
        });

        const insumosOriginaisIds = Object.keys(demandaMap);
        if(insumosOriginaisIds.length === 0) throw new Error("Os produtos selecionados não possuem Composição (Ficha Técnica).");

        // Busca detalhes dos insumos exigidos (Para ter o nome exato deles e poder buscar duplicatas)
        const { data: insumosDb } = await supabase.schema('orcamento').from('insumo').select('id, descricao, unidade, valor_unit, ref').in('id', insumosOriginaisIds);
        
        // FILTRO CRUCIAL: Remove insumos não-físicos (sem REF)
        const insumosValidos = insumosDb.filter(i => i.ref && String(i.ref).trim() !== '');
        if (insumosValidos.length === 0) throw new Error("Nenhum insumo físico válido foi encontrado na composição desses produtos.");

        // INTELIGÊNCIA: Busca todos os insumos do orçamento para agrupar duplicatas pelo nome exato
        const { data: todosInsumosOrçamento } = await supabase.schema('orcamento').from('insumo').select('id, descricao');
        
        // Cria um mapa onde a chave é a "descrição" e o valor é um array de IDs que têm esse mesmo nome
        const mapaAgrupamentoDescricao = {};
        if (todosInsumosOrçamento) {
            todosInsumosOrçamento.forEach(ins => {
                const desc = ins.descricao.trim();
                if (!mapaAgrupamentoDescricao[desc]) mapaAgrupamentoDescricao[desc] = [];
                mapaAgrupamentoDescricao[desc].push(ins.id);
            });
        }

        // Puxa TODO o estoque geral (Sede, Complexo, Reg) para fazer a matemática
        const { data: estoqueGeralDb } = await supabase.schema('insumo').from('estoque_geral').select('*');
        const mapaEstoqueTotalId = {};
        if (estoqueGeralDb) {
            estoqueGeralDb.forEach(e => {
                mapaEstoqueTotalId[e.insumo_id] = Number(e.qtd_sede || 0) + Number(e.qtd_complexo || 0) + Number(e.qtd_regional || 0);
            });
        }

        const insumosResultado = [];

        insumosValidos.forEach(insOriginal => {
            const idOriginal = insOriginal.id;
            const necessita = Math.ceil(demandaMap[idOriginal]); 
            const valorUnit = Number(insOriginal.valor_unit || 0);
            
            // INTELIGÊNCIA EM AÇÃO: Em vez de ver só o ID original, pega todos os IDs clones
            const desc = insOriginal.descricao.trim();
            const idsDuplicatas = mapaAgrupamentoDescricao[desc] || [idOriginal];

            // Soma o estoque de todos os clones encontrados
            let estoqueRealTotal = 0;
            idsDuplicatas.forEach(cloneId => {
                if (mapaEstoqueTotalId[cloneId]) {
                    estoqueRealTotal += mapaEstoqueTotalId[cloneId];
                }
            });
            
            const falta = necessita > estoqueRealTotal ? necessita - estoqueRealTotal : 0;
            const custoNecessario = necessita * valorUnit;
            const custoEstoque = estoqueRealTotal * valorUnit; 
            
            insumosResultado.push({
                id: idOriginal, // Mantém o ID original para o checkbox
                descricao: insOriginal.descricao,
                unidade: insOriginal.unidade,
                valor_unit: valorUnit,
                qtd_necessaria: necessita,
                qtd_estoque: estoqueRealTotal,
                qtd_falta: falta,
                custo_total: custoNecessario,
                custo_estoque: custoEstoque
            });
        });

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
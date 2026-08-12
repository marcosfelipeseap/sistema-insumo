const supabase = require('../config/db');
const ProcessoService = require('./processoService');

class EstoqueService {
    static async listarEstoqueProcesso(processoId) {
        const processo = await ProcessoService.obterDetalhesComposicao(processoId);
        if (!processo) return null;

        const { data: estoqueBanco } = await supabase.schema('insumo').from('estoque').select('insumo_id, quantidade_recebida, quantidade_disponivel').eq('processo_id', processoId);
        const mapaEstoque = {};
        if (estoqueBanco) {
            estoqueBanco.forEach(est => { mapaEstoque[est.insumo_id] = est; });
        }

        const { data: movBanco } = await supabase.schema('insumo').from('movimentacoes')
            .select('insumo_id, quantidade')
            .eq('processo_destino_id', processoId)
            .in('tipo', ['SAIDA_PRODUCAO', 'EMPRESTIMO']);
            
        const mapaProducao = {};
        if (movBanco) {
            movBanco.forEach(m => {
                if (!mapaProducao[m.insumo_id]) mapaProducao[m.insumo_id] = 0;
                mapaProducao[m.insumo_id] += Number(m.quantidade);
            });
        }

        processo.insumos_estoque = processo.insumos_consolidados.map(insumoNecessario => {
            const estoqueAtual = mapaEstoque[insumoNecessario.insumo_id] || { quantidade_recebida: 0, quantidade_disponivel: 0 };
            const enviadaProducao = mapaProducao[insumoNecessario.insumo_id] || 0;
            
            const pendenteAlmoxarifado = insumoNecessario.qtd_arredondada - estoqueAtual.quantidade_recebida;
            const pendenteProducao = insumoNecessario.qtd_arredondada - enviadaProducao;

            return {
                ...insumoNecessario,
                quantidade_recebida: estoqueAtual.quantidade_recebida,
                quantidade_disponivel: estoqueAtual.quantidade_disponivel,
                quantidade_enviada_producao: enviadaProducao,
                quantidade_pendente_almoxarifado: pendenteAlmoxarifado > 0 ? pendenteAlmoxarifado : 0,
                quantidade_pendente_producao: pendenteProducao > 0 ? pendenteProducao : 0,
                status_concluido: enviadaProducao >= insumoNecessario.qtd_arredondada 
            };
        });

        return processo;
    }

    static async registrarEntrada(processoId, insumoId, quantidade, usuario) {
        const { data: check } = await supabase.schema('insumo').from('estoque').select('id, quantidade_recebida, quantidade_disponivel').eq('processo_id', processoId).eq('insumo_id', insumoId);
        
        if (check && check.length > 0) {
            const atual = check[0];
            await supabase.schema('insumo').from('estoque').update({
                quantidade_recebida: Number(atual.quantidade_recebida) + Number(quantidade),
                quantidade_disponivel: Number(atual.quantidade_disponivel) + Number(quantidade),
                updated_at: new Date().toISOString()
            }).eq('id', atual.id);
        } else {
            await supabase.schema('insumo').from('estoque').insert([{ processo_id: processoId, insumo_id: insumoId, quantidade_recebida: quantidade, quantidade_disponivel: quantidade }]);
        }

        await supabase.schema('insumo').from('movimentacoes').insert([{ tipo: 'ENTRADA', processo_destino_id: processoId, insumo_id: insumoId, quantidade: quantidade, recebido_por: usuario, observacao: 'Entrada via Almoxarifado' }]);

        const { data: proc } = await supabase.schema('insumo').from('processos').select('status').eq('id', processoId).single();
        if (proc && proc.status === 'Demanda não iniciada') {
            await supabase.schema('insumo').from('processos').update({ status: 'Demanda em produção' }).eq('id', processoId);
        }
    }
}
module.exports = EstoqueService;
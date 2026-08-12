const supabase = require('../config/db');
const ProcessoService = require('./processoService');

class EnvioService {
    static async obterDadosEnvio(processoId) {
        const processo = await ProcessoService.obterDetalhesComposicao(processoId);
        if (!processo) return null;

        // 1. Busca o que foi reservado para este processo
        const { data: reservas } = await supabase.schema('insumo').from('estoque_reservas').select('insumo_id, quantidade_reservada').eq('processo_id', processoId);
        const mapaReservas = {};
        if (reservas) {
            reservas.forEach(r => { mapaReservas[r.insumo_id] = Number(r.quantidade_reservada); });
        }

        // 2. Busca o que já foi enviado para a produção deste processo
        const { data: movBanco } = await supabase.schema('insumo').from('movimentacoes')
            .select('insumo_id, quantidade')
            .eq('processo_destino_id', processoId)
            .eq('tipo', 'SAIDA_PRODUCAO');
            
        const mapaProducao = {};
        if (movBanco) {
            movBanco.forEach(m => {
                if (!mapaProducao[m.insumo_id]) mapaProducao[m.insumo_id] = 0;
                mapaProducao[m.insumo_id] += Number(m.quantidade);
            });
        }

        // 3. Monta a lista combinada para a tela de envio (CORRIGIDO AQUI)
        processo.insumos_envio = processo.insumos_consolidados.map(ins => {
            const reservado = mapaReservas[ins.insumo_id] || 0;
            const enviado = mapaProducao[ins.insumo_id] || 0; 
            const disponivelParaEnviar = reservado - enviado;
            const pendenteProducao = ins.qtd_arredondada - enviado;

            return {
                ...ins,
                quantidade_reservada: reservado,
                quantidade_enviada: enviado,
                disponivel_para_enviar: disponivelParaEnviar > 0 ? disponivelParaEnviar : 0,
                quantidade_pendente_producao: pendenteProducao > 0 ? pendenteProducao : 0,
                status_concluido: enviado >= ins.qtd_arredondada
            };
        });

        // 4. Histórico de movimentações do processo
        const { data: historicoBanco } = await supabase.schema('insumo').from('movimentacoes')
            .select('*')
            .eq('processo_destino_id', processoId)
            .order('data_movimentacao', { ascending: false });

        if (historicoBanco && historicoBanco.length > 0) {
            const insumoIds = [...new Set(historicoBanco.map(h => h.insumo_id))];
            const { data: insumos } = await supabase.schema('orcamento').from('insumo').select('id, descricao, unidade').in('id', insumoIds);

            processo.historico = historicoBanco.map(h => {
                const i = insumos.find(i => i.id === h.insumo_id) || {};
                return {
                    ...h,
                    insumo_nome: i.descricao,
                    unidade: i.unidade
                };
            });
        } else {
            processo.historico = [];
        }

        return processo;
    }

    static async registrarSaidaProducao(processoId, insumoId, quantidade, entreguePor, recebidoPor) {
        await supabase.schema('insumo').from('movimentacoes').insert([{
            tipo: 'SAIDA_PRODUCAO',
            processo_origem_id: processoId,
            processo_destino_id: processoId,
            insumo_id: insumoId,
            quantidade: quantidade,
            entregue_por: entreguePor,
            recebido_por: recebidoPor,
            observacao: 'Envio de material separado para a produção'
        }]);

        const { data: proc } = await supabase.schema('insumo').from('processos').select('status').eq('id', processoId).single();
        if (proc && proc.status === 'Demanda não iniciada') {
            await supabase.schema('insumo').from('processos').update({ status: 'Demanda em produção' }).eq('id', processoId);
        }
    }
}
module.exports = EnvioService;
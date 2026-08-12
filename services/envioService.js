const supabase = require('../config/db');
const EstoqueService = require('./estoqueService');

class EnvioService {
    static async obterDadosEnvio(processoId) {
        const processo = await EstoqueService.listarEstoqueProcesso(processoId);
        if (!processo) return null;

        const { data: historicoBanco } = await supabase.schema('insumo').from('movimentacoes')
            .select('*')
            .or(`processo_origem_id.eq.${processoId},processo_destino_id.eq.${processoId}`)
            .order('data_movimentacao', { ascending: false });

        if (historicoBanco && historicoBanco.length > 0) {
            const insumoIds = [...new Set(historicoBanco.map(h => h.insumo_id))];
            const procIds = [...new Set(historicoBanco.map(h => h.processo_origem_id).concat(historicoBanco.map(h => h.processo_destino_id)).filter(id => id))];

            const { data: insumos } = await supabase.schema('orcamento').from('insumo').select('id, descricao, unidade').in('id', insumoIds);
            const { data: processos } = await supabase.schema('insumo').from('processos').select('id, nome, numero').in('id', procIds);

            processo.historico = historicoBanco.map(h => {
                const i = insumos.find(i => i.id === h.insumo_id) || {};
                const pOrigem = processos.find(p => p.id === h.processo_origem_id) || {};
                const pDestino = processos.find(p => p.id === h.processo_destino_id) || {};

                return {
                    ...h,
                    insumo_nome: i.descricao,
                    unidade: i.unidade,
                    origem_nome: pOrigem.nome,
                    origem_numero: pOrigem.numero,
                    destino_nome: pDestino.nome,
                    destino_numero: pDestino.numero
                };
            });
        } else {
            processo.historico = [];
        }

        return processo;
    }

    static async buscarProcessosComSaldo(insumoId, processoAtualId) {
        const { data: estoque } = await supabase.schema('insumo').from('estoque')
            .select('processo_id, quantidade_disponivel')
            .eq('insumo_id', insumoId)
            .neq('processo_id', processoAtualId)
            .gt('quantidade_disponivel', 0);
        
        if (!estoque || estoque.length === 0) return [];

        const procIds = estoque.map(e => e.processo_id);
        const { data: processos } = await supabase.schema('insumo').from('processos').select('id, nome, numero').in('id', procIds);

        return estoque.map(e => {
            const p = processos.find(p => p.id === e.processo_id);
            return {
                processo_id: e.processo_id,
                nome: p ? p.nome : 'Desconhecido',
                numero: p ? p.numero : '-',
                quantidade_disponivel: e.quantidade_disponivel
            };
        });
    }

    static async registrarSaida(processoId, insumoId, quantidade, entreguePor, recebidoPor) {
        const { data: est } = await supabase.schema('insumo').from('estoque')
            .select('id, quantidade_disponivel')
            .eq('processo_id', processoId)
            .eq('insumo_id', insumoId).single();
        
        if (est) {
            await supabase.schema('insumo').from('estoque').update({
                quantidade_disponivel: Number(est.quantidade_disponivel) - Number(quantidade),
                updated_at: new Date().toISOString()
            }).eq('id', est.id);
        }

        await supabase.schema('insumo').from('movimentacoes').insert([{
            tipo: 'SAIDA_PRODUCAO',
            processo_origem_id: processoId,
            processo_destino_id: processoId,
            insumo_id: insumoId,
            quantidade: quantidade,
            entregue_por: entreguePor,
            recebido_por: recebidoPor,
            observacao: 'Saída direta para produção'
        }]);
    }

    static async registrarEmprestimo(processoOrigemId, processoDestinoId, insumoId, quantidade, entreguePor, recebidoPor) {
        const { data: est } = await supabase.schema('insumo').from('estoque')
            .select('id, quantidade_disponivel')
            .eq('processo_id', processoOrigemId)
            .eq('insumo_id', insumoId).single();
        
        if (est) {
            await supabase.schema('insumo').from('estoque').update({
                quantidade_disponivel: Number(est.quantidade_disponivel) - Number(quantidade),
                updated_at: new Date().toISOString()
            }).eq('id', est.id);
        }

        await supabase.schema('insumo').from('movimentacoes').insert([{
            tipo: 'EMPRESTIMO',
            processo_origem_id: processoOrigemId,
            processo_destino_id: processoDestinoId,
            insumo_id: insumoId,
            quantidade: quantidade,
            entregue_por: entreguePor,
            recebido_por: recebidoPor,
            observacao: 'Empréstimo entre processos para produção imediata'
        }]);
    }

    // NOVO MÉTODO: Orquestra o envio combinando Estoque Próprio + Empréstimos
    static async registrarSaidaMultipla(processoDestinoId, insumoId, qtdPropria, emprestimos, entreguePor, recebidoPor) {
        // 1. Desconta do estoque próprio, se solicitado
        if (qtdPropria > 0) {
            await this.registrarSaida(processoDestinoId, insumoId, qtdPropria, entreguePor, recebidoPor);
        }
        // 2. Desconta dos estoques emprestados, iterando o array
        if (emprestimos && emprestimos.length > 0) {
            for (let emp of emprestimos) {
                if (emp.quantidade > 0) {
                    await this.registrarEmprestimo(emp.processoOrigemId, processoDestinoId, insumoId, emp.quantidade, entreguePor, recebidoPor);
                }
            }
        }
    }
}
module.exports = EnvioService;
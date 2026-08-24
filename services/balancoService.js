const supabase = require('../config/db');
const ProcessoService = require('./processoService');

class BalancoService {
    static async obterDadosBalanco() {
        // 1. Mapeia todos os insumos (agora pegando a descrição)
        const { data: insumos } = await supabase.schema('orcamento').from('insumo').select('id, descricao, valor_unit, unidade');
        const mapValorInsumo = {};
        const mapNomeInsumo = {};
        const mapUnidadeInsumo = {};
        
        if (insumos) {
            insumos.forEach(i => {
                mapValorInsumo[i.id] = Number(i.valor_unit) || 0;
                mapNomeInsumo[i.id] = i.descricao;
                mapUnidadeInsumo[i.id] = i.unidade;
            });
        }

        // 2. Calcula o Total em Estoque (Almoxarifado) e cria o Detalhamento
        const { data: estoque } = await supabase.schema('insumo').from('estoque_geral').select('*');
        let valorTotalEstoque = 0;
        const estoqueDetalhado = [];

        if (estoque) {
            estoque.forEach(e => {
                const totalQtd = Number(e.qtd_sede || 0) + Number(e.qtd_complexo || 0) + Number(e.qtd_regional || 0);
                const valorUnit = mapValorInsumo[e.insumo_id] || 0;
                const valorTotal = totalQtd * valorUnit;
                
                valorTotalEstoque += valorTotal;

                if (totalQtd > 0) {
                    estoqueDetalhado.push({
                        insumo_id: e.insumo_id,
                        nome: mapNomeInsumo[e.insumo_id] || 'Insumo não encontrado',
                        unidade: mapUnidadeInsumo[e.insumo_id] || '-',
                        qtd: totalQtd,
                        valor_unitario: valorUnit,
                        valor_total: valorTotal
                    });
                }
            });
        }
        
        // Ordena o detalhamento do estoque do mais caro pro mais barato
        estoqueDetalhado.sort((a, b) => b.valor_total - a.valor_total);

        // 3. Calcula o Total Enviado (Geral e separado por Processo)
        const { data: movs } = await supabase.schema('insumo').from('movimentacoes').select('insumo_id, quantidade, processo_destino_id').eq('tipo', 'SAIDA_PRODUCAO');
        let valorTotalEnviado = 0;
        const mapEnviadoProcesso = {}; 
        
        if (movs) {
            movs.forEach(m => {
                const valor = Number(m.quantidade) * (mapValorInsumo[m.insumo_id] || 0);
                valorTotalEnviado += valor;
                
                if (m.processo_destino_id) {
                    if (!mapEnviadoProcesso[m.processo_destino_id]) mapEnviadoProcesso[m.processo_destino_id] = 0;
                    mapEnviadoProcesso[m.processo_destino_id] += valor;
                }
            });
        }

        // 4. Calcula o Total Solicitado analisando as composições
        const { data: processos } = await supabase.schema('insumo').from('processos').select('id, numero, nome, status');
        let valorTotalSolicitado = 0;
        const balancoProcessos = [];

        if (processos) {
            for (let proc of processos) {
                const detalhes = await ProcessoService.obterDetalhesComposicao(proc.id);
                let valorSolicitadoProc = 0;
                
                if (detalhes && detalhes.insumos_consolidados) {
                    detalhes.insumos_consolidados.forEach(ins => {
                        valorSolicitadoProc += Number(ins.custo_arredondado || 0);
                    });
                }

                valorTotalSolicitado += valorSolicitadoProc;
                const valorEnviadoProc = mapEnviadoProcesso[proc.id] || 0;
                
                balancoProcessos.push({
                    id: proc.id,
                    numero: proc.numero,
                    nome: proc.nome,
                    status: proc.status,
                    valor_solicitado: valorSolicitadoProc,
                    valor_enviado: valorEnviadoProc,
                    saldo_a_enviar: valorSolicitadoProc - valorEnviadoProc
                });
            }
        }

        return {
            valorTotalEstoque,
            estoqueDetalhado, // Nova array com os detalhes do estoque
            valorTotalEnviado,
            valorTotalSolicitado,
            balancoProcessos: balancoProcessos.sort((a, b) => b.valor_solicitado - a.valor_solicitado)
        };
    }
}

module.exports = BalancoService;
const supabase = require('../config/db');
const ProcessoService = require('./processoService');

class BalancoService {
    static async obterDadosBalanco(oficinaFiltroId = null) {
        // 1. Mapeia todas as oficinas para exibir os chips de filtro
        const { data: oficinasList } = await supabase.schema('orcamento').from('oficinas').select('id, nome').order('nome');
        const oficinas = (oficinasList || []).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

        // 2. Mapeia insumos
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

        // Mapeamentos para associar insumo/produto à oficina
        const { data: composicoesProd } = await supabase.schema('orcamento').from('produto_composicao').select('insumo_id, produto_id');
        const { data: produtos } = await supabase.schema('orcamento').from('produto').select('id, grupo_id');
        const { data: grupos } = await supabase.schema('orcamento').from('grupos').select('id, nome, oficina_id');

        const mapaProdGrupo = {};
        if (produtos) produtos.forEach(p => { mapaProdGrupo[p.id] = p.grupo_id; });

        const mapaGrupoOficina = {};
        if (grupos) grupos.forEach(g => { mapaGrupoOficina[g.id] = g.oficina_id; });

        // insumo_id -> Set de oficina_ids
        const insumoOficinasMap = {};
        if (composicoesProd) {
            composicoesProd.forEach(c => {
                const grupoId = mapaProdGrupo[c.produto_id];
                const oficinaId = grupoId ? mapaGrupoOficina[grupoId] : null;
                if (oficinaId) {
                    if (!insumoOficinasMap[c.insumo_id]) insumoOficinasMap[c.insumo_id] = new Set();
                    insumoOficinasMap[c.insumo_id].add(String(oficinaId));
                }
            });
        }

        const filtroIdStr = oficinaFiltroId ? String(oficinaFiltroId) : null;

        // 3. Calcula o Total em Estoque (Almoxarifado)
        const { data: estoque } = await supabase.schema('insumo').from('estoque_geral').select('*');
        let valorTotalEstoque = 0;
        const estoqueDetalhado = [];

        if (estoque) {
            estoque.forEach(e => {
                // Se houver filtro de oficina, verifica se o insumo pertence à oficina
                if (filtroIdStr) {
                    const ofSet = insumoOficinasMap[e.insumo_id];
                    if (!ofSet || !ofSet.has(filtroIdStr)) return;
                }

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
        
        estoqueDetalhado.sort((a, b) => b.valor_total - a.valor_total);

        // 4. Mapeia processos e suas oficinas através dos produtos solicitados
        const { data: procProdutos } = await supabase.schema('insumo').from('processo_produtos').select('processo_id, produto_id');
        const processoOficinasMap = {}; // processo_id -> Set de oficina_ids
        if (procProdutos) {
            procProdutos.forEach(pp => {
                const grupoId = mapaProdGrupo[pp.produto_id];
                const oficinaId = grupoId ? mapaGrupoOficina[grupoId] : null;
                if (oficinaId) {
                    if (!processoOficinasMap[pp.processo_id]) processoOficinasMap[pp.processo_id] = new Set();
                    processoOficinasMap[pp.processo_id].add(String(oficinaId));
                }
            });
        }

        // 5. Calcula o Total Enviado
        const { data: movs } = await supabase.schema('insumo').from('movimentacoes').select('insumo_id, quantidade, processo_destino_id').eq('tipo', 'SAIDA_PRODUCAO');
        let valorTotalEnviado = 0;
        const mapEnviadoProcesso = {}; 
        
        if (movs) {
            movs.forEach(m => {
                if (filtroIdStr) {
                    const ofSet = insumoOficinasMap[m.insumo_id];
                    if (!ofSet || !ofSet.has(filtroIdStr)) return;
                }

                const valor = Number(m.quantidade) * (mapValorInsumo[m.insumo_id] || 0);
                valorTotalEnviado += valor;
                
                if (m.processo_destino_id) {
                    if (!mapEnviadoProcesso[m.processo_destino_id]) mapEnviadoProcesso[m.processo_destino_id] = 0;
                    mapEnviadoProcesso[m.processo_destino_id] += valor;
                }
            });
        }

        // 6. Calcula o Total Solicitado analisando as composições
        const { data: processos } = await supabase.schema('insumo').from('processos')
            .select('id, numero, nome, status')
            .not('status', 'in', '("Pendente","Recusado")');
            
        let valorTotalSolicitado = 0;
        const balancoProcessos = [];

        if (processos) {
            for (let proc of processos) {
                // Se houver filtro de oficina, verifica se o processo pertence à oficina
                if (filtroIdStr) {
                    const ofSet = processoOficinasMap[proc.id];
                    if (!ofSet || !ofSet.has(filtroIdStr)) continue;
                }

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
            oficinas,
            oficinaFiltroId: oficinaFiltroId || '',
            valorTotalEstoque,
            estoqueDetalhado,
            valorTotalEnviado,
            valorTotalSolicitado,
            balancoProcessos: balancoProcessos.sort((a, b) => b.valor_solicitado - a.valor_solicitado)
        };
    }
}

module.exports = BalancoService;
const ProcessoService = require('../services/processoService');
const EstoqueService = require('../services/estoqueService');
const supabase = require('../config/db'); 

exports.index = async (req, res) => {
    try {
        const processos = await ProcessoService.listarTodos();
        res.render('processos/index', { processos, user: res.locals.user });
    } catch (error) {
        res.status(500).send('Erro ao carregar processos');
    }
};

exports.novo = async (req, res) => {
    try {
        const produtos = await ProcessoService.buscarProdutosOrcamento();
        res.render('processos/novo', { produtos, user: res.locals.user });
    } catch (error) {
        res.status(500).send('Erro ao carregar formulário');
    }
};

exports.criar = async (req, res) => {
    try {
        let { numero, nome, produtos_ids, produtos_qtds } = req.body;
        
        // Higieniza o número do processo removendo os pontos
        if (numero) numero = String(numero).replace(/\./g, '');

        let produtos = [];
        if (Array.isArray(produtos_ids)) {
            for(let i=0; i<produtos_ids.length; i++) {
                produtos.push({ produto_id: produtos_ids[i], quantidade: produtos_qtds[i] });
            }
        } else if (produtos_ids) {
            produtos.push({ produto_id: produtos_ids, quantidade: produtos_qtds });
        }
        await ProcessoService.criar(numero, nome, produtos);
        res.redirect('/processos');
    } catch (error) {
        res.status(500).send('Erro ao criar processo');
    }
};

exports.detalhes = async (req, res) => {
    try {
        const processo = await ProcessoService.obterDetalhesComposicao(req.params.id);
        if (!processo) return res.status(404).send('Processo não encontrado');

        const { data: estoqueGeral } = await supabase.schema('insumo').from('estoque_geral').select('*');
        const mapaEstoque = {};
        if (estoqueGeral) {
            estoqueGeral.forEach(e => {
                if (!mapaEstoque[e.insumo_id]) mapaEstoque[e.insumo_id] = 0;
                mapaEstoque[e.insumo_id] += (Number(e.qtd_sede || 0) + Number(e.qtd_complexo || 0) + Number(e.qtd_regional || 0));
            });
        }

        const { data: reservas } = await supabase.schema('insumo').from('estoque_reservas').select('*').eq('processo_id', processo.id);
        const mapaReservas = {};
        if (reservas) {
            reservas.forEach(r => { mapaReservas[r.insumo_id] = Number(r.quantidade_reservada); });
        }

        const { data: movs } = await supabase.schema('insumo').from('movimentacoes').select('*').eq('processo_destino_id', processo.id).eq('tipo', 'SAIDA_PRODUCAO');
        const mapaEnviado = {};
        if (movs) {
            movs.forEach(m => {
                if (!mapaEnviado[m.insumo_id]) mapaEnviado[m.insumo_id] = 0;
                mapaEnviado[m.insumo_id] += Number(m.quantidade);
            });
        }

        const insumosGerais = await EstoqueService.listarEstoqueGeral();
        const mapaRef = {};
        insumosGerais.forEach(item => {
            if (item.ids && Array.isArray(item.ids)) {
                item.ids.forEach(id => mapaRef[id] = item.ref);
            } else if (item.id) {
                mapaRef[item.id] = item.ref;
            }
        });

        const listaBase = processo.insumos_consolidados || [];
        processo.insumos_completos = listaBase
            .filter(ins => {
                const ref = ins.ref !== undefined ? ins.ref : mapaRef[ins.insumo_id];
                return ref && String(ref).trim() !== '';
            })
            .map(ins => {
                const almoxarifado = mapaEstoque[ins.insumo_id] || 0;
                const separado = mapaReservas[ins.insumo_id] || 0;
                const enviado = mapaEnviado[ins.insumo_id] || 0;
                const necessario = ins.qtd_arredondada || 0;

                return {
                    ...ins,
                    qtd_almoxarifado: almoxarifado,
                    qtd_separada: separado,
                    qtd_enviada: enviado,
                    qtd_pendente: (necessario - enviado > 0) ? necessario - enviado : 0,
                    status_concluido: enviado >= necessario
                };
            });

        res.render('processos/detalhes', { processo, user: res.locals.user });
    } catch (error) {
        console.error(error);
        res.status(500).send('<h2 style="color:red;">ERRO REAL AO CARREGAR DETALHES:</h2><pre>' + error.stack + '</pre>');
    }
};

exports.composicao = async (req, res) => {
    try {
        const processo = await ProcessoService.obterDetalhesComposicao(req.params.id);
        if (!processo) return res.status(404).send('Processo não encontrado');
        
        const insumosGerais = await EstoqueService.listarEstoqueGeral();
        const mapaRef = {};
        insumosGerais.forEach(item => {
            if (item.ids && Array.isArray(item.ids)) {
                item.ids.forEach(id => mapaRef[id] = item.ref);
            } else if (item.id) {
                mapaRef[item.id] = item.ref;
            }
        });

        if (processo.produtos) {
            processo.produtos.forEach(prod => {
                if (prod.itens) {
                    prod.itens = prod.itens.filter(item => {
                        if (!item.insumo) return false;
                        const insumoId = item.insumo.id || item.insumo_id;
                        const ref = item.insumo.ref !== undefined ? item.insumo.ref : mapaRef[insumoId];
                        return ref && String(ref).trim() !== '';
                    });
                }
            });
        }
        
        res.render('processos/composicao', { processo, user: res.locals.user });
    } catch (error) {
        console.error(error);
        res.status(500).send('<h2 style="color:red;">ERRO REAL AO CARREGAR COMPOSIÇÃO:</h2><pre>' + error.stack + '</pre>');
    }
};

exports.editar = async (req, res) => {
    try {
        const processo = await ProcessoService.buscarPorId(req.params.id);
        res.render('processos/editar', { processo, user: res.locals.user });
    } catch (error) {
        res.status(500).send('Erro ao carregar edição');
    }
};

exports.atualizar = async (req, res) => {
    try {
        let { numero, nome } = req.body;
        // Higieniza o número do processo removendo os pontos
        if (numero) numero = String(numero).replace(/\./g, '');
        
        await ProcessoService.atualizar(req.params.id, numero, nome);
        res.redirect('/processos');
    } catch (error) {
        res.status(500).send('Erro ao atualizar');
    }
};

exports.deletar = async (req, res) => {
    try {
        await ProcessoService.excluir(req.params.id);
        res.redirect('/processos');
    } catch (error) {
        res.status(500).send('Erro ao deletar');
    }
};
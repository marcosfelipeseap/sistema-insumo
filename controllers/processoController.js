const ProcessoService = require('../services/processoService');
const EstoqueService = require('../services/estoqueService');
const supabase = require('../config/db'); // Importação necessária para puxar os saldos

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
        const { numero, nome, produtos_ids, produtos_qtds } = req.body;
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

        // 1. Busca Saldo Total no Almoxarifado (Sede + Complexo)
        const { data: estoqueGeral } = await supabase.schema('insumo').from('estoque_geral').select('*');
        const mapaEstoque = {};
        if (estoqueGeral) {
            estoqueGeral.forEach(e => {
                if (!mapaEstoque[e.insumo_id]) mapaEstoque[e.insumo_id] = 0;
                mapaEstoque[e.insumo_id] += (Number(e.qtd_sede) + Number(e.qtd_complexo));
            });
        }

        // 2. Busca Quantidade já Separada (Reservada para a Demanda)
        const { data: reservas } = await supabase.schema('insumo').from('estoque_reservas').select('*').eq('processo_id', processo.id);
        const mapaReservas = {};
        if (reservas) {
            reservas.forEach(r => { mapaReservas[r.insumo_id] = Number(r.quantidade_reservada); });
        }

        // 3. Busca Quantidade já Enviada para Produção
        const { data: movs } = await supabase.schema('insumo').from('movimentacoes').select('*').eq('processo_destino_id', processo.id).eq('tipo', 'SAIDA_PRODUCAO');
        const mapaEnviado = {};
        if (movs) {
            movs.forEach(m => {
                if (!mapaEnviado[m.insumo_id]) mapaEnviado[m.insumo_id] = 0;
                mapaEnviado[m.insumo_id] += Number(m.quantidade);
            });
        }

        // 4. Junta tudo em uma lista completa
        const listaBase = processo.insumos_consolidados || [];
        processo.insumos_completos = listaBase.map(ins => {
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

// NOVA FUNÇÃO: Renderiza apenas a tela de composição de custo/insumo
exports.composicao = async (req, res) => {
    try {
        const processo = await ProcessoService.obterDetalhesComposicao(req.params.id);
        if (!processo) return res.status(404).send('Processo não encontrado');
        
        res.render('processos/composicao', { processo, user: res.locals.user });
    } catch (error) {
        console.error(error);
        res.status(500).send('<h2 style="color:red;">ERRO REAL AO CARREGAR COMPOSIÇÃO:</h2><pre>' + error.stack + '</pre>');
    }
};

exports.editar = async (req, res) => {
    try {
        if (res.locals.user && (res.locals.user.role === 'Monitor' || res.locals.user.role === 'Coordenador')) return res.status(403).send('Sem permissão.');
        const processo = await ProcessoService.buscarPorId(req.params.id);
        res.render('processos/editar', { processo, user: res.locals.user });
    } catch (error) {
        res.status(500).send('Erro ao carregar edição');
    }
};

exports.atualizar = async (req, res) => {
    try {
        if (res.locals.user && (res.locals.user.role === 'Monitor' || res.locals.user.role === 'Coordenador')) return res.status(403).send('Sem permissão.');
        await ProcessoService.atualizar(req.params.id, req.body.numero, req.body.nome);
        res.redirect('/processos');
    } catch (error) {
        res.status(500).send('Erro ao atualizar');
    }
};

exports.deletar = async (req, res) => {
    try {
        if (res.locals.user && (res.locals.user.role === 'Monitor' || res.locals.user.role === 'Coordenador')) return res.status(403).send('Sem permissão.');
        await ProcessoService.excluir(req.params.id);
        res.redirect('/processos');
    } catch (error) {
        res.status(500).send('Erro ao deletar');
    }
};
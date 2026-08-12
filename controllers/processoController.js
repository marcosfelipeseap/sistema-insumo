const ProcessoService = require('../services/processoService');
const EstoqueService = require('../services/estoqueService');

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
        const processo = await EstoqueService.listarEstoqueProcesso(req.params.id);
        if (!processo) return res.status(404).send('Processo não encontrado');
        res.render('processos/detalhes', { processo, user: res.locals.user });
    } catch (error) {
        res.status(500).send('Erro ao carregar detalhes');
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
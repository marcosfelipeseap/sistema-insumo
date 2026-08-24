const SimuladorService = require('../services/simuladorService');

const simuladorController = {
    // Renderiza a tela principal
    index: async (req, res) => {
        try {
            const produtos = await SimuladorService.obterProdutos();
            res.render('simulador/index', { produtos, user: res.locals.user });
        } catch (error) {
            console.error(error);
            res.status(500).send("Erro ao carregar os dados do simulador.");
        }
    },

    // Rota da API (AJAX) que recebe os dados, calcula e devolve o JSON
    calcular: async (req, res) => {
        try {
            const { itens } = req.body;
            if (!itens || itens.length === 0) {
                return res.status(400).json({ erro: "Nenhum produto selecionado." });
            }
            
            const resultado = await SimuladorService.calcularSimulacao(itens);
            res.json(resultado);
        } catch (error) {
            console.error(error);
            res.status(500).json({ erro: error.message || "Erro interno ao processar simulação." });
        }
    }
};

module.exports = simuladorController;
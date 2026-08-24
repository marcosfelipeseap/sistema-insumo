const BalancoService = require('../services/balancoService');

const balancoController = {
    index: async (req, res) => {
        try {
            const dados = await BalancoService.obterDadosBalanco();
            res.render('balanco/index', { dados, user: res.locals.user });
        } catch (error) {
            console.error(error);
            res.status(500).send("Erro ao carregar o balanço financeiro da UGTR.");
        }
    }
};

module.exports = balancoController;
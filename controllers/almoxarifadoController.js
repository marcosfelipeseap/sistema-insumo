const almoxarifadoService = require('../services/almoxarifadoService');

exports.getIndex = async (req, res) => {
    try {
        const dadosEstoque = await almoxarifadoService.getEstoqueData();
        res.render('almoxarifado/index', { 
            title: 'Almoxarifado Sede',
            dados: dadosEstoque 
        });
    } catch (error) {
        console.error('Erro ao buscar dados da planilha:', error);
        res.status(500).send('Erro ao carregar o estoque do almoxarifado.');
    }
};
const EstoqueService = require('../services/estoqueService');
const ProcessoService = require('../services/processoService');

const envioController = {
    index: async (req, res) => {
        try {
            const processos = await ProcessoService.listarTodos();
            const ativos = processos.filter(p => p.status !== 'Concluído');
            res.render('envios/index', { processos: ativos, user: res.locals.user });
        } catch (error) {
            res.status(500).send('Erro ao carregar processos');
        }
    },

    painelEnvio: async (req, res) => {
        try {
            const processo = await EstoqueService.listarSaldosEnvio(req.params.id);
            if (!processo) return res.status(404).send("Processo não encontrado");

            // CORREÇÃO: Cria o mapa de referências para barrar salários/taxas
            const insumosGerais = await EstoqueService.listarEstoqueGeral();
            const mapaRef = {};
            insumosGerais.forEach(item => {
                if (item.ids && Array.isArray(item.ids)) {
                    item.ids.forEach(id => mapaRef[id] = item.ref);
                } else if (item.id) {
                    mapaRef[item.id] = item.ref;
                }
            });

            // Aplica o filtro de segurança para esconder itens sem "ref"
            if (processo.insumos_envio) {
                processo.insumos_envio = processo.insumos_envio.filter(ins => {
                    const ref = ins.ref !== undefined ? ins.ref : mapaRef[ins.insumo_id];
                    return ref && String(ref).trim() !== '';
                });
            }

            // Busca o histórico formatado em lotes
            processo.historico_lotes = await EstoqueService.obterHistoricoEnvios(processo.id);

            res.render('envios/gerenciar', { processo, user: res.locals.user });
        } catch(error) {
            console.error(error);
            res.status(500).send(`<h2 style="color:red;">ERRO:</h2><pre>${error.stack}</pre>`);
        }
    },

    registrarEnvio: async (req, res) => {
        try {
            // Usa o cargo diretamente (foi atualizado no seu AuthMiddleware)
            if (res.locals.user && (res.locals.user.cargo === 'Monitor' || res.locals.user.cargo === 'Coordenador')) {
                return res.status(403).send('Sem permissão.');
            }
            
            const { selecionados, recebido_por } = req.body;
            const processoId = req.params.id;
            const entregue_por = res.locals.user ? res.locals.user.username : 'Sistema';

            if (!recebido_por || recebido_por.trim() === '') {
                return res.status(400).send(`<script>alert('É obrigatório informar quem recebeu o material.'); window.history.back();</script>`);
            }

            if (!selecionados) {
                return res.status(400).send(`<script>alert('Nenhum insumo foi selecionado para envio.'); window.history.back();</script>`);
            }

            // Transforma em array caso venha apenas 1 checkbox marcado
            const idsSelecionados = Array.isArray(selecionados) ? selecionados : [selecionados];
            const loteEnvios = [];

            // Monta o lote pegando a quantidade e a origem de cada insumo marcado
            for (let id of idsSelecionados) {
                const qtd = req.body[`qtd_${id}`];
                const origem = req.body[`origem_${id}`];
                
                if (!qtd || !origem) throw new Error("Preencha a quantidade e origem de todos os itens selecionados.");

                loteEnvios.push({ insumo_id: id, quantidade: qtd, origem: origem });
            }

            // Realiza o envio em lote e pega o ID do recibo gerado
            const loteId = await EstoqueService.registrarEnvioProducaoLote(processoId, loteEnvios, entregue_por, recebido_por);
            
            // Redireciona para o comprovante deste lote
            res.redirect(`/envios/comprovante/${loteId}`);
            
        } catch(error) {
            res.status(400).send(`<script>alert('${error.message}'); window.history.back();</script>`);
        }
    },

    comprovante: async (req, res) => {
        try {
            const comprovante = await EstoqueService.obterComprovanteEnvioLote(req.params.movimentacaoId);
            if (!comprovante) return res.status(404).send('Comprovante não encontrado.');
            
            res.render('envios/comprovante', { comprovante });
        } catch (error) {
            console.error(error);
            res.status(500).send('Erro ao gerar comprovante.');
        }
    }
};

module.exports = envioController;
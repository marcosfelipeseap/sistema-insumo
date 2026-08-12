const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();

// Configurações do View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares Globais
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware de Usuário Mocado (Simulação de Login)
// Para testar as travas de permissão, altere o 'role' de 'admin' para 'Monitor' ou 'Coordenador'
app.use((req, res, next) => {
    res.locals.user = {
        username: 'Marcos', 
        role: 'admin' 
    };
    next();
});

// Importação das Rotas
const processoRoutes = require('./routes/processos');
const estoqueRoutes = require('./routes/estoque');
const envioRoutes = require('./routes/envios');

// Integração das Rotas na Aplicação
app.use('/processos', processoRoutes);
app.use('/estoque', estoqueRoutes);
app.use('/envios', envioRoutes);

// Rota raiz redirecionando automaticamente para a página de processos
app.get('/', (req, res) => {
    res.redirect('/processos');
});

module.exports = app;
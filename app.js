const express = require('express');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const app = express();

// Configurações do View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares Globais
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuração da Sessão (Otimizada para não cair rápido na Vercel)
app.use(session({
    secret: process.env.SESSION_SECRET || 'chave-secreta-ugtr-2026',
    resave: true, // Força a salvar a sessão ativa
    rolling: true, // Renova o tempo do cookie a cada requisição
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // Duração de 24 horas
        httpOnly: true, // Protege contra acessos via JS
        // secure: process.env.NODE_ENV === 'production' // Descomente esta linha se o seu site na Vercel estiver usando HTTPS/SSL
    }
}));

// Middleware Global de Variáveis (Injeta alertas e usuário nas telas)
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.erro = req.session.erro || null;
    res.locals.sucesso = req.session.sucesso || null;
    delete req.session.erro;
    delete req.session.sucesso;
    next();
});

// Importação das Rotas
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const perfilRoutes = require('./routes/perfil');
const processoRoutes = require('./routes/processos');
const estoqueRoutes = require('./routes/estoque');
const envioRoutes = require('./routes/envios');
const balancoRoutes = require('./routes/balanco');
const simuladorRoutes = require('./routes/simulador'); 

// Importação dos Middlewares de Segurança
const { requireLogin } = require('./middlewares/auth');

// Integração das Rotas na Aplicação
app.use('/', authRoutes);
app.use('/admin', requireLogin, adminRoutes);
app.use('/perfil', requireLogin, perfilRoutes);
app.use('/processos', requireLogin, processoRoutes);
app.use('/estoque', requireLogin, estoqueRoutes);
app.use('/envios', requireLogin, envioRoutes);
app.use('/balanco', requireLogin, balancoRoutes);
app.use('/simulador', requireLogin, simuladorRoutes); 

// Rota raiz redirecionando de acordo com o cargo do usuário
app.get('/', (req, res) => {
    if (req.session.user && req.session.user.cargo === 'Monitor') {
        return res.redirect('/estoque'); 
    }
    res.redirect('/processos'); 
});

module.exports = app;
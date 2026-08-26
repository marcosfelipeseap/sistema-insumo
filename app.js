const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session'); // Trocamos para cookie-session!
require('dotenv').config();

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Sessão baseada em Cookie: Resolve o problema do Vercel Serverless
app.use(cookieSession({
    name: 'satre-session',
    keys: [process.env.SESSION_SECRET || 'chave-secreta-ugtr-2026', 'chave-backup-123'],
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
}));

// Middleware Global de Variáveis
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.erro = req.session.erro || null;
    res.locals.sucesso = req.session.sucesso || null;
    
    // O cookie-session não tem "delete" fácil para variáveis únicas, então zeramos reatribuindo
    req.session.erro = null;
    req.session.sucesso = null;
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

app.get('/', (req, res) => {
    if (req.session.user && req.session.user.cargo === 'Monitor') {
        return res.redirect('/estoque');
    }
    res.redirect('/processos');
});

module.exports = app;
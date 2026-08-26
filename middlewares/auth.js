// middlewares/auth.js

const requireLogin = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session.user || req.session.user.cargo !== 'admin') {
        return res.status(403).send(`
            <script>
                alert('Acesso negado. Apenas administradores podem acessar esta área.');
                window.history.back();
            </script>
        `);
    }
    next();
};

const requireRoleAcoes = (req, res, next) => {
    const cargo = req.session.user ? req.session.user.cargo : null;
    
    // Bloqueia ações críticas (como ajuste de saldo) para Monitores e usuários comuns
    // Coordenador e Admin passam direto
    if (cargo === 'Monitor' || cargo === 'usuario' || !cargo) {
        return res.status(403).send(`
            <script>
                alert('Acesso negado. Apenas Coordenadores ou Administradores podem realizar esta ação.');
                window.history.back();
            </script>
        `);
    }
    next();
};

module.exports = { requireLogin, requireAdmin, requireRoleAcoes };
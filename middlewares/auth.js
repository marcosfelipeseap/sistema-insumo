// middlewares/auth.js

const requireLogin = (req, res, next) => {
    // Se não tem usuário na sessão, manda pro login
    if (!req.session.user) {
        return res.redirect('/login');
    }
    // Como a checagem de "aprovado" já é feita na hora do login, 
    // se o usuário tem sessão, ele está liberado.
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session.user || req.session.user.cargo !== 'admin') {
        req.session.erro = 'Acesso negado. Apenas administradores podem acessar esta área.';
        return res.redirect('/processos');
    }
    next();
};

const requireRoleAcoes = (req, res, next) => {
    const cargo = req.session.user ? req.session.user.cargo : null;
    // Bloqueia ações de escrita/exclusão para perfis restritos
    if (cargo === 'Monitor' || cargo === 'Coordenador' || cargo === 'usuario') {
        req.session.erro = 'Seu nível de acesso não permite realizar esta ação.';
        return res.redirect('back');
    }
    next();
};

module.exports = { requireLogin, requireAdmin, requireRoleAcoes };
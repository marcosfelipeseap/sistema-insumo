const bcrypt = require('bcrypt'); // Se você instalou o bcryptjs, mude esta linha para: require('bcryptjs')
const supabase = require('../config/db');

exports.getLogin = (req, res) => {
    // Se o usuário já estiver logado, faz a triagem de redirecionamento padrão
    if (req.session && req.session.user) {
        if (req.session.user.cargo === 'Monitor') return res.redirect('/estoque');
        return res.redirect('/processos');
    }
    
    res.render('auth/login', { layout: false }); 
};

exports.getCadastro = (req, res) => {
    res.render('auth/cadastro', { layout: false });
};

exports.postLogin = async (req, res) => {
    // Adicionado 'destino' para capturar a escolha do usuário
    const { login, senha, destino } = req.body;

    if (!login || !senha) {
        req.session.erro = 'O preenchimento do login e senha é obrigatório.';
        return res.redirect('/login');
    }

    const { data: usuario, error } = await supabase
        .schema('insumo')
        .from('usuarios')
        .select('*')
        .or(`email.eq."${login}",usuario.eq."${login}"`)
        .single();

    if (error || !usuario || !(await bcrypt.compare(senha, usuario.senha))) {
        req.session.erro = 'Usuário/E-mail ou senha inválidos.';
        return res.redirect('/login');
    }
    
    if (usuario.status !== 'aprovado') {
        req.session.erro = 'Sua conta ainda aguarda aprovação do administrador.';
        return res.redirect('/login');
    }

    req.session.user = { 
        id: usuario.id, 
        username: usuario.nome, 
        loginUsuario: usuario.usuario,
        cargo: usuario.cargo 
    };
    
    // Lógica de Redirecionamento baseada na escolha do usuário
    if (destino === 'almoxarifado' && usuario.cargo !== 'solicitante') {
        return res.redirect('/almoxarifado');
    }

    if (usuario.cargo === 'Monitor') {
        return res.redirect('/estoque');
    }
    
    res.redirect('/processos');
};

exports.postCadastro = async (req, res) => {
    const { nome, usuario, email, senha } = req.body;

    if (!nome || !usuario || !email || !senha) {
        req.session.erro = 'Todos os campos são obrigatórios.';
        return res.redirect('/cadastro');
    }

    const senhaCriptografada = await bcrypt.hash(senha, 10);
    
    const { error } = await supabase
        .schema('insumo')
        .from('usuarios')
        .insert([{ nome, usuario, email, senha: senhaCriptografada }]);
    
    if (error) {
        req.session.erro = 'Erro ao realizar cadastro. Verifique se o usuário ou e-mail já existem.';
        return res.redirect('/cadastro');
    }
    
    req.session.sucesso = 'Cadastro realizado com sucesso! Aguarde a aprovação do administrador.';
    res.redirect('/login');
};

exports.logout = (req, res) => {
    req.session = null;
    res.redirect('/login');
};
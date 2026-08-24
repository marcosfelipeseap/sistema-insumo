const bcrypt = require('bcrypt'); // Se você instalou o bcryptjs, mude esta linha para: require('bcryptjs')
const supabase = require('../config/db');

exports.getLogin = (req, res) => {
    // Se o usuário já estiver logado, manda direto para os processos
    if (req.session.user) return res.redirect('/processos');
    res.render('auth/login', { layout: false, erro: req.session.erro, sucesso: req.session.sucesso }); 
};

exports.getCadastro = (req, res) => {
    res.render('auth/cadastro', { layout: false, erro: req.session.erro });
};

exports.postLogin = async (req, res) => {
    const { login, senha } = req.body;

    if (!login || !senha) {
        req.session.erro = 'O preenchimento do login e senha é obrigatório.';
        return res.redirect('/login');
    }

    // Busca o usuário no banco usando o e-mail OU o nome de usuário.
    // As aspas duplas ("${login}") evitam que o Supabase trave ao ler o @ do e-mail.
    const { data: usuario, error } = await supabase
        .schema('insumo')
        .from('usuarios')
        .select('*')
        .or(`email.eq."${login}",usuario.eq."${login}"`)
        .single();

    // Valida se o usuário existe e se a senha criptografada bate com a digitada
    if (error || !usuario || !(await bcrypt.compare(senha, usuario.senha))) {
        req.session.erro = 'Usuário/E-mail ou senha inválidos.';
        return res.redirect('/login');
    }
    
    // Trava de segurança para aprovação
    if (usuario.status !== 'aprovado') {
        req.session.erro = 'Sua conta ainda aguarda aprovação do administrador.';
        return res.redirect('/login');
    }

    // Salva os dados na sessão
    req.session.user = { 
        id: usuario.id, 
        username: usuario.nome, 
        loginUsuario: usuario.usuario,
        cargo: usuario.cargo 
    };
    
    res.redirect('/processos');
};

exports.postCadastro = async (req, res) => {
    const { nome, usuario, email, senha } = req.body;

    if (!nome || !usuario || !email || !senha) {
        req.session.erro = 'Todos os campos são obrigatórios.';
        return res.redirect('/cadastro');
    }

    // Criptografa a senha antes de salvar no banco
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
    // Destrói a sessão e volta para a tela de login
    req.session.destroy();
    res.redirect('/login');
};
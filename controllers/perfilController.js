const bcrypt = require('bcrypt');
const supabase = require('../config/db');

exports.index = async (req, res) => {
    // Busca os dados atualizados do usuário no banco
    const { data: usuario } = await supabase
        .schema('insumo')
        .from('usuarios')
        .select('*')
        .eq('id', req.session.user.id)
        .single();
    
    res.render('perfil/index', { usuario });
};

exports.atualizarDados = async (req, res) => {
    const { nome, usuario, email } = req.body;
    const userId = req.session.user.id;

    // Verifica se o novo e-mail ou usuário já pertencem a outra pessoa
    const { data: existente } = await supabase
        .schema('insumo')
        .from('usuarios')
        .select('id')
        .or(`email.eq.${email},usuario.eq.${usuario}`)
        .neq('id', userId); // Exclui o próprio usuário da busca
    
    if (existente && existente.length > 0) {
        req.session.erro = 'Nome de usuário ou e-mail já está em uso por outra conta.';
        return res.redirect('/perfil');
    }

    const { error } = await supabase
        .schema('insumo')
        .from('usuarios')
        .update({ nome, usuario, email })
        .eq('id', userId);

    if (error) {
        req.session.erro = 'Erro ao atualizar dados.';
    } else {
        req.session.sucesso = 'Perfil atualizado com sucesso!';
        // Atualiza a sessão local para refletir as mudanças no menu imediatamente
        req.session.user.username = nome;
        req.session.user.loginUsuario = usuario;
    }
    res.redirect('/perfil');
};

exports.atualizarSenha = async (req, res) => {
    const { senhaAtual, novaSenha, confirmaSenha } = req.body;
    const userId = req.session.user.id;

    // 1. Verifica se a nova senha foi digitada corretamente duas vezes
    if (novaSenha !== confirmaSenha) {
        req.session.erro = 'A nova senha e a confirmação não coincidem.';
        return res.redirect('/perfil');
    }

    // 2. Busca a senha atual criptografada no banco
    const { data: usuario } = await supabase
        .schema('insumo')
        .from('usuarios')
        .select('senha')
        .eq('id', userId)
        .single();

    // 3. Compara se a senha atual digitada é verdadeira
    const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha);
    if (!senhaValida) {
        req.session.erro = 'A senha atual informada está incorreta.';
        return res.redirect('/perfil');
    }

    // 4. Se tudo estiver certo, criptografa a nova e salva
    const senhaCriptografada = await bcrypt.hash(novaSenha, 10);
    const { error } = await supabase
        .schema('insumo')
        .from('usuarios')
        .update({ senha: senhaCriptografada })
        .eq('id', userId);

    if (error) {
        req.session.erro = 'Erro ao alterar a senha no banco de dados.';
    } else {
        req.session.sucesso = 'Senha alterada com sucesso!';
    }
    res.redirect('/perfil');
};
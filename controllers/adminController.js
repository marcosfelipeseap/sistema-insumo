const supabase = require('../config/db');

exports.listarUsuarios = async (req, res) => {
    const { data: usuarios, error } = await supabase
        .schema('insumo')
        .from('usuarios')
        .select('*')
        .order('created_at', { ascending: false });
        
    res.render('admin/usuarios', { usuarios: usuarios || [] });
};

exports.alterarStatus = async (req, res) => {
    const { status } = req.body;
    await supabase.schema('insumo').from('usuarios').update({ status }).eq('id', req.params.id);
    res.redirect('/admin/usuarios');
};

exports.promover = async (req, res) => {
    const { cargo } = req.body;
    await supabase.schema('insumo').from('usuarios').update({ cargo }).eq('id', req.params.id);
    res.redirect('/admin/usuarios');
};

exports.excluir = async (req, res) => {
    await supabase.schema('insumo').from('usuarios').delete().eq('id', req.params.id);
    res.redirect('/admin/usuarios');
};
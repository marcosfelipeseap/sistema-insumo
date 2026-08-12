const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Inicializa a conexão REST oficial do Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = supabase;
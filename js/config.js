// Configuração do Supabase. Pegue os valores no painel do Supabase:
//   Project Settings → API (ou "Data API" / "API Keys")
//
// A chave aqui é a pública ("anon public" ou "publishable"). Ela pode ficar no código:
// quem protege os dados são as regras de segurança do banco (supabase/schema.sql).
// NUNCA coloque aqui a chave "service_role" / "secret".

const CONFIG = {
  supabaseUrl: 'https://wvjqkiolxxpijlquxial.supabase.co',
  supabaseAnonKey: 'sb_publishable_EAG4hv7A32fkNGHfCZT9JQ_KhxTwkvx',

  // Login que o grupo digita na tela de entrada
  loginUsuario: 'Fellas',
  // E-mail do usuário do grupo criado no Supabase (Authentication → Users).
  // Se mudar, troque também em supabase/schema.sql (função eh_do_grupo).
  loginEmail: 'fellas@fellas.com',
};

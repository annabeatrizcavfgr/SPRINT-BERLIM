// lib/supabaseAuth.js — helper compartilhado por api/db.js e api/role.js: verifica quem está chamando a
// API (via o token da sessão do Supabase Auth, mandado pelo front-end no cabeçalho Authorization) e
// descobre/cria o "papel" (role) dessa pessoa numa tabela própria (user_roles), separada da tabela de
// autenticação do Supabase (que a gente não controla o schema).
//
// Tabela usada (criar uma vez, via SQL Editor do Supabase):
//   create table user_roles (
//     user_id uuid primary key,
//     email text unique not null,
//     role text not null default 'visualizador' check (role in ('planejador','visualizador')),
//     created_at timestamptz default now()
//   );
import { createClient } from '@supabase/supabase-js';

export function supabaseAdmin(){
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// extrai e valida o token "Bearer ..." do cabeçalho Authorization, devolve o usuário do Supabase Auth
// (ou null se não tiver token / token inválido/expirado).
export async function getAuthedUser(req, admin){
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if(!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if(error || !data || !data.user) return null;
  return data.user;
}

// devolve o role salvo pra esse usuário; se é a primeira vez que ele aparece, cria o registro — e se
// ele for a PRIMEIRA pessoa de todas a logar (tabela ainda vazia), vira "planejador" automaticamente
// (bootstrap do primeiro admin, sem precisar de nenhum passo manual no banco).
export async function getUserRole(admin, userId, email){
  const { data: existing } = await admin.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  if(existing) return existing.role;
  const { count } = await admin.from('user_roles').select('user_id', { count: 'exact', head: true });
  const role = (!count) ? 'planejador' : 'visualizador';
  await admin.from('user_roles').insert({ user_id: userId, email, role });
  return role;
}

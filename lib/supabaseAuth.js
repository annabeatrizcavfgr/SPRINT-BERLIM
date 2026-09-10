// lib/supabaseAuth.js — helper compartilhado por api/db.js e api/role.js: verifica quem esta chamando a
// API (via o token da sessao do Supabase Auth, mandado pelo front-end no cabecalho Authorization),
// descobre/cria o "papel" (role) e o "status" (pending/approved) dessa pessoa numa tabela propria
// (user_roles), e manda um e-mail pra ela (a dona do app) quando alguem novo pede acesso.
//
// Tabela usada (criar/atualizar uma vez, via SQL Editor do Supabase):
//   create table user_roles (
//     user_id uuid primary key,
//     email text unique not null,
//     role text not null default 'visualizador' check (role in ('planejador','visualizador')),
//     status text not null default 'pending' check (status in ('pending','approved')),
//     created_at timestamptz default now()
//   );
import { createClient } from '@supabase/supabase-js';

export function supabaseAdmin(){
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// extrai e valida o token "Bearer ..." do cabecalho Authorization, devolve o usuario do Supabase Auth
// (ou null se nao tiver token / token invalido/expirado).
export async function getAuthedUser(req, admin){
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if(!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if(error || !data || !data.user) return null;
  return data.user;
}

// manda um e-mail pra dona do app (ADMIN_NOTIFY_EMAIL) avisando que alguem pediu acesso. Usa o Resend
// (RESEND_API_KEY) — se essas variaveis nao estiverem configuradas ainda, so pula o envio (sem quebrar
// o cadastro por causa disso: a pessoa fica "pending" mesmo sem o e-mail sair, e a dona ainda pode ver
// e aprovar em "Usuarios").
async function notifyNewSignup(email){
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if(!key || !to) return;
  try{
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer '+key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Jardins Berlim <onboarding@resend.dev>',
        to: [to],
        subject: 'Novo pedido de acesso - Jardins Berlim',
        html: '<p><strong>'+email+'</strong> pediu acesso ao dashboard Jardins Berlim como visualizador.</p>'
          + '<p>Entre no site e aprove (ou recuse) em "Usuarios".</p>',
      }),
    });
  }catch(e){ console.error('notifyNewSignup failed', e); }
}

// devolve {role, status} pra esse usuario; se e a primeira vez que ele aparece, cria o registro — e se
// ele for a PRIMEIRA pessoa de todas a logar (tabela ainda vazia), vira "planejador" JA APROVADO
// automaticamente (bootstrap do primeiro admin, sem precisar de nenhum passo manual no banco). Qualquer
// outra pessoa entra como "visualizador" "pending" e dispara o e-mail de aviso.
export async function getUserRoleStatus(admin, userId, email){
  const { data: existing } = await admin.from('user_roles').select('role, status').eq('user_id', userId).maybeSingle();
  if(existing) return existing;
  const { count } = await admin.from('user_roles').select('user_id', { count: 'exact', head: true });
  const isFirst = !count;
  const role = isFirst ? 'planejador' : 'visualizador';
  const status = isFirst ? 'approved' : 'pending';
  await admin.from('user_roles').insert({ user_id: userId, email, role, status });
  if(!isFirst) await notifyNewSignup(email);
  return { role, status };
}

-- Hydra (Studio -> SQL Editor -> New query): schema do app "Acompanhamento de Metas / Sprint".
-- Troque o nome do schema abaixo se a regra do departamento pedir outro (ele precisa começar com app_ e ser único).
-- Estas 3 tabelas são exatamente as do Supabase cloud (public.docs, public.obras, public.user_roles), só que dentro
-- do schema do app. Não tem DROP/TRUNCATE (a role studio_publisher não permite) — dá pra rodar mais de uma vez.

create extension if not exists pgcrypto;

create schema if not exists app_planejamento_sprint;

-- "documentos": tudo que o app guarda (semanas, metas, restrições da Matriz GUT, projeções...), um por caminho
create table if not exists app_planejamento_sprint.docs (
  path  text  primary key,
  value jsonb not null
);
-- o app lista "filhos" de um caminho com LIKE 'caminho/%' — este índice deixa isso rápido
create index if not exists docs_path_prefix_idx
  on app_planejamento_sprint.docs (path text_pattern_ops);

create table if not exists app_planejamento_sprint.obras (
  id         text primary key,
  nome       text not null,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists app_planejamento_sprint.user_roles (
  user_id    uuid not null,
  obra_id    text not null references app_planejamento_sprint.obras (id),
  email      text not null,
  role       text not null default 'visualizador'
             check (role in ('planejador', 'coordenador', 'visualizador')),
  status     text not null default 'pending'
             check (status in ('pending', 'approved')),
  created_at timestamptz default now(),
  primary key (user_id, obra_id)
);
create unique index if not exists user_roles_email_obra_idx
  on app_planejamento_sprint.user_roles (lower(email), obra_id);

-- RLS ligada nas três. O app só fala com o banco pelo servidor dele (service_role), então NENHUMA policy pública
-- é necessária. ATENÇÃO: depois do expose automático (~5 min) a plataforma pode criar policies permissivas pra
-- "authenticated" — ver o passo de conferência no plano (select em pg_policies) antes de colocar dados reais.
alter table app_planejamento_sprint.docs       enable row level security;
alter table app_planejamento_sprint.obras      enable row level security;
alter table app_planejamento_sprint.user_roles enable row level security;

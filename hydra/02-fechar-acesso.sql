-- Hydra (Studio -> SQL Editor): fecha o acesso direto às tabelas do app.
--
-- Por quê: ~5 min depois de criar o schema, a plataforma cria sozinha policies "hydra_auto_*_authenticated" com
-- using(true) — ou seja, QUALQUER usuário logado em QUALQUER app Hydra leria/gravaria/apagaria estas tabelas direto
-- pela API (inclusive user_roles = quem é planejador). O app só fala com o banco pelo servidor dele (service_role,
-- que não passa pela RLS), então nenhum acesso direto é necessário.
--
-- Como: policies RESTRITIVAS "negar tudo". Elas valem EM CIMA das permissivas (as automáticas), então continuam
-- fechando mesmo que a plataforma recrie as automáticas depois. (DROP POLICY a role studio_publisher não pode.)

create policy hydra_negar_acesso_docs
  on app_planejamento_sprint.docs
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy hydra_negar_acesso_obras
  on app_planejamento_sprint.obras
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy hydra_negar_acesso_user_roles
  on app_planejamento_sprint.user_roles
  as restrictive for all to anon, authenticated
  using (false) with check (false);

-- CONFERÊNCIA 1 (rodar sozinha): devem aparecer 3 linhas com permissive = RESTRICTIVE
-- select tablename, policyname, permissive, roles
-- from pg_policies
-- where schemaname = 'app_planejamento_sprint' and policyname like 'hydra_negar%';
--
-- CONFERÊNCIA 2 (rodar sozinha; não grava nada por causa do rollback): tem que dar ERRO de permissão
-- begin;
-- set local role authenticated;
-- insert into app_planejamento_sprint.obras (id, nome) values ('zz-teste', 'teste');
-- rollback;

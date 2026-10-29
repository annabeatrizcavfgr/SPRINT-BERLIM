# Publicar o app no Hydra (Coolify) — passo a passo

Pré-requisitos já feitos: Team **CasasJardinsBerlim** no Coolify com os servidores FGRLNX07 (rodar) e FGRLNX09 (build); schema
`app_planejamento_sprint` criado no Studio (`01-schema.sql`) e fechado (`02-fechar-acesso.sql`).

Só continue quando a branch **`hydra`** estiver publicada no GitHub (GitHub Desktop → Publish branch).

## 1. Criar a aplicação no Coolify

1. `https://hydra.fgr.com.br` → Team **CasasJardinsBerlim** → **Projects** → **+** → nome `sprint-obras` → entrar no projeto → ambiente **production**.
2. **+ New Resource** → **Application** → **Public Repository** (o repositório é público).
3. Repository URL: `https://github.com/annabeatrizcavfgr/SPRINT-BERLIM` · Branch: **`hydra`**.
4. Server: **FGRLNX07** (rodar). Build server: **FGRLNX09** (se perguntar). Não troque.
5. Build Pack: **Nixpacks** (ele detecta Node pelo `package.json`; start = `npm start`).
6. Port (Ports Exposes): **3000**.
7. Domains: `https://sprint-obras.hydra.fgr.com.br`.
8. **Environment Variables** (aba da aplicação) — veja a tabela abaixo. **Antes do primeiro Deploy.**
9. **Deploy**. Acompanhe o *Deployment log* até ficar **Running** (verde).

## 2. Variáveis de ambiente (todas são de servidor / runtime)

| Nome | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://dados.hydra.fgr.com.br` |
| `SUPABASE_ANON_KEY` | a chave **anon** do guia Hydra (`contexto-ia.md` § Env) — é pública |
| `SUPABASE_SERVICE_ROLE_KEY` | a chave **service_role** do guia Hydra — **SECRETA**: só aqui, nunca no código nem em chat |
| `DB_SCHEMA` | `app_planejamento_sprint` |
| `AUTH_COMPARTILHADA` | `1` |
| `RELIGAR_POR_EMAIL` | `1` |
| `BOOTSTRAP_ADMIN_EMAILS` | `anna.ribeiro@fgr.com.br` (e outros e-mails de planejadores, separados por vírgula) |
| `OAUTH_PROVIDER` | `azure` — **só depois** de ligar o provider Microsoft no Studio (passo 4) |
| `ADMIN_NOTIFY_EMAIL`, `RESEND_API_KEY` | opcionais (aviso por e-mail de novo pedido de acesso; usa o Resend, serviço externo — pode não funcionar na rede interna) |

Não marque nenhuma como "Build Variable".

## 3. Conferir que subiu

- `https://sprint-obras.hydra.fgr.com.br/healthz` → `ok`
- `https://sprint-obras.hydra.fgr.com.br/api/config` → mostra `"url":"https://dados.hydra.fgr.com.br"` (e **nunca** a service_role)
- `https://sprint-obras.hydra.fgr.com.br/` → abre a tela de login.

## 4. Login com a conta Microsoft (Studio)

1. Studio → **Authentication → URL Configuration**:
   - Site URL: `https://sprint-obras.hydra.fgr.com.br`
   - Redirect URLs: `https://sprint-obras.hydra.fgr.com.br` e `https://sprint-obras.hydra.fgr.com.br/**`
2. Studio → **Authentication → Providers → Azure**: precisa estar ativado (client id/secret da aplicação Entra). O callback registrado no Entra é `https://dados.hydra.fgr.com.br/auth/v1/callback`.
3. Depois, no Coolify, acrescente `OAUTH_PROVIDER=azure` e faça **Redeploy**.

## 5. Levar os dados da Vercel para o Hydra

1. No site ATUAL (Vercel), entre normalmente e abra `/backup.html` → **Baixar backup** (gera um `.json`).
2. No site NOVO (Hydra), entre (Microsoft) e abra `/backup.html` → escolha o `.json` → **Restaurar**.
3. Saia e entre de novo no app: seus papéis antigos são religados pelo e-mail.

## 6. Rollback

A Vercel continua funcionando até você decidir desligá-la. Para voltar: é só usar o endereço antigo.

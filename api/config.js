// api/config.js — entrega pro front-end os dados PÚBLICOS necessários pra falar com o Supabase Auth
// direto do navegador: a URL do projeto e a "anon key" (chave pública, feita pra ir no navegador —
// diferente da service_role, que é segredo e nunca sai do servidor). Assim o index.html não precisa ter
// esses valores fixos no código — eles vêm das variáveis de ambiente (Vercel ou Coolify), igual o resto.
//
// HYDRA (2026-10-29): duas variáveis opcionais mudam a tela de login (na Vercel ficam vazias e nada muda):
//   OAUTH_PROVIDER=azure  — mostra o botão "Entrar com Microsoft" (login corporativo da FGR, via Supabase Auth)
//   OAUTH_ONLY=1          — esconde e-mail/senha: só o botão da Microsoft
export default async function handler(req, res) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'SUPABASE_URL/SUPABASE_ANON_KEY não configuradas' });
  }
  return res.status(200).json({
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    oauth: process.env.OAUTH_PROVIDER || null,
    oauthOnly: process.env.OAUTH_ONLY === '1',
    loginCompartilhado: process.env.AUTH_COMPARTILHADA === '1',
  });
}

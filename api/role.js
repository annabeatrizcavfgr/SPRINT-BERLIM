// api/role.js — GET devolve o papel (role) de quem está logado ("planejador" ou "visualizador"); com
// ?list=true (só planejador) devolve todo mundo cadastrado, pra tela "Usuários". POST (só planejador)
// muda o papel de alguém pelo e-mail.
import { supabaseAdmin, getAuthedUser, getUserRole } from '../lib/supabaseAuth.js';

export default async function handler(req, res) {
  try {
    const admin = supabaseAdmin();
    const user = await getAuthedUser(req, admin);
    if (!user) return res.status(401).json({ error: 'não autenticado' });
    const myRole = await getUserRole(admin, user.id, user.email);

    if (req.method === 'GET') {
      if (req.query.list === 'true') {
        if (myRole !== 'planejador') return res.status(403).json({ error: 'sem permissão' });
        const { data, error } = await admin.from('user_roles').select('email, role, user_id').order('email');
        if (error) throw error;
        return res.status(200).json({ users: data || [], myEmail: user.email });
      }
      return res.status(200).json({ role: myRole, email: user.email });
    }

    if (req.method === 'POST') {
      if (myRole !== 'planejador') return res.status(403).json({ error: 'sem permissão' });
      const { email, role } = req.body || {};
      if (!email || !['planejador', 'visualizador'].includes(role)) {
        return res.status(400).json({ error: 'dados inválidos' });
      }
      const { data: existing } = await admin.from('user_roles').select('user_id').eq('email', email).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'essa pessoa ainda não fez login nenhuma vez' });
      const { error } = await admin.from('user_roles').update({ role }).eq('email', email);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'método não permitido' });
  } catch (e) {
    console.error('api/role error', e);
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

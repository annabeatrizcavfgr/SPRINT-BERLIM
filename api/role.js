// api/role.js — GET devolve o papel (role) e status (pending/approved) de quem esta logado; com
// ?list=true (so planejador) devolve todo mundo cadastrado, pra tela "Usuarios". POST (so planejador)
// muda o papel e/ou status de alguem pelo e-mail (aprovar, promover, rebaixar).
import { supabaseAdmin, getAuthedUser, getUserRoleStatus } from '../lib/supabaseAuth.js';

export default async function handler(req, res) {
  try {
    const admin = supabaseAdmin();
    const user = await getAuthedUser(req, admin);
    if (!user) return res.status(401).json({ error: 'nao autenticado' });
    const mine = await getUserRoleStatus(admin, user.id, user.email);

    if (req.method === 'GET') {
      if (req.query.list === 'true') {
        if (mine.role !== 'planejador') return res.status(403).json({ error: 'sem permissao' });
        const { data, error } = await admin.from('user_roles').select('email, role, status, user_id').order('email');
        if (error) throw error;
        return res.status(200).json({ users: data || [], myEmail: user.email });
      }
      return res.status(200).json({ role: mine.role, status: mine.status, email: user.email });
    }

    if (req.method === 'POST') {
      if (mine.role !== 'planejador') return res.status(403).json({ error: 'sem permissao' });
      const { email, role, status } = req.body || {};
      if (!email) return res.status(400).json({ error: 'e-mail obrigatorio' });
      if (role && !['planejador', 'visualizador'].includes(role)) return res.status(400).json({ error: 'role invalido' });
      if (status && !['pending', 'approved'].includes(status)) return res.status(400).json({ error: 'status invalido' });
      const { data: existing } = await admin.from('user_roles').select('user_id').eq('email', email).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'essa pessoa ainda nao fez login nenhuma vez' });
      const patch = {};
      if (role) patch.role = role;
      if (status) patch.status = status;
      const { error } = await admin.from('user_roles').update(patch).eq('email', email);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'metodo nao permitido' });
  } catch (e) {
    console.error('api/role error', e);
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

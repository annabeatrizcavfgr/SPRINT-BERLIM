// api/role.js — tudo aqui e ESCOPADO POR OBRA (obra_id, 2026-09-17): GET devolve o papel/status de
// quem esta logado NAQUELA obra especifica (?obra_id=X obrigatorio); com ?list=true (so planejador
// daquela obra) devolve todo mundo cadastrado NELA, pra tela "Usuarios". POST (so planejador daquela
// obra) muda o papel e/ou status de alguem pelo e-mail, dentro daquela obra (aprovar, promover,
// rebaixar) - nao afeta o papel dessa pessoa em nenhuma outra obra que ela tambem participe. DELETE
// (so planejador daquela obra) exclui o acesso da pessoa A ESSA OBRA - so apaga o login dela por
// completo no Supabase Auth (auth.admin.deleteUser) se essa era a UNICA obra em que ela tinha
// registro; se ela ainda participa de outra(s), so a linha desta obra e removida e o login continua
// valido pras outras (senao, excluir alguem de uma obra a expulsaria de todas as outras tambem).
import { supabaseAdmin, getAuthedUser, getUserRoleStatus } from '../lib/supabaseAuth.js';

export default async function handler(req, res) {
  try {
    const admin = supabaseAdmin();
    const user = await getAuthedUser(req, admin);
    if (!user) return res.status(401).json({ error: 'nao autenticado' });

    if (req.method === 'GET') {
      const obraId = req.query.obra_id;
      if (!obraId) return res.status(400).json({ error: 'obra_id obrigatorio' });
      const mine = await getUserRoleStatus(admin, user.id, user.email, obraId);

      if (req.query.list === 'true') {
        if (mine.role !== 'planejador') return res.status(403).json({ error: 'sem permissao' });
        const { data, error } = await admin.from('user_roles').select('email, role, status, user_id').eq('obra_id', obraId).order('email');
        if (error) throw error;
        return res.status(200).json({ users: data || [], myEmail: user.email });
      }
      return res.status(200).json({ role: mine.role, status: mine.status, email: user.email });
    }

    if (req.method === 'POST') {
      const { obra_id: obraId, email, role, status } = req.body || {};
      if (!obraId) return res.status(400).json({ error: 'obra_id obrigatorio' });
      const mine = await getUserRoleStatus(admin, user.id, user.email, obraId);
      if (mine.role !== 'planejador') return res.status(403).json({ error: 'sem permissao' });
      if (!email) return res.status(400).json({ error: 'e-mail obrigatorio' });
      if (role && !['planejador', 'visualizador'].includes(role)) return res.status(400).json({ error: 'role invalido' });
      if (status && !['pending', 'approved'].includes(status)) return res.status(400).json({ error: 'status invalido' });
      const { data: existing } = await admin.from('user_roles').select('user_id').eq('email', email).eq('obra_id', obraId).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'essa pessoa ainda nao pediu acesso a essa obra' });
      const patch = {};
      if (role) patch.role = role;
      if (status) patch.status = status;
      const { error } = await admin.from('user_roles').update(patch).eq('email', email).eq('obra_id', obraId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { obra_id: obraId, email } = req.body || {};
      if (!obraId) return res.status(400).json({ error: 'obra_id obrigatorio' });
      const mine = await getUserRoleStatus(admin, user.id, user.email, obraId);
      if (mine.role !== 'planejador') return res.status(403).json({ error: 'sem permissao' });
      if (!email) return res.status(400).json({ error: 'e-mail obrigatorio' });
      if (email === user.email) return res.status(400).json({ error: 'voce nao pode excluir sua propria conta' });
      const { data: existing } = await admin.from('user_roles').select('user_id').eq('email', email).eq('obra_id', obraId).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'essa pessoa nao esta cadastrada nessa obra' });
      const { count: outrasObras } = await admin.from('user_roles').select('obra_id', { count: 'exact', head: true }).eq('user_id', existing.user_id);
      if (outrasObras <= 1) {
        // ultima (ou unica) obra dela - bloqueia o login dela por completo, nao so o acesso a essa obra
        const { error: authError } = await admin.auth.admin.deleteUser(existing.user_id);
        if (authError) throw authError;
      }
      const { error: rowError } = await admin.from('user_roles').delete().eq('email', email).eq('obra_id', obraId);
      if (rowError) throw rowError;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'metodo nao permitido' });
  } catch (e) {
    console.error('api/role error', e);
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

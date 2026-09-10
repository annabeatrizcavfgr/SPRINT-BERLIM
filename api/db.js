// api/db.js — Vercel Serverless Function que implementa "documentos" e "colecoes" (parecido com o
// Firestore) por cima de UMA tabela so no Supabase (Postgres). O front-end (index.html) fala com essa
// API por fetch, nunca com o Supabase direto (a chave secreta de servidor fica so aqui, nunca no
// navegador).
//
// Tabela usada (criar uma vez, via SQL Editor do Supabase):
//   create table docs (
//     path text primary key,
//     value jsonb not null
//   );
//
// "Colecao" = todo documento cujo caminho e "<caminho-colecao>/<id>", sem nenhuma barra a mais depois
// disso. Resolvido com um LIKE direto no banco + um filtro em JS pra manter so os filhos diretos.
//
// LOGIN/PERMISSAO: toda chamada (menos o healthcheck) exige um usuario logado (Supabase Auth) E
// aprovado (status='approved', ver lib/supabaseAuth.js e a tela "Usuarios") — quem esta "pending"
// (acabou de se cadastrar, esperando ela aprovar) nao le nem grava nada aqui. Alem disso, GRAVAR (POST:
// set/delete/add) exige que o papel seja "planejador" — "visualizador" so consegue ler (GET).
import { supabaseAdmin, getAuthedUser, getUserRoleStatus } from '../lib/supabaseAuth.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET' && req.query.path === '__healthcheck__') {
      return res.status(200).json({ ok: true });
    }

    let supabase;
    try {
      supabase = supabaseAdmin();
    } catch (e) {
      return res.status(500).json({
        error: 'Falha ao criar cliente Supabase: ' + String((e && e.message) || e),
        hasUrl: !!process.env.SUPABASE_URL,
        hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      });
    }

    const user = await getAuthedUser(req, supabase);
    if (!user) return res.status(401).json({ error: 'nao autenticado' });
    const mine = await getUserRoleStatus(supabase, user.id, user.email);
    if (mine.status !== 'approved') return res.status(403).json({ error: 'conta aguardando aprovacao', status: mine.status });

    if (req.method === 'GET') {
      const { path, collection, orderBy, dir, limit } = req.query;
      if (!path) return res.status(400).json({ error: 'path obrigatorio' });

      if (collection === 'true') {
        const { data: rows, error } = await supabase
          .from('docs')
          .select('path, value')
          .like('path', path + '/%');
        if (error) throw error;

        let docs = (rows || [])
          .filter((r) => !r.path.slice(path.length + 1).includes('/'))
          .map((r) => ({ id: r.path.slice(path.length + 1), data: r.value }));

        if (orderBy) {
          docs.sort((a, b) => {
            const av = a.data[orderBy], bv = b.data[orderBy];
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return dir === 'desc' ? -cmp : cmp;
          });
        }
        if (limit) docs = docs.slice(0, parseInt(limit, 10));
        return res.status(200).json({ docs });
      }

      const { data, error } = await supabase.from('docs').select('value').eq('path', path).maybeSingle();
      if (error) throw error;
      return res.status(200).json({ exists: data != null, data: data ? data.value : null });
    }

    if (req.method === 'POST') {
      if (mine.role !== 'planejador') return res.status(403).json({ error: 'so planejador pode editar' });
      const { path, action, data } = req.body || {};
      if (!path || !action) return res.status(400).json({ error: 'path e action obrigatorios' });

      if (action === 'set') {
        const { error } = await supabase.from('docs').upsert({ path, value: data });
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      if (action === 'delete') {
        const { error } = await supabase.from('docs').delete().eq('path', path);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      if (action === 'add') {
        const id = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const { error } = await supabase.from('docs').insert({ path: path + '/' + id, value: data });
        if (error) throw error;
        return res.status(200).json({ id });
      }

      return res.status(400).json({ error: 'action desconhecida: ' + action });
    }

    return res.status(405).json({ error: 'metodo nao permitido' });
  } catch (e) {
    console.error('api/db error', e);
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

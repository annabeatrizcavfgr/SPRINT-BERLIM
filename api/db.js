// api/db.js — Vercel Serverless Function que implementa "documentos" e "coleções" (parecido com o
// Firestore) por cima do Vercel KV (Redis). O front-end (index.html) fala com essa API por fetch, em
// vez de chamar o Vercel KV direto (as credenciais do KV são segredo de servidor, nunca do navegador).
//
// Esquema de chaves no KV:
//   doc::<caminho>         -> o valor (JSON) de UM documento (ex: doc::meta/lookups)
//   idx::<caminho-coleção> -> lista de {id, ts} dos documentos daquela coleção (ex: idx::causas)
//
// Sem autenticação nenhuma de propósito — o app inteiro é de acesso livre por link (decidido no
// projeto), então essa API também não pede senha. Se um dia precisar restringir, dá pra checar um
// cabeçalho/token aqui antes de tocar no KV.
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { path, collection, orderBy, dir, limit } = req.query;
      if (!path) return res.status(400).json({ error: 'path obrigatório' });

      if (path === '__healthcheck__') return res.status(200).json({ ok: true });

      if (collection === 'true') {
        const idxKey = 'idx::' + path;
        const idx = (await kv.get(idxKey)) || [];
        let docs = await Promise.all(
          idx.map(async (entry) => {
            const id = typeof entry === 'string' ? entry : entry.id;
            const data = await kv.get('doc::' + path + '/' + id);
            return { id, data };
          })
        );
        docs = docs.filter((d) => d.data != null);
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

      const data = await kv.get('doc::' + path);
      return res.status(200).json({ exists: data != null, data: data ?? null });
    }

    if (req.method === 'POST') {
      const { path, action, data } = req.body || {};
      if (!path || !action) return res.status(400).json({ error: 'path e action obrigatórios' });

      if (action === 'set') {
        await kv.set('doc::' + path, data);
        return res.status(200).json({ ok: true });
      }

      if (action === 'delete') {
        await kv.del('doc::' + path);
        // se esse caminho é um item dentro de uma coleção (ex: "causas/abc123"), tira ele do índice
        // da coleção também — senão ele "some" no get() mas continua listado no orderBy/limit.
        const parts = path.split('/');
        if (parts.length >= 2) {
          const id = parts.pop();
          const collPath = parts.join('/');
          const idxKey = 'idx::' + collPath;
          const idx = await kv.get(idxKey);
          if (idx) {
            const filtered = idx.filter((e) => (typeof e === 'string' ? e : e.id) !== id);
            await kv.set(idxKey, filtered);
          }
        }
        return res.status(200).json({ ok: true });
      }

      if (action === 'add') {
        const id = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        await kv.set('doc::' + path + '/' + id, data);
        const idxKey = 'idx::' + path;
        const idx = (await kv.get(idxKey)) || [];
        idx.push({ id, ts: data && data.ts });
        await kv.set(idxKey, idx);
        return res.status(200).json({ id });
      }

      return res.status(400).json({ error: 'action desconhecida: ' + action });
    }

    return res.status(405).json({ error: 'método não permitido' });
  } catch (e) {
    console.error('api/db error', e);
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

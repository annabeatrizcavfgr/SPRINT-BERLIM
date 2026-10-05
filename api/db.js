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
// MULTI-OBRA (2026-09-17): todo path de verdade (menos o healthcheck) precisa comecar com
// "obras/<obraId>/..." — e o "<obraId>" e extraido do proprio path e usado pra checar o papel/status
// dessa pessoa NAQUELA obra especifica, nunca um papel global. Antes disso o servidor confiava
// cegamente em qualquer "path" que o navegador mandasse; agora um path fora do formato "obras/.../"
// e recusado, e mesmo um path bem-formado só é atendido se a pessoa realmente tiver acesso aquela
// obra — isso e o que impede o navegador de uma obra pedir (por engano ou de proposito) os dados de
// outra so trocando o "path" na mao.
//
// LOGIN/PERMISSAO: toda chamada (menos o healthcheck) exige um usuario logado (Supabase Auth) E
// aprovado NAQUELA OBRA (status='approved', ver lib/supabaseAuth.js e a tela "Usuarios") — quem esta
// "pending" (acabou de pedir acesso aquela obra, esperando um planejador dela aprovar) nao le nem
// grava nada aqui. Alem disso, GRAVAR (POST: set/delete/add) exige que o papel NAQUELA OBRA seja
// "planejador" — os outros papeis so gravam nas restricoes (ver permissaoRestricao abaixo).
import { supabaseAdmin, getAuthedUser, getUserRoleStatus } from '../lib/supabaseAuth.js';

// "obras/<id>/resto/do/caminho" -> "<id>" (ou null se o path nao seguir esse formato).
function obraIdFromPath(path){
  const m = /^obras\/([^/]+)\//.exec(path || '');
  return m ? m[1] : null;
}

// PAPEIS (2026-10-05): "planejador" grava em tudo. "coordenador" e "visualizador" so gravam na colecao
// de restricoes da matriz G.U.T (obras/<id>/restricoes e os documentos dentro dela):
//   - coordenador: autonomia total ali (criar, editar qualquer campo, excluir).
//   - visualizador: pode CRIAR (o servidor forca nivel "check-in", independente do que o navegador
//     mandar) e pode alterar SO a observacao ("solucao") de uma restricao existente — nesse caso o
//     servidor ignora todo o resto do que veio e regrava o documento existente so com a observacao
//     nova. Nao exclui nada.
// Qualquer outro caminho continua exclusivo do planejador. A mesma regra existe no navegador
// (checkWritable) so pra avisar mais rapido; a que vale de verdade e esta.
async function permissaoRestricao(supabase, role, obraId, path, action, data) {
  const colecao = 'obras/' + obraId + '/restricoes';
  const naColecao = path === colecao;
  const docDaColecao = path.startsWith(colecao + '/') && !path.slice(colecao.length + 1).includes('/');
  if (!naColecao && !docDaColecao) return { ok: false, erro: 'so planejador pode editar fora da matriz GUT' };
  if (role === 'coordenador') return { ok: true, data };
  if (role !== 'visualizador') return { ok: false, erro: 'sem permissao' };
  if (action === 'add' && naColecao) return { ok: true, data: { ...(data || {}), nivel: 'check-in' } };
  if (action === 'set' && docDaColecao) {
    const { data: atual, error } = await supabase.from('docs').select('value').eq('path', path).maybeSingle();
    if (error) throw error;
    if (!atual) return { ok: false, erro: 'restricao nao encontrada' };
    const obs = data && typeof data.solucao === 'string' ? data.solucao.slice(0, 5000) : (atual.value.solucao || '');
    return { ok: true, data: { ...atual.value, solucao: obs } };
  }
  return { ok: false, erro: 'visualizador so pode criar restricoes (nivel check-in) e editar a observacao' };
}

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

    const pathParaObra = req.method === 'POST' ? (req.body || {}).path : req.query.path;
    const obraId = obraIdFromPath(pathParaObra);
    if (!obraId) return res.status(400).json({ error: 'path precisa comecar com "obras/<id>/"' });
    const mine = await getUserRoleStatus(supabase, user.id, user.email, obraId);
    if (mine.status !== 'approved') return res.status(403).json({ error: 'conta aguardando aprovacao nessa obra', status: mine.status });

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
      const { path, action, data: dataRecebido } = req.body || {};
      if (!path || !action) return res.status(400).json({ error: 'path e action obrigatorios' });
      let data = dataRecebido;
      if (mine.role !== 'planejador') {
        const decisao = await permissaoRestricao(supabase, mine.role, obraId, path, action, dataRecebido);
        if (!decisao.ok) return res.status(403).json({ error: decisao.erro });
        data = decisao.data;
      }

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

// api/backup.js — backup completo dos dados do app e restauração (usado na MIGRAÇÃO Supabase cloud -> Hydra, 2026-10-29).
//
//   GET  /api/backup?tabela=obras|user_roles            -> { linhas: [...] }            (a tabela inteira)
//   GET  /api/backup?tabela=docs[&depois=<caminho>]      -> { linhas: [...], proximo }   (página de ~3MB, em ordem de caminho;
//                                                           "proximo" = valor pra passar em ?depois= na próxima chamada, ou null)
//   POST /api/backup {tabela, linhas:[...]}              -> { ok:true, gravadas }        (upsert — pode repetir sem duplicar)
//
// Quem pode: planejador de PELO MENOS UMA obra (backup = ver tudo, restaurar = gravar tudo, que um planejador já pode).
// Exceção só pra restaurar: e-mails de BOOTSTRAP_ADMIN_EMAILS, pra montar o banco VAZIO do Hydra (onde ainda não existe
// nenhum planejador). O navegador do planejador faz as chamadas em lotes (botões "Exportar backup" / "Restaurar
// backup" em Mais ações) — o servidor nunca precisa segurar o banco inteiro na memória.
import { supabaseAdmin, getAuthedUser, isPlanejadorEmAlgumaObra } from '../lib/supabaseAuth.js';

const LIMITE_PAGINA_BYTES = 3 * 1024 * 1024;
const TABELAS = {
  obras:      { colunas: ['id', 'nome', 'created_at', 'created_by'], conflito: 'id' },
  user_roles: { colunas: ['user_id', 'obra_id', 'email', 'role', 'status', 'created_at'], conflito: 'user_id,obra_id' },
  docs:       { colunas: ['path', 'value'], conflito: 'path' },
};

function ehAdminListado(email) {
  const lista = (process.env.BOOTSTRAP_ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && lista.includes(String(email).toLowerCase());
}

export default async function handler(req, res) {
  try {
    const admin = supabaseAdmin();
    const user = await getAuthedUser(req, admin);
    if (!user) return res.status(401).json({ error: 'nao autenticado' });
    const planejador = await isPlanejadorEmAlgumaObra(admin, user.id);

    if (req.method === 'GET') {
      if (!planejador) return res.status(403).json({ error: 'so planejador faz backup' });
      const tabela = req.query.tabela;
      if (!TABELAS[tabela]) return res.status(400).json({ error: 'tabela invalida' });

      if (tabela !== 'docs') {
        const { data, error } = await admin.from(tabela).select(TABELAS[tabela].colunas.join(','));
        if (error) throw error;
        return res.status(200).json({ linhas: data || [], proximo: null });
      }

      // docs: página por caminho (keyset) — cada documento pode ter ~170KB (blocos das planilhas semanais)
      let consulta = admin.from('docs').select('path, value').order('path', { ascending: true }).limit(200);
      if (req.query.depois) consulta = consulta.gt('path', String(req.query.depois));
      const { data, error } = await consulta;
      if (error) throw error;
      const linhas = [];
      let bytes = 0;
      for (const l of data || []) {
        const tam = JSON.stringify(l).length;
        if (linhas.length && bytes + tam > LIMITE_PAGINA_BYTES) break;
        linhas.push(l);
        bytes += tam;
      }
      // há mais se cortamos a página, ou se ela veio cheia (200)
      const cortou = linhas.length < (data || []).length;
      const proximo = linhas.length && (cortou || (data || []).length === 200) ? linhas[linhas.length - 1].path : null;
      return res.status(200).json({ linhas, proximo });
    }

    if (req.method === 'POST') {
      if (!planejador && !ehAdminListado(user.email)) return res.status(403).json({ error: 'so planejador restaura backup' });
      const { tabela, linhas } = req.body || {};
      const def = TABELAS[tabela];
      if (!def) return res.status(400).json({ error: 'tabela invalida' });
      if (!Array.isArray(linhas) || !linhas.length) return res.status(400).json({ error: 'linhas precisa ser uma lista com pelo menos 1 item' });
      // só as colunas conhecidas (o resto do que vier é ignorado)
      const limpas = linhas.map((l) => Object.fromEntries(def.colunas.filter((c) => l && l[c] !== undefined).map((c) => [c, l[c]])));
      const { error } = await admin.from(tabela).upsert(limpas, { onConflict: def.conflito });
      if (error) throw error;
      return res.status(200).json({ ok: true, gravadas: limpas.length });
    }

    return res.status(405).json({ error: 'metodo nao permitido' });
  } catch (e) {
    console.error('api/backup error', e);
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

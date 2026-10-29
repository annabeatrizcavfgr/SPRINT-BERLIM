// server.js — servidor Node pra rodar o app no Coolify/Hydra (na Vercel este arquivo NÃO é usado: lá cada arquivo
// de api/ é uma função própria e o index.html é servido como arquivo estático).
//
// Faz exatamente o que a Vercel fazia:
//   - serve o index.html e as imagens/mapa da raiz do projeto (SÓ essa lista — nunca api/, lib/ ou package.json);
//   - monta os mesmos handlers de api/*.js nas mesmas rotas (/api/db, /api/role, /api/obras, /api/config, /api/backup).
// Os handlers usam só req.query / req.body / res.status().json() — o Express oferece isso do mesmo jeito.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dbHandler from './api/db.js';
import roleHandler from './api/role.js';
import obrasHandler from './api/obras.js';
import configHandler from './api/config.js';
import backupHandler from './api/backup.js';

const raiz = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // atrás do proxy do Coolify

// corpo JSON: as planilhas semanais vão em blocos de ~170KB e a importação da GUT / o backup vão em lotes — 8MB sobra
app.use(express.json({ limit: '8mb' }));

// rota de saúde pro Coolify (não mexe em banco nenhum)
app.get('/healthz', (req, res) => res.status(200).send('ok'));

// o Express entrega req.query/req.body prontos; só embrulha o handler pra um erro não derrubar o processo
const rota = (handler) => async (req, res) => {
  try { await handler(req, res); }
  catch (e) {
    console.error('erro na rota', req.path, e);
    if (!res.headersSent) res.status(500).json({ error: String((e && e.message) || e) });
  }
};
app.all('/api/db', rota(dbHandler));
app.all('/api/role', rota(roleHandler));
app.all('/api/obras', rota(obrasHandler));
app.all('/api/config', rota(configHandler));
app.all('/api/backup', rota(backupHandler));

// Bibliotecas do navegador servidas pelo PRÓPRIO app (a rede FGR pode bloquear CDN — o guia do Hydra avisa). Vêm do
// node_modules (instalado no build do Coolify), nas mesmas versões que o index.html usava no CDN. Se algum arquivo
// faltar, devolve 404 e o index.html cai no CDN sozinho (ver o <script> de fallback lá).
const vendor = {
  'supabase.js': ['@supabase/supabase-js', 'dist', 'umd', 'supabase.js'],
  'xlsx.full.min.js': ['xlsx', 'dist', 'xlsx.full.min.js'],
  'exceljs.min.js': ['exceljs', 'dist', 'exceljs.min.js'],
};
for (const [nome, partes] of Object.entries(vendor)) {
  app.get('/vendor/' + nome, (req, res) => {
    res.type('application/javascript');
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.join(raiz, 'node_modules', ...partes), (err) => { if (err && !res.headersSent) res.status(404).end(); });
  });
}

// arquivos estáticos: lista fechada (a raiz do projeto tem código do servidor que NÃO pode ser baixado)
const estaticos = ['index.html', 'backup.html', 'fgr-logo.png', 'login-bg.jpg', 'frankfurt-map.svg'];
const tipos = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.html': 'text/html; charset=utf-8' };
for (const arq of estaticos) {
  const cam = path.join(raiz, arq);
  const enviar = (req, res) => {
    res.type(tipos[path.extname(arq)] || 'application/octet-stream');
    // a página muda a cada deploy: o navegador sempre revalida; imagens podem ficar em cache
    res.set('Cache-Control', arq === 'index.html' ? 'no-cache' : 'public, max-age=86400');
    res.sendFile(cam);
  };
  app.get('/' + arq, enviar);
  if (arq === 'index.html') app.get('/', enviar);
}

app.use((req, res) => res.status(404).json({ error: 'nao encontrado' }));

const porta = Number(process.env.PORT) || 3000;
app.listen(porta, '0.0.0.0', () => console.log('Acompanhamento de metas no ar na porta ' + porta));

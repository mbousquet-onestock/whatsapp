// Point d'entrée de l'app.
// - En local (npm start) : démarre un serveur HTTP.
// - Sur Vercel : vercel.json impose le mode sans framework ; public/ est servi en statique
//   et api/*.js sont les fonctions. Ce fichier n'y est pas utilisé.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { json, sendHandler, statusHandler, config } from './lib/handlers.js';

const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

export function createHandler(env = process.env, fetchImpl = fetch) {
  const routes = { '/api/send': sendHandler(env, fetchImpl), '/api/status': statusHandler(env) };

  return async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (routes[pathname]) return await routes[pathname](req, res);
      if (req.method !== 'GET') return json(res, 405, { error: 'Méthode non autorisée' });
      const file = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (file.includes('..') || !MIME[extname(file)]) return json(res, 404, { error: 'Introuvable' });
      const content = await readFile(join(PUBLIC_DIR, file)).catch(() => null);
      if (!content) return json(res, 404, { error: 'Introuvable' });
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] });
      res.end(content);
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  };
}

export function createApp(env = process.env, fetchImpl = fetch) {
  return http.createServer(createHandler(env, fetchImpl));
}

export default createHandler();

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => {
    console.log(`App WhatsApp prête sur http://localhost:${port}`);
    if (config().dryRun) console.log('Mode simulation (DRY_RUN) : aucun message ne sera réellement envoyé.');
  });
}

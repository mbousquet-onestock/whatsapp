import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, normalizePhone } from './lib/whatsapp.js';

const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const MAX_RECIPIENTS = 50;

export function createApp(env = process.env, fetchImpl = fetch) {
  const token = env.WHATSAPP_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const dryRun = env.DRY_RUN === '1' || !token || !phoneNumberId;
  const client = createClient({ token, phoneNumberId, apiVersion: env.WHATSAPP_API_VERSION, dryRun, fetchImpl });
  const history = [];

  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  async function readBody(req) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 100_000) throw new Error('Requête trop volumineuse');
    }
    return JSON.parse(raw || '{}');
  }

  async function handleSend(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return json(res, 400, { error: 'JSON invalide' });
    }
    const list = Array.isArray(body.to) ? body.to : String(body.to || '').split(/[,;\n]/);
    const raw = list.map((s) => String(s).trim()).filter(Boolean);
    if (!raw.length) return json(res, 400, { error: 'Aucun destinataire' });
    if (raw.length > MAX_RECIPIENTS) return json(res, 400, { error: `Maximum ${MAX_RECIPIENTS} destinataires` });

    const results = [];
    for (const input of raw) {
      const to = normalizePhone(input);
      let r;
      if (!to) r = { ok: false, error: 'Numéro invalide' };
      else {
        try {
          r = await client.send(to, body);
        } catch (e) {
          r = { ok: false, error: e.message };
        }
      }
      const entry = {
        to: to || input,
        type: body.type === 'template' ? 'template' : 'text',
        preview: body.type === 'template' ? `[template] ${body.template}` : String(body.text || '').slice(0, 120),
        ok: r.ok,
        id: r.id,
        error: r.error,
        dryRun: !!r.dryRun,
        at: new Date().toISOString(),
      };
      history.unshift(entry);
      results.push(entry);
    }
    history.length = Math.min(history.length, 200);
    json(res, 200, { results });
  }

  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'POST' && pathname === '/api/send') return await handleSend(req, res);
      if (req.method === 'GET' && pathname === '/api/history') return json(res, 200, { history });
      if (req.method === 'GET' && pathname === '/api/status') return json(res, 200, { dryRun });
      if (req.method === 'GET') {
        const file = pathname === '/' ? 'index.html' : pathname.slice(1);
        if (file.includes('..') || !MIME[extname(file)]) return json(res, 404, { error: 'Introuvable' });
        const content = await readFile(join(PUBLIC_DIR, file)).catch(() => null);
        if (!content) return json(res, 404, { error: 'Introuvable' });
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] });
        return res.end(content);
      }
      json(res, 405, { error: 'Méthode non autorisée' });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const app = createApp();
  app.listen(port, () => {
    const dry = process.env.DRY_RUN === '1' || !process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID;
    console.log(`App WhatsApp prête sur http://localhost:${port}`);
    if (dry) console.log('Mode simulation (DRY_RUN) : aucun message ne sera réellement envoyé.');
  });
}

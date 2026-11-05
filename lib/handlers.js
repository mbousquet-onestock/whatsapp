// Handlers HTTP partagés entre server.js et les fonctions Vercel (api/*.js).
import { timingSafeEqual } from 'node:crypto';
import { createClient, normalizePhone } from './whatsapp.js';

const MAX_RECIPIENTS = 50;

export function config(env = process.env) {
  const token = env.WHATSAPP_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  return {
    token,
    phoneNumberId,
    apiVersion: env.WHATSAPP_API_VERSION || 'v21.0',
    dryRun: env.DRY_RUN === '1' || !token || !phoneNumberId,
    password: env.APP_PASSWORD || '',
  };
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  // Sur Vercel, le corps est déjà analysé dans req.body.
  if (req.body !== undefined) {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error('Requête trop volumineuse');
  }
  return JSON.parse(raw || '{}');
}

function checkPassword(req, expected) {
  if (!expected) return true;
  const given = Buffer.from(String(req.headers['x-app-password'] || ''));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

export function statusHandler(env = process.env) {
  return (req, res) => {
    const c = config(env);
    json(res, 200, { dryRun: c.dryRun, passwordRequired: !!c.password });
  };
}

export function sendHandler(env = process.env, fetchImpl = fetch) {
  return async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée' });
    const c = config(env);
    if (!checkPassword(req, c.password)) return json(res, 401, { error: 'Mot de passe incorrect' });

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

    const client = createClient({ ...c, fetchImpl });
    const isTemplate = body.type === 'template';
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
      results.push({
        to: to || input,
        type: isTemplate ? 'template' : 'text',
        preview: isTemplate ? `[template] ${body.template}` : String(body.text || '').slice(0, 120),
        ok: r.ok,
        id: r.id,
        error: r.error,
        dryRun: !!r.dryRun,
        at: new Date().toISOString(),
      });
    }
    json(res, 200, { results });
  };
}

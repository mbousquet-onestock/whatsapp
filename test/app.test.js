import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, buildPayload } from '../lib/whatsapp.js';
import { createApp } from '../server.js';
import { sendHandler } from '../lib/handlers.js';

test('normalizePhone', () => {
  assert.equal(normalizePhone('+33 6 12 34 56 78'), '33612345678');
  assert.equal(normalizePhone('0033612345678'), '33612345678');
  assert.equal(normalizePhone('+1 (555) 123-4567'), '15551234567');
  assert.equal(normalizePhone('abc'), null);
  assert.equal(normalizePhone('123'), null);
});

test('buildPayload text et template', () => {
  assert.deepEqual(buildPayload('33600000000', { type: 'text', text: ' Salut ' }).text, { preview_url: true, body: 'Salut' });
  assert.throws(() => buildPayload('33600000000', { type: 'text', text: '  ' }));
  const t = buildPayload('33600000000', { type: 'template', template: 'promo', language: 'fr', params: ['Marie', '20%'] });
  assert.equal(t.template.name, 'promo');
  assert.deepEqual(t.template.components[0].parameters.map((p) => p.text), ['Marie', '20%']);
});

async function withServer(env, fetchImpl, fn) {
  const app = createApp(env, fetchImpl);
  await new Promise((r) => app.listen(0, r));
  const base = `http://127.0.0.1:${app.address().port}`;
  try { await fn(base); } finally { app.close(); }
}

test('POST /api/send appelle Graph API avec le bon payload', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 });
  };
  await withServer({ WHATSAPP_TOKEN: 'tok', WHATSAPP_PHONE_NUMBER_ID: '123' }, fakeFetch, async (base) => {
    const r = await fetch(`${base}/api/send`, {
      method: 'POST',
      body: JSON.stringify({ to: '+33611111111, pas-un-numero', type: 'text', text: 'Bonjour' }),
    }).then((r) => r.json());
    assert.equal(r.results.length, 2);
    assert.equal(r.results[0].ok, true);
    assert.equal(r.results[0].id, 'wamid.X');
    assert.equal(r.results[1].ok, false);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/123\/messages$/);
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
    assert.equal(JSON.parse(calls[0].opts.body).to, '33611111111');
  });
});

test('erreur Meta remontée et mode simulation sans token', async () => {
  const failFetch = async () => new Response(JSON.stringify({ error: { message: 'Invalid token', code: 190 } }), { status: 401 });
  await withServer({ WHATSAPP_TOKEN: 'bad', WHATSAPP_PHONE_NUMBER_ID: '1' }, failFetch, async (base) => {
    const r = await fetch(`${base}/api/send`, { method: 'POST', body: JSON.stringify({ to: '+33611111111', text: 'x' }) }).then((r) => r.json());
    assert.equal(r.results[0].ok, false);
    assert.equal(r.results[0].error, 'Invalid token');
  });
  await withServer({}, () => { throw new Error('ne doit pas être appelé'); }, async (base) => {
    const s = await fetch(`${base}/api/status`).then((r) => r.json());
    assert.equal(s.dryRun, true);
    const r = await fetch(`${base}/api/send`, { method: 'POST', body: JSON.stringify({ to: '+33611111111', text: 'x' }) }).then((r) => r.json());
    assert.equal(r.results[0].ok, true);
    assert.equal(r.results[0].dryRun, true);
  });
});

test('mot de passe APP_PASSWORD exigé', async () => {
  await withServer({ APP_PASSWORD: 'secret' }, fetch, async (base) => {
    const s = await fetch(`${base}/api/status`).then((r) => r.json());
    assert.equal(s.passwordRequired, true);
    const body = JSON.stringify({ to: '+33611111111', text: 'x' });
    let r = await fetch(`${base}/api/send`, { method: 'POST', body });
    assert.equal(r.status, 401);
    r = await fetch(`${base}/api/send`, { method: 'POST', body, headers: { 'X-App-Password': 'secret' } });
    assert.equal(r.status, 200);
  });
});

test('handler compatible Vercel (req.body déjà analysé)', async () => {
  const handler = sendHandler({}, fetch);
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(b) { this.body = JSON.parse(b); },
  };
  await handler({ method: 'POST', headers: {}, body: { to: ['+33611111111'], text: 'x' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.results[0].ok, true);
});

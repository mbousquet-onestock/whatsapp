// Client minimal pour l'API WhatsApp Cloud (Meta Graph API).

/**
 * Normalise un numéro de téléphone au format international attendu par WhatsApp
 * (chiffres uniquement, indicatif pays inclus, sans "+" ni "00").
 * Retourne null si le numéro est invalide.
 */
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/[\s.\-()]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  if (!/^\d{8,15}$/.test(s)) return null;
  return s;
}

/**
 * Construit le corps JSON d'un message à envoyer.
 * msg = { type: 'text', text } | { type: 'template', template, language, params }
 */
export function buildPayload(to, msg) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  if (msg.type === 'template') {
    if (!msg.template) throw new Error('Nom du template manquant');
    const template = { name: msg.template, language: { code: msg.language || 'fr' } };
    const params = (msg.params || []).filter((p) => p !== '');
    if (params.length) {
      template.components = [
        { type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) },
      ];
    }
    return { ...base, type: 'template', template };
  }
  const text = (msg.text || '').trim();
  if (!text) throw new Error('Le message est vide');
  if (text.length > 4096) throw new Error('Le message dépasse 4096 caractères');
  return { ...base, type: 'text', text: { preview_url: true, body: text } };
}

export function createClient({ token, phoneNumberId, apiVersion = 'v21.0', dryRun = false, fetchImpl = fetch }) {
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  async function send(to, msg) {
    const payload = buildPayload(to, msg);
    if (dryRun) {
      return { ok: true, dryRun: true, id: `dry-run-${Date.now()}-${to}`, payload };
    }
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = data.error || {};
      return {
        ok: false,
        status: res.status,
        error: err.error_user_msg || err.message || `Erreur HTTP ${res.status}`,
        code: err.code,
      };
    }
    return { ok: true, id: data.messages?.[0]?.id };
  }

  return { send };
}

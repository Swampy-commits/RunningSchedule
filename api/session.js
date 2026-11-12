import crypto from 'node:crypto';
import { bearer, loggingReady, pinMatches, signToken } from '../lib/auth.js';
import { clientIp, readJson, sameOrigin, send } from '../lib/http.js';
import { decideSignIn, retryMessage, wrongMessage } from '../lib/store.js';

export default async function handler(req, res) {
  if (!sameOrigin(req)) return send(res, 403, { error: 'Blocked.' });

  if (req.method === 'GET') {
    const session = bearer(req);
    return send(res, 200, { logging: loggingReady(), role: session?.role || null });
  }

  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  if (!loggingReady()) return send(res, 503, { error: 'Logging is not set up yet.' });

  let body;
  try { body = readJson(req); } catch { return send(res, 400, { error: 'Bad request.' }); }

  const role = body.role === 'niall' ? 'niall' : body.role === 'eabha' ? 'eabha' : '';
  if (!role) return send(res, 400, { error: 'Choose Eabha or Niall.' });

  const ip = clientIp(req);
  const headers = req.headers || {};
  console.log(JSON.stringify({
    signInIp: crypto.createHash('sha256').update(ip).digest('hex').slice(0, 8),
    real: String(headers['x-real-ip'] || '').length,
    vercelFwd: String(headers['x-vercel-forwarded-for'] || '').length,
    fwd: String(headers['x-forwarded-for'] || '').length,
  }));
  let decision;
  try {
    decision = await decideSignIn(ip, () => pinMatches(role, body.pin));
  } catch {
    return send(res, 503, { error: 'Sign-in is unavailable right now. Try again shortly.' });
  }
  if (decision.status === 429) {
    return send(res, 429, { error: retryMessage(decision.retrySeconds), retrySeconds: decision.retrySeconds });
  }
  if (decision.status === 401) {
    return send(res, 401, { error: wrongMessage(decision.remaining), remaining: decision.remaining });
  }
  return send(res, 200, { token: signToken(role), role });
}

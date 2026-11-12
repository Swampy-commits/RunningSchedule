import { bearer, loggingReady, pinMatches, signToken } from '../lib/auth.js';
import { clientIp, readJson, sameOrigin, send } from '../lib/http.js';
import { lockedOut, recordFailure } from '../lib/store.js';

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
  try {
    if (await lockedOut(ip)) return send(res, 429, { error: 'Too many tries. Wait 15 minutes.' });
  } catch {
    return send(res, 503, { error: 'Logging is not set up yet.' });
  }

  if (!pinMatches(role, body.pin)) {
    try { await recordFailure(ip); } catch { /* still reject the passcode */ }
    return send(res, 401, { error: 'Wrong passcode.' });
  }
  return send(res, 200, { token: signToken(role), role });
}

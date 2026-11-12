import { bearer, loggingReady } from '../lib/auth.js';
import { readJson, sameOrigin, send } from '../lib/http.js';
import { validateEntry } from '../lib/entry.js';
import { allLogs, deleteLog, saveLog } from '../lib/store.js';

export default async function handler(req, res) {
  if (!sameOrigin(req)) return send(res, 403, { error: 'Blocked.' });
  if (!loggingReady()) return send(res, 503, { error: 'Logging is not set up yet.' });
  const session = bearer(req);
  if (!session) return send(res, 401, { error: 'Sign in again.' });

  try {
    if (req.method === 'GET') {
      return send(res, 200, { logs: await allLogs() });
    }

    if (req.method === 'DELETE') {
      const fromUrl = new URL(req.url || '', 'http://localhost').searchParams.get('date');
      const date = String(req.query?.date || fromUrl || '');
      const check = validateEntry({ status: 'done' }, date);
      if (check.error) return send(res, 400, { error: check.error });
      await deleteLog(date);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'PUT') {
      let body;
      try { body = readJson(req); } catch { return send(res, 400, { error: 'Bad request.' }); }
      const date = String(body.date || '');
      const check = validateEntry(body, date);
      if (check.error) return send(res, 400, { error: check.error });
      const entry = {
        ...check.entry,
        updatedAt: new Date().toISOString(),
        updatedBy: session.role,
      };
      await saveLog(entry);
      return send(res, 200, { entry });
    }

    return send(res, 405, { error: 'Method not allowed.' });
  } catch {
    return send(res, 503, { error: 'Could not reach the workout store.' });
  }
}

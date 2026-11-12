export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function firstHeader(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || '').split(',')[0].trim();
}

export function clientIp(req) {
  const headers = req.headers || {};
  const raw = firstHeader(headers['x-real-ip'])
    || firstHeader(headers['x-vercel-forwarded-for'])
    || firstHeader(headers['x-forwarded-for'])
    || String(req.socket?.remoteAddress || 'local');
  return raw.slice(0, 80);
}

export function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) return JSON.parse(req.body);
  return {};
}

export function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(status).json(body);
}

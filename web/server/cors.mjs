/**
 * CORS origin policy for the Career-Ops API.
 * When the API binds to a loopback host, allow any localhost/127.0.0.1 port
 * so Vite dev/preview on alternate ports (5174, 4173, …) still works.
 */

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isAllowedCorsOrigin(origin, { corsOrigins = [], host = '127.0.0.1' } = {}) {
  if (!origin) return true;
  if (corsOrigins.includes(origin)) return true;

  const isLocalBind = LOCAL_HOSTNAMES.has(host);
  if (!isLocalBind) return false;
  if (origin === 'null') return true;

  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return LOCAL_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}
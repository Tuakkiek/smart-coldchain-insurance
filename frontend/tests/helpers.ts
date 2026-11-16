// Payload-only fixtures for Frontend expiry/UX tests, never valid Backend credentials.
export function tokenFor(username = 'demo-admin', expiresInMs = 30 * 60_000): string {
  const encode = (value: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: username, iat: Math.floor(Date.now() / 1000), exp: Math.floor((Date.now() + expiresInMs) / 1000),
  })}.fixture-signature`;
}

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

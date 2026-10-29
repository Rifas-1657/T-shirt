// Minimal admin authentication: one admin passphrase (env), HMAC-signed httpOnly session cookie,
// SameSite=Strict plus an Origin check on state-changing requests, and a login rate limit.
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const SESSION_COOKIE = 'atelier_admin';
const SESSION_TTL_S = 8 * 60 * 60;

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('ADMIN_SESSION_SECRET is missing or shorter than 32 characters');
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionToken(now = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_TTL_S;
  const payload = `admin.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'admin') return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
  const got = Buffer.from(parts[2]);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

export function checkPassword(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(pw).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_TTL_S,
};

/** Same-origin check for state-changing admin requests (defence in depth on top of SameSite). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return req.method === 'GET';
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

/** Returns a 401/403 response when the request is not an authorised admin request. */
export async function requireAdmin(req: Request): Promise<NextResponse | null> {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
  if (req.method !== 'GET' && !sameOrigin(req)) return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 });
  return null;
}

const attempts = new Map<string, number[]>();
export function loginRateLimited(key: string, now = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > 5;
}

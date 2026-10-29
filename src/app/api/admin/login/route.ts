import { NextResponse } from 'next/server';
import { checkPassword, createSessionToken, loginRateLimited, sameOrigin, SESSION_COOKIE, sessionCookieOptions } from '@/server/auth';
import { clientKey } from '@/server/files';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ errors: ['Cross-origin request rejected'] }, { status: 403 });
  if (loginRateLimited(clientKey(req))) return NextResponse.json({ errors: ['Too many attempts; wait a minute.'] }, { status: 429 });
  let password = '';
  try {
    password = String((await req.json()).password ?? '');
  } catch {
    return NextResponse.json({ errors: ['Invalid request.'] }, { status: 400 });
  }
  if (!process.env.ADMIN_PASSWORD) return NextResponse.json({ errors: ['ADMIN_PASSWORD is not configured on the server (see .env.example).'] }, { status: 503 });
  if (!checkPassword(password)) return NextResponse.json({ errors: ['Incorrect password.'] }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions);
  return res;
}

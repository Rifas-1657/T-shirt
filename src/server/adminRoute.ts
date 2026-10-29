// Wraps admin route handlers: authentication/origin check first, uniform error responses.
import { NextResponse } from 'next/server';
import { requireAdmin } from './auth';
import { AdminError } from './catalogAdmin';

type Handler<P> = (req: Request, params: P) => Promise<Response>;

export function adminRoute<P>(handler: Handler<P>) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    try {
      return await handler(req, await ctx.params);
    } catch (e) {
      if (e instanceof AdminError) return NextResponse.json({ errors: e.errors }, { status: e.status });
      console.error('[admin]', e);
      return NextResponse.json({ errors: ['Unexpected server error.'] }, { status: 500 });
    }
  };
}

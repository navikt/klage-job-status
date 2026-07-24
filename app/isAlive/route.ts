import { JOBS } from '@/lib/jobs';
import { LOGS } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!JOBS.isReady) {
    LOGS.error('isAlive - Jobs system not ready', 'is-alive');
    return new Response('Jobs system not ready', { status: 418 });
  }

  if (!(await JOBS.ping())) {
    LOGS.error('isAlive - Jobs system not responding', 'is-alive');
    return new Response('Jobs system not responding', { status: 418 });
  }

  return new Response('OK', { status: 200 });
}

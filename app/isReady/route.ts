import { JOBS } from '@/lib/jobs';
import { LOGS } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!JOBS.isReady) {
    LOGS.error('isReady - Jobs system not ready', 'is-ready');
    return new Response('Jobs system not ready', { status: 418 });
  }

  return new Response('OK', { status: 200 });
}

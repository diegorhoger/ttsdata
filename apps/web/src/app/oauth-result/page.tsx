import { NextRequest, NextResponse } from 'next/server';
import {
  consumeProbeResult,
  verifyProbeResultCookie,
} from '../../lib/oauth';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const resultIdParam = searchParams.get('result_id');

  const probeCookie = request.cookies.get('ttsdata_probe_result')?.value;

  let resultId: string | null = resultIdParam;
  let sessionId: string | null = null;

  if (probeCookie) {
    const verified = verifyProbeResultCookie(probeCookie);
    if (verified) {
      resultId = verified.resultId;
      sessionId = verified.sessionId;
    }
  }

  if (!resultId) {
    return NextResponse.json(
      { error: 'Missing result_id' },
      { status: 400 }
    );
  }

  if (!sessionId) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 400 }
    );
  }

  const sessionHash = createSessionHash(sessionId);
  const result = await consumeProbeResult(resultId, sessionHash);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || 'Result not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    status: result.bothSucceeded ? 'success' : 'partial',
    scopes: result.scopes || '',
    data: result.data,
    bothSucceeded: result.bothSucceeded,
  });
}

function createSessionHash(sessionId: string): string {
  const config = getConfig();
  return createHmac('sha256', config.sessionSecret)
    .update(sessionId)
    .digest('hex');
}

function getConfig() {
  const sessionSecret = process.env.OAUTH_SESSION_SECRET || '';
  return { sessionSecret };
}

import { NextRequest, NextResponse } from 'next/server';
import {
  consumeProbeResult,
  verifyProbeCookie,
} from '../../../lib/oauth';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  // The result endpoint reads from the signed probe cookie; the URL param is optional backup
  const resultIdParam = searchParams.get('result_id');

  const probeCookie = request.cookies.get('ttsdata_probe_result')?.value;

  let resultId: string | null = null;
  let sessionId: string | null = null;

  if (probeCookie) {
    const verified = verifyProbeCookie(probeCookie);
    if (verified) {
      resultId = verified.resultId;
      sessionId = verified.sessionId;
    }
  }

  // Fallback: if no cookie or cookie invalid, require URL param
  if (!resultId && resultIdParam) {
    resultId = resultIdParam;
  }

  // Session must come from verified cookie for security; URL param alone is not authorization
  if (!sessionId) {
    return NextResponse.json(
      { error: 'Session not verified. A valid probe cookie is required.' },
      { status: 403 }
    );
  }

  if (!resultId) {
    return NextResponse.json(
      { error: 'Missing result identifier' },
      { status: 400 }
    );
  }

  const result = await consumeProbeResult(resultId, sessionId);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || 'Result not found or already consumed' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    status: result.bothSucceeded ? 'success' : 'partial',
    scopes: result.scopes || '',
    data: result.data || {},
    bothSucceeded: result.bothSucceeded ?? false,
  });
}

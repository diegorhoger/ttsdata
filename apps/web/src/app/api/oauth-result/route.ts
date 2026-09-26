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
    const response = NextResponse.json(
      { error: 'Session not verified. A valid probe cookie is required.' },
      { status: 403 }
    );
    response.cookies.set('ttsdata_probe_result', '', { maxAge: 0, path: '/' });
    return response;
  }

  if (!resultId) {
    const response = NextResponse.json(
      { error: 'Missing result identifier' },
      { status: 400 }
    );
    response.cookies.set('ttsdata_probe_result', '', { maxAge: 0, path: '/' });
    return response;
  }

  let result;
  try {
    result = await consumeProbeResult(resultId, sessionId);
  } catch (dbError) {
    console.error('OAuth result: database exception', dbError);
    const dbErrorResponse = NextResponse.json(
      { error: 'Database error during result retrieval' },
      { status: 500 }
    );
    dbErrorResponse.cookies.set('ttsdata_probe_result', '', { maxAge: 0, path: '/' });
    return dbErrorResponse;
  }

  if (!result.success) {
    const errorResponse = NextResponse.json(
      { error: result.error || 'Result not found or already consumed' },
      { status: 404 }
    );
  errorResponse.cookies.set('ttsdata_probe_result', '', { maxAge: 0, path: '/' });
  return errorResponse;
  }

  // Clear probe cookie after consumption
  const resClear = NextResponse.json({
    status: result.bothSucceeded ? 'success' : 'partial',
    scopes: result.scopes || '',
    data: result.data || {},
    bothSucceeded: Boolean(result.bothSucceeded ?? false),
  });
  resClear.cookies.set('ttsdata_probe_result', '', { maxAge: 0, path: '/' });
  return resClear;
}

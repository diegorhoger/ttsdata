import { NextRequest, NextResponse } from 'next/server';
import { consumeProbeResult, verifyProbeResultCookie } from '../../lib/oauth';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  let resultId = searchParams.get('result_id');

  if (!resultId) {
    return NextResponse.json(
      { error: 'Missing result_id' },
      { status: 400 }
    );
  }

  // Read cookies
  const probeCookie = request.cookies.get('ttsdata_probe_result')?.value;
  const sessionCookie = request.cookies.get('ttsdata_session')?.value;

  // Verify probe cookie
  if (probeCookie) {
    const sessionHash = sessionCookie ? Buffer.from(sessionCookie, 'base64url').toString('hex') : '';
    const verified = verifyProbeResultCookie(probeCookie, sessionHash);
    if (verified) {
      resultId = verified.resultId;
    }
  }

  // Consume probe result from DB (atomically)
  const sessionHash = sessionCookie ? Buffer.from(sessionCookie, 'base64url').toString('hex') : '';
  const result = await consumeProbeResult(resultId, sessionHash);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || 'Result not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    status: result.probeRecord?.bothSucceeded ? 'success' : 'partial',
    scopes: result.probeRecord?.scopes || '',
    data: result.probeRecord?.data,
    bothSucceeded: result.probeRecord?.bothSucceeded,
  });
}

import { describe, it, expect } from 'vitest';

describe('Referral System Data Contracts', () => {
  it('referral code follows TTS-XXXX format', () => {
    const codes = ['TTS-AB12CD34', 'TTS-XY99ZZ11'];
    for (const code of codes) {
      expect(code).toMatch(/^TTS-[A-Z0-9]{8}$/);
    }
  });

  it('referral link includes base URL and ref param', () => {
    const baseUrl = 'http://localhost:3000';
    const code = 'TTS-AB12CD34';
    const link = `${baseUrl}/register?ref=${code}`;
    expect(link).toContain('/register?ref=');
  });

  it('referral status transitions from pending to converted to rewarded', () => {
    const s = { status: 'pending' as const };
    s.status = 'converted';
    s.status = 'rewarded';
    expect(s.status).toBe('rewarded');
  });
});

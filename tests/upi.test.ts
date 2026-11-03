import { describe, expect, it } from 'vitest';
import { isValidUpiId, upiLink } from '../src/lib/upi';

describe('UPI link', () => {
  it('builds a pay link with the payee filled in and the amount left to the payer', () => {
    expect(upiLink('kunal@oksbi', 'Kunal P')).toBe('upi://pay?pa=kunal@oksbi&pn=Kunal%20P&cu=INR&tn=Buy%20Me%20a%20Coffee');
    expect(upiLink('  1234567890@ybl ', '')).toBe('upi://pay?pa=1234567890@ybl&pn=Gati&cu=INR&tn=Buy%20Me%20a%20Coffee');
  });
  it('accepts normal UPI IDs and rejects anything else', () => {
    for (const ok of ['name@okhdfcbank', 'first.last@paytm', 'a_b-c1@upi', '1234567890@ibl']) expect(isValidUpiId(ok), ok).toBe(true);
    for (const bad of ['', 'nobank', '@upi', 'name@', 'name@@upi', 'na me@upi', 'name@up i', 'name@upi&am=500', 'x@upi?pa=y']) expect(isValidUpiId(bad), bad).toBe(false);
    expect(upiLink('name@upi&am=500', 'x')).toBeNull();
  });
  it('cannot be tricked into adding parameters through the name or note', () => {
    const link = upiLink('a1@upi', 'X&am=999', 'hi&pa=evil@upi')!;
    expect(link.match(/pa=/g)).toHaveLength(1);
    expect(link).not.toContain('&am=');
  });
});

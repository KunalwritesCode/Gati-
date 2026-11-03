import { describe, expect, it } from 'vitest';
import { bundledDataset as data } from '../src/data/bundled';
import { bestRoute, normalizeSpoken, parseRouteUtterance } from '../src/lib/voiceRoute';

const bus = data.bus;
const cur: { from: string | null; to: string | null } = { from: 'jrha', to: 'ucorridor' };
const parse = (t: string, c = cur) => parseRouteUtterance(t, bus, c);
const pair = (t: string, c = cur) => {
  const r = parse(t, c);
  return r.ok ? `${r.from}>${r.to}` : `ERR:${r.reason}`;
};

describe('spoken stop normalisation', () => {
  it('fixes how speech engines spell our stops', () => {
    expect(normalizeSpoken('from J R H A to you corridor')).toBe('from jrha to u corridor');
    expect(normalizeSpoken('Gate number one')).toBe('gate 1');
    expect(normalizeSpoken('a b one parking')).toBe('ab1 parking');
    expect(normalizeSpoken('Kuda san')).toBe('kudasan');
    expect(normalizeSpoken('J.R.H.A')).toBe('jrha');
  });
});

describe('voice route parsing', () => {
  it('English', () => {
    expect(pair('from Gate 1 to U Corridor')).toBe('gate1>ucorridor');
    expect(pair('from gate one to you corridor')).toBe('gate1>ucorridor');
    expect(pair('Gate 1 to JRHA')).toBe('gate1>jrha');
    expect(pair('I want to go from research park to J R H A')).toBe('rpc>jrha');
    expect(pair('U Corridor')).toBe('ucorridor>null');
  });
  it('Jeet and Jeet Royal are JRHA, however they are heard or spelled', () => {
    expect(pair('from Jeet Royal to U Corridor')).toBe('jrha>ucorridor');
    expect(pair('U Corridor se jeet royal jaana hai')).toBe('ucorridor>jrha');
    expect(pair('from jeet royale to gate one')).toBe('jrha>gate1');
    expect(pair('जीत रॉयल से यू कॉरिडोर')).toBe('jrha>ucorridor');
    expect(pair('यू कॉरिडोर से जीत रॉयल')).toBe('ucorridor>jrha');
    expect(pair('from Jeet to U Corridor')).toBe('jrha>ucorridor');
    expect(pair('U Corridor se jeet jaana hai')).toBe('ucorridor>jrha');
    expect(pair('from J E E T to you corridor')).toBe('jrha>ucorridor');
    expect(pair('from geet to gate one', { from: null, to: null })).toBe('jrha>gate1');
    expect(pair('जीत से यू कॉरिडोर')).toBe('jrha>ucorridor');
    expect(pair('यू कॉरिडोर से जीत')).toBe('ucorridor>jrha');
    expect(normalizeSpoken('J E E T')).toBe('jeet');
  });
  it('Hinglish', () => {
    expect(pair('Gate 1 se U Corridor')).toBe('gate1>ucorridor');
    expect(pair('U Corridor se JRHA jaana hai')).toBe('ucorridor>jrha');
    expect(pair('mess parking se kudasan')).toBe('mess>kudasan');
  });
  it('Hindi (Devanagari)', () => {
    expect(pair('गेट 1 से यू कॉरिडोर')).toBe('gate1>ucorridor');
    expect(pair('यू कॉरिडोर से जेआरएचए')).toBe('ucorridor>jrha');
    expect(pair('मेस पार्किंग से कुडासन जाना है')).toBe('mess>kudasan');
  });
  it('destination only keeps the current stop when that ride exists', () => {
    expect(pair('to Gate 1')).toBe('jrha>gate1');
    expect(pair('Kudasan')).toBe('null>kudasan'); // no ride JRHA → Kudasan, so any origin
    expect(pair('JRHA jaana hai', { from: 'ucorridor', to: null })).toBe('ucorridor>jrha');
  });
  it('refuses impossible rides instead of guessing', () => {
    const r = parse('from U Corridor to AB1 Parking');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('No bus route goes from U Corridor to AB1 Parking.');
    expect(pair('from Gate 1 to Kudasan')).toBe('ERR:no_route');
    expect(pair('from JRHA to JRHA')).toBe('ERR:no_route');
  });
  it('reports when no stop was recognised', () => {
    const r = parse('take me to the hostel');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no_stop');
  });
  it('uses the first recogniser alternative that makes sense', () => {
    const r = bestRoute(['from great one to you corridor', 'from gate one to you corridor'], bus, cur);
    expect(r.ok && `${r.from}>${r.to}`).toBe('gate1>ucorridor');
    expect(bestRoute(['', ''], bus, cur).ok).toBe(false);
  });
});

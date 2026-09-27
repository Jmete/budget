import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestRates } from './fx';

const boc = {
  observations: [
    { d: '2026-04-30', FXSARCAD: { v: '0.3633' } }, // discontinued series
    { d: '2026-09-24', FXUSDCAD: { v: '1.4100' }, FXEURCAD: { v: '1.6100' }, FXGBPCAD: { v: '1.8700' }, FXHKDCAD: { v: '0.1800' } },
    { d: '2026-09-25', FXUSDCAD: { v: '1.4145' }, FXEURCAD: { v: '1.6122' }, FXGBPCAD: { v: '1.8740' }, FXHKDCAD: { v: '0.1803' } },
  ],
};
const er = { result: 'success', time_last_update_unix: 1790467351, rates: { USD: 0.7, SAR: 2.652595, HKD: 5.5 } };

function mockFetch(handlers: Record<string, () => Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const key = Object.keys(handlers).find((k) => url.includes(k));
      if (!key) throw new TypeError('network error');
      return handlers[key]();
    }),
  );
}
const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe('fetchLatestRates', () => {
  it('uses the newest Bank of Canada rates and fills discontinued ones from ExchangeRate-API', async () => {
    mockFetch({ bankofcanada: json(boc), 'er-api': json(er) });
    const r = await fetchLatestRates();
    expect(r.rates.USD).toBe(1.4145);
    expect(r.sources.USD).toBe('Bank of Canada 2026-09-25');
    expect(r.rates.SAR).toBeCloseTo(1 / 2.652595, 4);
    expect(r.sources.SAR).toMatch(/^ExchangeRate-API/);
  });

  it('falls back to ExchangeRate-API when the Bank of Canada is down', async () => {
    mockFetch({ bankofcanada: json({}, 503), 'er-api': json(er) });
    const r = await fetchLatestRates();
    expect(r.rates.USD).toBeCloseTo(1 / 0.7, 4);
    expect(r.rates.HKD).toBeCloseTo(1 / 5.5, 4);
  });

  it('throws a readable error when both services fail', async () => {
    mockFetch({});
    await expect(fetchLatestRates()).rejects.toThrow(/Couldn't reach/);
  });
});

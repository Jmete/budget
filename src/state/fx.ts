import { FOREIGN_CURRENCIES, type ForeignCurrency } from './model';

export interface RateResult {
  rates: Partial<Record<ForeignCurrency, number>>;
  /** Where each rate came from, e.g. "Bank of Canada 2026-09-25". */
  sources: Partial<Record<ForeignCurrency, string>>;
}

const BOC_URL = (codes: ForeignCurrency[]) =>
  `https://www.bankofcanada.ca/valet/observations/${codes.map((c) => `FX${c}CAD`).join(',')}/json?recent=10`;
const ER_URL = 'https://open.er-api.com/v6/latest/CAD';

/** A rate older than this (relative to the newest one) counts as discontinued. */
const STALE_DAYS = 14;

async function getJson(url: string, signal?: AbortSignal) {
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.json();
}

/** Bank of Canada daily averages: the rates CRA accepts for converting foreign income. */
async function fromBankOfCanada(codes: ForeignCurrency[], signal?: AbortSignal): Promise<RateResult> {
  const data = await getJson(BOC_URL(codes), signal);
  const obs: Record<string, unknown>[] = Array.isArray(data?.observations) ? data.observations : [];
  const newest = obs.reduce((m, o) => (typeof o.d === 'string' && o.d > m ? o.d : m), '');
  const cutoff = newest ? new Date(Date.parse(newest) - STALE_DAYS * 864e5).toISOString().slice(0, 10) : '';
  const out: RateResult = { rates: {}, sources: {} };
  for (const c of codes) {
    let best: { d: string; v: number } | null = null;
    for (const o of obs) {
      const v = Number((o[`FX${c}CAD`] as { v?: string } | undefined)?.v);
      const d = o.d as string;
      if (Number.isFinite(v) && v > 0 && d >= cutoff && (!best || d > best.d)) best = { d, v };
    }
    if (best) {
      out.rates[c] = best.v;
      out.sources[c] = `Bank of Canada ${best.d}`;
    }
  }
  return out;
}

/** ExchangeRate-API open endpoint: daily, covers every currency. */
async function fromOpenErApi(codes: ForeignCurrency[], signal?: AbortSignal): Promise<RateResult> {
  const data = await getJson(ER_URL, signal);
  if (data?.result !== 'success') throw new Error('open.er-api.com returned no rates');
  const date = new Date((data.time_last_update_unix ?? 0) * 1000).toISOString().slice(0, 10);
  const out: RateResult = { rates: {}, sources: {} };
  for (const c of codes) {
    const perCad = Number(data.rates?.[c]);
    if (Number.isFinite(perCad) && perCad > 0) {
      out.rates[c] = Math.round((1 / perCad) * 1e5) / 1e5;
      out.sources[c] = `ExchangeRate-API ${date}`;
    }
  }
  return out;
}

/**
 * Latest C$ per unit of each foreign currency. Bank of Canada first; anything it
 * doesn't publish (e.g. SAR, discontinued in 2026) comes from ExchangeRate-API.
 */
export async function fetchLatestRates(signal?: AbortSignal): Promise<RateResult> {
  const result: RateResult = { rates: {}, sources: {} };
  const errors: string[] = [];
  try {
    Object.assign(result, await fromBankOfCanada(FOREIGN_CURRENCIES, signal));
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    errors.push((e as Error).message);
  }
  const missing = FOREIGN_CURRENCIES.filter((c) => result.rates[c] == null);
  if (missing.length) {
    try {
      const er = await fromOpenErApi(missing, signal);
      Object.assign(result.rates, er.rates);
      Object.assign(result.sources, er.sources);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      errors.push((e as Error).message);
    }
  }
  if (Object.keys(result.rates).length === 0) {
    throw new Error(`Couldn't reach the exchange rate services (${errors.join('; ') || 'no data'}).`);
  }
  return result;
}

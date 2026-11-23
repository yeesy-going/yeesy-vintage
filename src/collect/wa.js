// Wine Advocate: the chart page is rendered in the browser from one JSON response.
// We open the public page like any visitor and read that response.
// Series label: "<country>|<region>", e.g. "France|Bordeaux: Margaux".
import { chromium } from 'playwright';
import { parseScore } from '../parse.js';

export const URL = 'https://www.robertparker.com/vintage-chart';

export function parse(payload) {
  const rows = payload?.data?.data;
  if (!Array.isArray(rows)) throw new Error('Wine Advocate: unexpected response shape');
  const series = {};
  for (const r of rows) {
    const label = `${r.country}|${r.regionLabel}`;
    series[label] ??= {};
    const s = parseScore(r.rating);
    const year = Number(r.year);
    if (Number.isInteger(year) && s !== null) series[label][year] = s;
  }
  return series;
}

export async function collect() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  try {
    const page = await browser.newPage();
    const response = page.waitForResponse(
      (r) => r.url().includes('/vintage-scores') && r.status() === 200,
      { timeout: 90_000 },
    );
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    return parse(await (await response).json());
  } finally {
    await browser.close();
  }
}

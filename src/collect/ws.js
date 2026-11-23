// Wine Spectator: one page per region, a table with one row per vintage.
// Series label: the region page's slug, e.g. "bordeaux-left-bank-reds-medoc-pessac-leognan".
import * as cheerio from 'cheerio';
import { getHtml, sleep } from './http.js';
import { parseScore, parseYear } from '../parse.js';

export const URL = 'https://www.winespectator.com/vintage-charts';

export function parse(html) {
  const $ = cheerio.load(html);
  const scores = {};
  $('table tr').each((_, tr) => {
    const tds = $(tr).children('td').toArray();
    if (tds.length < 2) return;
    // Each cell repeats its column name in a mobile-only <h5>; drop it.
    const text = (td) => $(td).clone().find('h5').remove().end().text().trim();
    const year = parseYear(text(tds[0]));
    const score = parseScore(text(tds[1]));
    if (year && score !== null) scores[year] = score;
  });
  return scores;
}

export async function collect(slugs) {
  const series = {};
  for (const slug of slugs) {
    series[slug] = parse(await getHtml(`${URL}/region/${slug}`));
    await sleep(1500);
  }
  return series;
}

// Wine Enthusiast: every country's chart is a table on one page.
// Series label: "<chart title>|<region>|<type>", e.g. "France|Bordeaux|Médoc".
import * as cheerio from 'cheerio';
import { getHtml } from './http.js';
import { parseScore, parseYear } from '../parse.js';

export const URL = 'https://www.wineenthusiast.com/wine-vintage-chart/';

export function parse(html) {
  const $ = cheerio.load(html);
  const series = {};
  $('table[id$="-vintage-chart"]').each((_, table) => {
    const title = $(table).closest('.table-wrapper').find('.chart-title').first().text().trim();
    const rows = $(table).find('tr').toArray();
    const cells = (tr) => $(tr).children('td,th').toArray().map((c) => $(c).text().trim());
    const years = cells(rows[0]).slice(2).map(parseYear);
    let region = '';
    for (const tr of rows.slice(1)) {
      const c = cells(tr);
      if (c.length < 3) continue; // section heading such as "CALIFORNIA"
      region = c[0] || region;
      const scores = {};
      c.slice(2).forEach((v, i) => {
        const s = parseScore(v);
        if (years[i] && s !== null) scores[years[i]] = s;
      });
      series[[title, region, c[1]].join('|')] = scores;
    }
  });
  return series;
}

export async function collect() {
  return parse(await getHtml(URL));
}

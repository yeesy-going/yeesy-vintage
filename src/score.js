// Scoring for one region.
//
// Each critic scores on a slightly different scale (some are more generous, some spread
// their scores wider), so every critic's scores are first moved onto the region's common
// scale:
//
//   adjusted = pooledMean + (score - criticMean) * (pooledSd / criticSd)
//
// The year's score is the mean of the adjusted scores of the critics who rated it.
//
// How a year is ranked depends on how many of the region's critics rated it:
//   full        every critic that covers the region      -> ranked
//   partial     one critic missing, at least two present -> ranked, flagged
//   provisional fewer than that (typically one critic)   -> shown, not ranked
//   none        nobody                                   -> blank

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
// Population standard deviation, as in the original spreadsheet (STDEV.P).
const sd = (xs) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/** Mean of several source series, year by year, over the series that have that year. */
export function combineSeries(seriesList) {
  const out = {};
  for (const year of new Set(seriesList.flatMap((s) => Object.keys(s)))) {
    const vals = seriesList.map((s) => s[year]).filter((v) => v != null);
    if (vals.length) out[year] = mean(vals);
  }
  return out;
}

/**
 * @param {Record<string, Record<string, number>>} byCritic  critic -> year -> raw score
 * @param {number[]} years  the window the statistics and ranks are computed over
 */
export function scoreRegion(byCritic, years) {
  const critics = {};
  const pooledValues = [];
  for (const [critic, series] of Object.entries(byCritic)) {
    const values = years.map((y) => series[y]).filter((v) => v != null);
    if (!values.length) continue;
    critics[critic] = { n: values.length, mean: mean(values), sd: sd(values) };
    pooledValues.push(...values);
  }
  const covering = Object.keys(critics);
  if (!covering.length) return { critics, pooled: null, years: {}, top: [] };
  const pooled = { mean: mean(pooledValues), sd: sd(pooledValues) };

  const result = {};
  for (const year of years) {
    const raw = {};
    const adjusted = {};
    for (const critic of covering) {
      const v = byCritic[critic][year];
      if (v == null) continue;
      const c = critics[critic];
      raw[critic] = v;
      // A critic who gave every year the same score tells us nothing about which is better.
      adjusted[critic] = c.sd > 0 ? pooled.mean + (v - c.mean) * (pooled.sd / c.sd) : pooled.mean;
    }
    const n = Object.keys(raw).length;
    let status = 'none';
    if (n === covering.length) status = 'full';
    else if (n >= 2 && n === covering.length - 1) status = 'partial';
    else if (n >= 1) status = 'provisional';
    result[year] = {
      status,
      n,
      of: covering.length,
      score: n ? mean(Object.values(adjusted)) : null,
      rank: null,
      raw,
      adjusted,
    };
  }

  // Standard competition ranking (ties share a rank), like RANK.EQ.
  const ranked = years.filter((y) => ['full', 'partial'].includes(result[y].status));
  for (const y of ranked) {
    result[y].rank = 1 + ranked.filter((o) => result[o].score > result[y].score).length;
  }
  const top = [...ranked].sort((a, b) => result[b].score - result[a].score || b - a);
  return { critics, pooled, years: result, top };
}

// Combine data/raw/*.json with config/regions.json into web/data/chart.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { combineSeries, scoreRegion } from './score.js';

const root = new URL('../', import.meta.url);
const readJson = async (rel) => JSON.parse(await readFile(new URL(rel, root), 'utf8'));

export function buildChart(config, raw, meta = {}, changes = []) {
  const missing = [];
  const regionSeries = config.regions.map((region) => {
    const byCritic = {};
    for (const [critic, labels] of Object.entries(region.sources)) {
      const list = labels.map((label) => {
        const s = raw[critic]?.[label];
        if (!s || !Object.keys(s).length) missing.push(`${region.name}: ${critic} "${label}"`);
        return s ?? {};
      });
      byCritic[critic] = combineSeries(list);
    }
    return byCritic;
  });
  if (missing.length) {
    throw new Error(`Source series not found (site changed its labels?):\n  ${missing.join('\n  ')}`);
  }

  const endYear = Math.max(
    ...regionSeries.flatMap((byCritic) => Object.values(byCritic).flatMap((s) => Object.keys(s).map(Number))),
  );
  const years = [];
  for (let y = endYear; y >= config.startYear; y--) years.push(y);

  const round = (v, d = 2) => (v == null ? null : Number(v.toFixed(d)));
  const regions = config.regions.map((region, i) => {
    const scored = scoreRegion(regionSeries[i], years, config.scoring);
    return {
      id: region.id,
      country: region.country,
      name: region.name,
      aliases: region.aliases ?? [],
      sources: region.sources,
      notes: region.notes ?? {},
      pooled: { mean: round(scored.pooled.mean), sd: round(scored.pooled.sd) },
      critics: Object.fromEntries(
        Object.entries(scored.critics).map(([c, s]) => [c, { n: s.n, mean: round(s.mean), sd: round(s.sd) }]),
      ),
      top: scored.top.slice(0, 8),
      years: Object.fromEntries(
        years.map((y) => {
          const r = scored.years[y];
          return [
            y,
            {
              status: r.status,
              n: r.n,
              of: r.of,
              score: round(r.score),
              rank: r.rank,
              raw: Object.fromEntries(Object.entries(r.raw).map(([c, v]) => [c, round(v)])),
              adjusted: Object.fromEntries(Object.entries(r.adjusted).map(([c, v]) => [c, round(v)])),
            },
          ];
        }),
      ),
    };
  });

  // Scores a critic changed after publishing them (a newly rated vintage is not a revision),
  // for the series the chart uses, newest first.
  const used = new Set(config.regions.flatMap((r) => Object.entries(r.sources).flatMap(([c, ls]) => ls.map((l) => `${c}|${l}`))));
  const revisions = changes
    .filter((c) => c.from != null && c.to != null && used.has(`${c.critic}|${c.label}`))
    .reverse()
    .slice(0, 100);
  return { years, critics: config.critics, sourceUpdated: meta, regions, revisions };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = await readJson('config/regions.json');
  const raw = {};
  for (const critic of Object.keys(config.critics)) {
    raw[critic] = await readJson(`data/raw/${critic.toLowerCase()}.json`);
  }
  const chart = buildChart(
    config,
    raw,
    await readJson('data/raw/meta.json'),
    await readJson('data/changes.json'),
  );
  await mkdir(new URL('web/data/', root), { recursive: true });
  await writeFile(new URL('web/data/chart.json', root), JSON.stringify(chart) + '\n');
  console.log(`web/data/chart.json: ${chart.regions.length} regions, ${chart.years[0]}-${chart.years.at(-1)}`);
}

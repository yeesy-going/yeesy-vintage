// Collect all three critics' charts into data/raw/<critic>.json.
// A file is rewritten only when its scores changed; each change is logged to data/changes.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import * as we from './we.js';
import * as wa from './wa.js';
import * as ws from './ws.js';

const root = new URL('../../', import.meta.url);
const readJson = async (rel, fallback) => {
  try {
    return JSON.parse(await readFile(new URL(rel, root), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
};
const writeJson = (rel, value) =>
  writeFile(new URL(rel, root), JSON.stringify(value, null, 1) + '\n');

// A site redesign should fail loudly, not overwrite good data with an empty chart.
const MIN_SCORES = { WE: 1500, WA: 1500, WS: 250 };

function diff(critic, before, after, date) {
  const out = [];
  // A series we were not collecting before is new data, not a change by the critic.
  for (const label of Object.keys(before)) {
    const a = before[label];
    const b = after[label] ?? {};
    for (const year of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[year] !== b[year]) {
        out.push({ date, critic, label, year: Number(year), from: a[year] ?? null, to: b[year] ?? null });
      }
    }
  }
  return out;
}

const sorted = (series) =>
  Object.fromEntries(Object.keys(series).sort().map((k) => [k, series[k]]));

async function main() {
  const config = await readJson('config/regions.json');
  const wsSlugs = [...new Set(config.regions.flatMap((r) => r.sources.WS ?? []))];
  const only = process.argv.slice(2).map((s) => s.toUpperCase());
  const jobs = { WE: () => we.collect(), WA: () => wa.collect(), WS: () => ws.collect(wsSlugs) };
  const date = new Date().toISOString().slice(0, 10);

  await mkdir(new URL('data/raw/', root), { recursive: true });
  const meta = await readJson('data/raw/meta.json', {});
  const changes = await readJson('data/changes.json', []);
  let failed = false;

  for (const critic of Object.keys(jobs)) {
    if (only.length && !only.includes(critic)) continue;
    try {
      const series = sorted(await jobs[critic]());
      const count = Object.values(series).reduce((n, s) => n + Object.keys(s).length, 0);
      if (count < MIN_SCORES[critic]) {
        throw new Error(`only ${count} scores parsed (expected at least ${MIN_SCORES[critic]})`);
      }
      const rel = `data/raw/${critic.toLowerCase()}.json`;
      const before = await readJson(rel, null);
      const delta = before ? diff(critic, before, series, date) : [];
      if (!before || delta.length) {
        await writeJson(rel, series);
        meta[critic] = { lastChanged: date };
        changes.push(...delta);
      }
      console.log(`${critic}: ${Object.keys(series).length} series, ${count} scores, ${before ? delta.length + ' changed' : 'first collection'}`);
    } catch (err) {
      failed = true;
      console.error(`${critic}: FAILED, keeping previous data: ${err.message}`);
    }
  }

  await writeJson('data/raw/meta.json', meta);
  await writeJson('data/changes.json', changes);
  if (failed) process.exitCode = 1;
}

await main();

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseScore } from '../src/parse.js';
import { combineSeries, scoreRegion } from '../src/score.js';

const sheet = JSON.parse(
  await readFile(new URL('./fixtures/original-sheet.json', import.meta.url), 'utf8'),
);

test('reproduces every score in the original spreadsheet', () => {
  let checked = 0;
  for (const region of sheet.regions) {
    const scored = scoreRegion(region.raw, sheet.years);
    for (const [year, expected] of Object.entries(region.sheetScore)) {
      const got = scored.years[year].score;
      assert.ok(Math.abs(got - expected) < 1e-6, `${region.name} ${year}: ${got} vs sheet ${expected}`);
      checked++;
    }
  }
  assert.equal(checked, 386);
});

test('ranks match the spreadsheet when every year has all of the region\'s critics', () => {
  // The sheet ranked every year; we only rank years with enough critics. Where no year
  // is left out, the two must agree exactly.
  let compared = 0;
  for (const region of sheet.regions) {
    const scored = scoreRegion(region.raw, sheet.years);
    const all = Object.values(scored.years);
    if (all.some((y) => y.status === 'provisional' || y.status === 'none')) continue;
    for (const [year, expected] of Object.entries(region.sheetRank)) {
      assert.equal(scored.years[year].rank, expected, `${region.name} ${year}`);
    }
    compared++;
  }
  assert.ok(compared >= 3, `only ${compared} regions compared`);
});

test('a year rated by a single critic is shown but not ranked', () => {
  const amarone = sheet.regions.find((r) => r.name === 'Amarone');
  const scored = scoreRegion(amarone.raw, sheet.years);
  // In the sheet 1997 was ranked first on Wine Enthusiast's score alone.
  assert.equal(amarone.sheetRank['1997'], 1);
  assert.equal(scored.years[1997].status, 'provisional');
  assert.equal(scored.years[1997].rank, null);
  assert.ok(scored.years[1997].score > 96);
  assert.ok(!scored.top.includes(1997));
  // Only two critics cover Amarone, so two critics is full coverage there.
  assert.equal(scored.years[2010].status, 'full');
  assert.equal(scored.years[2010].of, 2);
});

test('one critic missing out of three is ranked but flagged', () => {
  const lb = sheet.regions.find((r) => r.name === 'Bordeaux Left Bank');
  const scored = scoreRegion(lb.raw, sheet.years);
  assert.equal(scored.years[2021].status, 'partial');
  assert.equal(scored.years[2021].n, 2);
  assert.ok(Number.isInteger(scored.years[2021].rank));
  assert.equal(scored.years[2019].status, 'full');
});

test('tied years share a rank and both appear in the top list', () => {
  const s = scoreRegion(
    { A: { 2001: 90, 2002: 95, 2003: 95, 2004: 80 }, B: { 2001: 91, 2002: 96, 2003: 96, 2004: 85 } },
    [2004, 2003, 2002, 2001],
  );
  assert.equal(s.years[2002].rank, 1);
  assert.equal(s.years[2003].rank, 1);
  assert.equal(s.years[2001].rank, 3);
  assert.deepEqual(s.top.slice(0, 2), [2003, 2002]);
});

test('years outside the window do not affect the statistics', () => {
  const a = scoreRegion({ A: { 2001: 90, 2002: 95, 1990: 50 }, B: { 2001: 88, 2002: 97 } }, [2002, 2001]);
  const b = scoreRegion({ A: { 2001: 90, 2002: 95 }, B: { 2001: 88, 2002: 97 } }, [2002, 2001]);
  assert.deepEqual(a.years, b.years);
});

test('sub-regions are averaged into their parent, using the ones that have the year', () => {
  assert.deepEqual(combineSeries([{ 2020: 96, 2019: 96 }, { 2020: 95 }, { 2020: 94, 2019: 90 }]), {
    2020: 95,
    2019: 93,
  });
});

test('score cells', () => {
  assert.equal(parseScore('93'), 93);
  assert.equal(parseScore('93I'), 93);
  assert.equal(parseScore('90-92R'), 91);
  assert.equal(parseScore('100T'), 100);
  for (const blank of ['NT', 'NV', 'NR', '', null, undefined, '2021']) assert.equal(parseScore(blank), null);
});

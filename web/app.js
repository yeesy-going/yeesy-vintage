// Renders web/data/chart.json. All text goes in via textContent.

const BIN_EDGES = [86, 88, 90, 92, 94, 96]; // score -> one of 7 colour steps
const STATUS_LABEL = { full: '전원 평가', partial: '1곳 빠짐', provisional: '잠정', none: '평가 없음' };

const COUNTRY_KO = {
  France: '프랑스', Italy: '이탈리아', Spain: '스페인', Portugal: '포르투갈', Germany: '독일',
  Austria: '오스트리아', US: '미국 USA America', Argentina: '아르헨티나', Chile: '칠레',
  Australia: '호주', 'New Zealand': '뉴질랜드', 'South Africa': '남아공 남아프리카',
};

const state = { mode: 'score', regionId: null, year: null, query: '' };
let chart;

const $ = (id) => document.getElementById(id);
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

const bin = (score) => 1 + BIN_EDGES.filter((edge) => score >= edge).length;
const fmt = (v, d = 1) => (v == null ? '–' : v.toFixed(d));
const fmtRaw = (v) => (v == null ? '–' : Number.isInteger(v) ? String(v) : v.toFixed(1));
const yy = (year) => `'${String(year).slice(2)}`;
// "France|Bordeaux|Médoc" -> "Bordeaux Médoc"; a Wine Spectator page slug -> its words.
const sourceLabel = (label) =>
  label.includes('|') ? label.split('|').filter(Boolean).slice(1).join(' ') : label.replaceAll('-', ' ');

// ---- Search -------------------------------------------------------------------------
// "Médoc", "medoc" and "MEDOC" are the same word, and so are "Saint-Émilion",
// "St. Emilion" and "st emilion".
function normalize(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC') // put Hangul syllables back together
    .toLowerCase()
    .replace(/\bsainte?\b/g, 'st')
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3]+/g, '');
}

/** Everything a region can be found by: its name, country, aliases, and the critics' own labels. */
function searchTerms(region) {
  const fromSources = Object.values(region.sources).flat().flatMap((label) =>
    label.includes('|') ? label.split(/[|:/]/) : [label.replaceAll('-', ' ')],
  );
  return [region.name, region.country, COUNTRY_KO[region.country] ?? '', ...region.aliases, ...fromSources]
    .map((t) => t.trim())
    .filter(Boolean);
}

/** null when the region does not match; otherwise the alias that matched (or '' if the name did). */
function match(region, query) {
  const tokens = query.split(/\s+/).map(normalize).filter(Boolean);
  if (!tokens.length) return '';
  const terms = region.terms ?? (region.terms = searchTerms(region).map((t) => [t, normalize(t)]));
  let via = '';
  for (const token of tokens) {
    const hit = terms.find(([, n]) => n.includes(token));
    if (!hit) return null;
    const obvious = [region.name, region.country, COUNTRY_KO[region.country]].includes(hit[0]);
    if (!obvious && !normalize(region.name).includes(token) && !via) via = hit[0];
  }
  return via;
}

// ---- Simple view: the original Summary sheet ------------------------------------------
function renderSheet() {
  const table = $('sheet');
  const head = el(
    'tr',
    {},
    el('th', { class: 'col-country', scope: 'col' }),
    el('th', { class: 'col-region sheet-title', scope: 'col', text: "Yeesy's Vintage Chart" }),
    ...chart.years.map((year) => el('th', { scope: 'col', text: String(year) })),
  );
  const hits = chart.regions.map((region) => [region, match(region, state.query)]).filter(([, via]) => via !== null);
  $('search-count').textContent = state.query.trim() ? `${chart.regions.length}개 산지 중 ${hits.length}개` : '';

  const body = el('tbody');
  hits.forEach(([region, via], i) => {
    const firstOfCountry = i === 0 || hits[i - 1][0].country !== region.country;
    const scores = el('tr', { class: `scores${firstOfCountry ? ' first' : ''}` });
    if (firstOfCountry) {
      const span = hits.filter(([r]) => r.country === region.country).length;
      scores.append(el('th', { class: 'col-country', scope: 'rowgroup', rowspan: span * 2, text: region.country }));
    }
    scores.append(
      el('th', { class: 'col-region', scope: 'row' }, region.name, via ? ' ' : null, via ? el('mark', { text: via }) : null),
    );
    const ranks = el('tr', { class: 'ranks' }, el('th', { class: 'col-region', text: region.top.map((y) => String(y).slice(2)).join(', ') }));
    for (const year of chart.years) {
      const y = region.years[year];
      const title = y.status === 'provisional' ? `평론지 ${y.of}곳 중 ${y.n}곳만 평가 (잠정)` : null;
      scores.append(el('td', { class: y.status, title, text: y.status === 'none' ? '' : fmt(y.score) }));
      ranks.append(el('td', { class: y.status, text: y.rank == null ? '' : String(y.rank) }));
    }
    body.append(scores, ranks);
  });
  if (!hits.length) {
    body.append(
      el('tr', {}, el('td', { class: 'empty', colspan: chart.years.length + 2, text: `"${state.query.trim()}"에 맞는 산지가 없습니다. 산지 이름, 마을 이름, 품종, 나라 이름으로 찾아보세요.` })),
    );
  }
  table.replaceChildren(el('thead', {}, head), body);
}

function showView() {
  const simple = location.hash === '#simple';
  $('view-simple').hidden = !simple;
  $('view-detail').hidden = simple;
  for (const [id, current] of [['nav-simple', simple], ['nav-detail', !simple]]) {
    if (current) $(id).setAttribute('aria-current', 'page');
    else $(id).removeAttribute('aria-current');
  }
  hideTip();
}

function cellText(y) {
  if (y.status === 'none') return '·';
  if (state.mode === 'rank') return y.rank == null ? '–' : String(y.rank);
  return fmt(y.score);
}

function renderSources() {
  const box = $('sources');
  box.replaceChildren();
  Object.entries(chart.critics).forEach(([code, critic], i) => {
    if (i) box.append(' · ');
    box.append(el('a', { href: critic.url, target: '_blank', rel: 'noopener', text: critic.name }));
    const changed = chart.sourceUpdated?.[code]?.lastChanged;
    if (changed) box.append(` (${changed} 갱신)`);
  });
}

function renderLegend() {
  const ramp = el('div', { class: 'ramp' });
  const labels = ['<86', '86', '88', '90', '92', '94', '96+'];
  labels.forEach((label, i) => {
    const swatch = el('i');
    swatch.style.background = `var(--s${i + 1})`;
    ramp.append(el('div', { class: 'ramp-step' }, swatch, el('span', { text: label })));
  });
  $('legend').replaceChildren(
    el('div', { class: 'legend-group' }, el('span', { text: '점수' }), ramp),
    el('span', { class: 'key' }, el('span', { class: 'swatch partial' }), '평론지 1곳 빠짐 (순위 포함)'),
    el('span', { class: 'key' }, el('span', { class: 'swatch provisional' }), '1곳만 평가 (잠정, 순위 제외)'),
  );
}

function renderChart() {
  const table = $('chart');
  const head = el('tr', {}, el('th', { class: 'corner', scope: 'col', text: '산지' }));
  for (const year of chart.years) {
    head.append(el('th', { scope: 'col', title: String(year), text: yy(year) }));
  }
  const body = el('tbody');
  let country = null;
  for (const region of chart.regions) {
    if (region.country !== country) {
      country = region.country;
      body.append(
        el('tr', { class: 'country' }, el('th', { scope: 'rowgroup', text: country }), el('td', { colspan: chart.years.length })),
      );
    }
    const top = region.top.map(yy).join(' ');
    const criticCount = Object.keys(region.critics).length;
    const few = criticCount < Object.keys(chart.critics).length ? `평론지 ${criticCount}곳 · ` : '';
    const row = el(
      'tr',
      { class: region.id === state.regionId ? 'selected' : '', 'data-region': region.id },
      el(
        'th',
        { class: 'rowhead', scope: 'row' },
        el(
          'button',
          { type: 'button', class: 'region-btn', onclick: () => select(region.id, null, true) },
          el('span', { class: 'region-name', text: region.name }),
          el('small', { text: few + top }),
        ),
      ),
    );
    for (const year of chart.years) {
      const y = region.years[year];
      const classes = ['cell', y.status];
      if (y.status === 'full' || y.status === 'partial') classes.push(`b${bin(y.score)}`);
      if (y.rank != null && y.rank <= 3) classes.push('top');
      if (region.id === state.regionId && year === state.year) classes.push('picked');
      row.append(
        el('td', {
          class: classes.join(' '),
          text: cellText(y),
          'data-year': year,
          onpointerenter: (e) => showTip(e.currentTarget, region, year),
          onpointerleave: hideTip,
          onclick: () => select(region.id, year, false),
        }),
      );
    }
    body.append(row);
  }
  table.replaceChildren(el('thead', {}, head), body);
}

function showTip(cell, region, year) {
  const y = region.years[year];
  const tip = $('tooltip');
  const rows = el('table');
  for (const [code, critic] of Object.entries(chart.critics)) {
    if (!(code in region.critics)) continue;
    const raw = y.raw[code];
    rows.append(
      el('tr', {}, el('td', { text: critic.name }), el('td', { text: raw == null ? '–' : `${fmtRaw(raw)} → ${fmt(y.adjusted[code])}` })),
    );
  }
  const main =
    y.status === 'none' ? '평가 없음' : `${fmt(y.score, 2)}${y.rank != null ? ` · ${y.rank}위` : ''}`;
  const notes = {
    partial: `평론지 ${y.of}곳 중 ${y.n}곳 평가`,
    provisional: `평론지 ${y.of}곳 중 ${y.n}곳만 평가해 순위에서 제외`,
  };
  tip.replaceChildren(
    ...[
      el('strong', { text: `${region.name} ${year}` }),
      el('div', { class: 'tt-main', text: main }),
      y.status === 'none' ? null : rows,
      notes[y.status] ? el('div', { class: 'tt-note', text: notes[y.status] }) : null,
    ].filter(Boolean),
  );
  tip.hidden = false;
  const r = cell.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
  const above = r.top - t.height - 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${above > 8 ? above : r.bottom + 8}px`;
}
function hideTip() {
  $('tooltip').hidden = true;
}

function renderDetail() {
  const region = chart.regions.find((r) => r.id === state.regionId);
  const box = $('detail');
  if (!region) return box.replaceChildren();

  const head = el(
    'div',
    { class: 'detail-head' },
    el('span', { class: 'eyebrow', text: region.country }),
    el('h2', { text: region.name }),
    el('span', { class: 'best', text: `상위 빈티지 ${region.top.join(', ')}` }),
  );

  const critics = el('table', { class: 'plain' });
  critics.append(
    el('thead', {}, el('tr', {}, ...['평론지', '평가 연도 수', '평균', '표준편차'].map((t) => el('th', { text: t })))),
  );
  const cbody = el('tbody');
  for (const [code, critic] of Object.entries(chart.critics)) {
    const stats = region.critics[code];
    const labels = (region.sources[code] ?? []).map(sourceLabel);
    const sub = [labels.length ? `출처 항목: ${labels.join(' + ')}` : null, region.notes[code]].filter(Boolean).join(' · ');
    cbody.append(
      el(
        'tr',
        {},
        el('td', { class: 'text' }, critic.name, sub ? el('span', { class: 'sub', text: sub }) : null),
        el('td', { text: stats ? String(stats.n) : '–' }),
        el('td', { text: stats ? fmt(stats.mean, 2) : '–' }),
        el('td', { text: stats ? fmt(stats.sd, 2) : '–' }),
      ),
    );
  }
  cbody.append(
    el(
      'tr',
      {},
      el('td', { class: 'text muted', text: '전체 (보정 기준)' }),
      el('td', { class: 'muted', text: '' }),
      el('td', { class: 'muted', text: fmt(region.pooled.mean, 2) }),
      el('td', { class: 'muted', text: fmt(region.pooled.sd, 2) }),
    ),
  );
  critics.append(cbody);

  const codes = Object.keys(chart.critics).filter((c) => c in region.critics);
  const years = el('table', { class: 'plain' });
  years.append(
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { text: '빈티지' }),
        el('th', { text: '점수' }),
        el('th', { text: '순위' }),
        ...codes.map((c) => el('th', { text: `${c} 원점수 → 보정`, title: chart.critics[c].name })),
        el('th', { class: 'text', text: '상태' }),
      ),
    ),
  );
  const ybody = el('tbody');
  for (const year of chart.years) {
    const y = region.years[year];
    if (y.status === 'none') continue;
    ybody.append(
      el(
        'tr',
        { class: year === state.year ? 'picked' : '', 'data-year': year },
        el('td', { text: String(year) }),
        el('td', { text: fmt(y.score, 2) }),
        el('td', { text: y.rank == null ? '–' : String(y.rank) }),
        ...codes.map((c) =>
          el('td', {
            class: y.raw[c] == null ? 'muted' : '',
            text: y.raw[c] == null ? '–' : `${fmtRaw(y.raw[c])} → ${fmt(y.adjusted[c])}`,
          }),
        ),
        el('td', { class: 'text' }, y.status === 'full' ? null : el('span', { class: `badge ${y.status}`, text: `${STATUS_LABEL[y.status]} ${y.n}/${y.of}` })),
      ),
    );
  }
  years.append(ybody);

  box.replaceChildren(
    head,
    el(
      'div',
      { class: 'detail-grid' },
      el('div', {}, el('h3', { text: '평론지별 기준' }), el('div', { class: 'scroller' }, critics)),
      el('div', {}, el('h3', { text: '빈티지별 점수' }), el('div', { class: 'scroller years-scroll' }, years)),
    ),
  );
  if (state.year) box.querySelector('tr.picked')?.scrollIntoView({ block: 'nearest' });
}

function renderRevisions() {
  const list = chart.revisions ?? [];
  $('revisions').hidden = list.length === 0;
  if (!list.length) return;
  const table = $('revisions-table');
  const body = el('tbody');
  for (const r of list) {
    body.append(
      el(
        'tr',
        {},
        el('td', { text: r.date }),
        el('td', { class: 'text', text: `${chart.critics[r.critic]?.name ?? r.critic} · ${sourceLabel(r.label)}` }),
        el('td', { text: String(r.year) }),
        el('td', { text: `${fmtRaw(r.from)} → ${fmtRaw(r.to)}` }),
      ),
    );
  }
  table.replaceChildren(
    el('thead', {}, el('tr', {}, el('th', { text: '확인일' }), el('th', { class: 'text', text: '평론지 · 항목' }), el('th', { text: '빈티지' }), el('th', { text: '점수' }))),
    body,
  );
}

function select(regionId, year, scroll) {
  state.regionId = regionId;
  state.year = year;
  renderChart();
  renderDetail();
  if (scroll) $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setMode(mode) {
  state.mode = mode;
  $('mode-score').setAttribute('aria-pressed', String(mode === 'score'));
  $('mode-rank').setAttribute('aria-pressed', String(mode === 'rank'));
  renderChart();
}

async function start() {
  const res = await fetch('data/chart.json');
  if (!res.ok) throw new Error(`data/chart.json: HTTP ${res.status}`);
  chart = await res.json();
  state.regionId = chart.regions[0]?.id ?? null;
  $('mode-score').addEventListener('click', () => setMode('score'));
  $('mode-rank').addEventListener('click', () => setMode('rank'));
  $('scroller').addEventListener('scroll', hideTip, { passive: true });
  window.addEventListener('scroll', hideTip, { passive: true });
  $('search').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderSheet();
  });
  window.addEventListener('hashchange', showView);
  renderSources();
  renderLegend();
  renderChart();
  renderDetail();
  renderRevisions();
  renderSheet();
  showView();
}

start().catch((err) => {
  $('chart').replaceChildren();
  $('detail').replaceChildren(el('p', { class: 'note', text: `차트 데이터를 불러오지 못했습니다. (${err.message})` }));
});

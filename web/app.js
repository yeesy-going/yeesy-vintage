// Renders web/data/chart.json as one sheet with a search box. All text goes in via textContent.

const COUNTRY_KO = {
  France: '프랑스', Italy: '이탈리아', Spain: '스페인', Portugal: '포르투갈', Germany: '독일',
  Austria: '오스트리아', US: '미국 USA America', Argentina: '아르헨티나', Chile: '칠레',
  Australia: '호주', 'New Zealand': '뉴질랜드', 'South Africa': '남아공 남아프리카',
};

let chart;
let query = '';

const $ = (id) => document.getElementById(id);
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

// ---- Search -------------------------------------------------------------------------

// Korean spellings of foreign wine names vary mostly in how hard a consonant is written
// (뽀이약 / 포이약, 까베르네 / 카베르네, 샤또 / 샤토), in ㅐ / ㅔ, and in whether a vowel
// gets a y-glide (소비뇽 / 쇼비뇽, 포이약 / 포이악). Fold those together.
const INITIAL = { 1: 0, 15: 0, 4: 3, 16: 3, 8: 7, 17: 7, 10: 9, 13: 12, 14: 12 }; // ㄲㅋ→ㄱ ㄸㅌ→ㄷ ㅃㅍ→ㅂ ㅆ→ㅅ ㅉㅊ→ㅈ
const MEDIAL = { 1: 5, 3: 5, 7: 5, 10: 15, 11: 15, 2: 0, 6: 4, 12: 8, 17: 13 }; // ㅐㅒㅖ→ㅔ ㅙㅚ→ㅞ ㅑ→ㅏ ㅕ→ㅓ ㅛ→ㅗ ㅠ→ㅜ
function foldHangul(text) {
  return text.replace(/[가-힣]/g, (ch) => {
    const code = ch.charCodeAt(0) - 0xac00;
    const initial = Math.floor(code / 588);
    const medial = Math.floor((code % 588) / 28);
    const final = code % 28;
    return String.fromCharCode(0xac00 + (INITIAL[initial] ?? initial) * 588 + (MEDIAL[medial] ?? medial) * 28 + final);
  });
}

// "Médoc", "medoc" and "MEDOC" are the same word, and so are "Saint-Émilion",
// "St. Emilion" and "st emilion".
export function normalize(text) {
  const plain = String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC') // put Hangul syllables back together
    .toLowerCase()
    .replace(/\bsainte?\b/g, 'st')
    .replace(/[^a-z0-9ㄱ-ㆎ가-힣]+/g, '');
  return foldHangul(plain);
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

/** null when the region does not match; otherwise the alias that matched ('' if the name did). */
function match(region, text) {
  const tokens = text.split(/\s+/).map(normalize).filter(Boolean);
  if (!tokens.length) return '';
  const terms = region.terms ?? (region.terms = searchTerms(region).map((t) => [t, normalize(t)]));
  // Prefer the tightest match, so "마고" shows "마고" rather than "샤또 마고".
  const find = (token) => terms.filter(([, n]) => n.includes(token)).sort((a, b) => a[1].length - b[1].length)[0];
  const shown = (hit, token) => {
    const obvious = [region.name, region.country, COUNTRY_KO[region.country]].includes(hit[0]);
    return obvious || normalize(region.name).includes(token) ? '' : hit[0];
  };
  // The whole phrase first ("까베르네 소비뇽" as one term), then word by word.
  const whole = normalize(text);
  const phrase = find(whole);
  if (phrase) return shown(phrase, whole);
  let via = '';
  for (const token of tokens) {
    const hit = find(token);
    if (!hit) return null;
    via ||= shown(hit, token);
  }
  return via;
}

// ---- The sheet ------------------------------------------------------------------------

const fmt = (v) => (v == null ? '' : v.toFixed(1));

function render() {
  const head = el(
    'tr',
    {},
    el('th', { class: 'col-country', scope: 'col' }),
    el('th', { class: 'col-region sheet-title', scope: 'col', text: '산지' }),
    ...chart.years.map((year) => el('th', { scope: 'col', text: String(year) })),
  );
  const hits = chart.regions.map((region) => [region, match(region, query)]).filter(([, via]) => via !== null);
  $('search-count').textContent = query.trim() ? `${chart.regions.length}개 산지 중 ${hits.length}개` : '';

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
    const ranks = el(
      'tr',
      { class: 'ranks' },
      el('th', { class: 'col-region', text: region.top.map((y) => String(y).slice(2)).join(', ') }),
    );
    for (const year of chart.years) {
      const y = region.years[year];
      const title = y.status === 'provisional' ? `평론지 ${y.of}곳 중 ${y.n}곳만 평가 (잠정)` : null;
      scores.append(el('td', { class: y.status, title, text: fmt(y.score) }));
      ranks.append(el('td', { text: y.rank == null ? '' : String(y.rank) }));
    }
    body.append(scores, ranks);
  });
  if (!hits.length) {
    body.append(
      el(
        'tr',
        {},
        el('td', {
          class: 'empty',
          colspan: chart.years.length + 2,
          text: `"${query.trim()}"에 맞는 산지가 없습니다. 산지, 마을, 품종, 생산자, 나라 이름으로 찾아보세요.`,
        }),
      ),
    );
  }
  $('sheet').replaceChildren(el('thead', {}, head), body);
}

async function start() {
  const res = await fetch('data/chart.json');
  if (!res.ok) throw new Error(`data/chart.json: HTTP ${res.status}`);
  chart = await res.json();
  $('search').addEventListener('input', (e) => {
    query = e.target.value;
    render();
  });
  render();
}

if (typeof document !== 'undefined') {
  start().catch((err) => {
    $('sheet').replaceChildren(
      el('tbody', {}, el('tr', {}, el('td', { class: 'empty', text: `차트 데이터를 불러오지 못했습니다. (${err.message})` }))),
    );
  });
}

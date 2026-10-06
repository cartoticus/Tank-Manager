'use strict';
/* Tank Manager PWA v1.2
 * Reads tank_water_log.csv (fixed 22-column schema) and shows status,
 * recommendation, latest readings (tap a tile for a detail card), trend charts, and the test log.
 */

const SCHEMA = ('date,time,tank_id,cycle_day,temp_f,ph,ammonia_ppm,nitrite_ppm,nitrate_ppm,' +
  'gh_ppm,kh_ppm,free_chlorine_ppm,nacl_ppm,test_method,dose_product,dose_ml,' +
  'water_change_pct,plant_count,fish_count,observations,status,recommendation').split(',');

const CSV_URL = 'tank_water_log.csv';
const STORE_KEY = 'tank_csv_v1';

/* Thresholds from the project instructions (freshwater, fish present).
 * okLow/okHigh = green "normal" lines. dangerLow/dangerHigh = red "danger" lines.
 * cycleDangerHigh = danger line used during a fishless cycle (fish_count = 0). */
const PARAMS = [
  { key: 'temp_f', label: 'Temperature', desc: 'Water temperature', unit: '°F', okLow: 76, okHigh: 80, dangerLow: 74, dangerHigh: 82 },
  { key: 'ph', label: 'pH', desc: 'Acid / base balance', unit: '', okLow: 6.5, okHigh: 7.8, dangerLow: 6.0, dangerHigh: 8.2 },
  { key: 'ammonia_ppm', label: 'Ammonia', desc: 'Fish waste - toxic', unit: 'ppm', okHigh: 0, dangerHigh: 0.5, cycleDangerHigh: 4 },
  { key: 'nitrite_ppm', label: 'Nitrite', desc: 'Breakdown of ammonia - toxic', unit: 'ppm', okHigh: 0, dangerHigh: 0.5, cycleDangerHigh: 5 },
  { key: 'nitrate_ppm', label: 'Nitrate', desc: 'End product - remove with water changes', unit: 'ppm', okHigh: 20, dangerHigh: 40 },
  { key: 'kh_ppm', label: 'Alkalinity (KH)', desc: 'Carbonate hardness - keeps pH steady', unit: 'ppm', okLow: 60, dangerLow: 40 },
  { key: 'gh_ppm', label: 'Water hardness (GH)', desc: 'General hardness - calcium and magnesium', unit: 'ppm' },
  { key: 'free_chlorine_ppm', label: 'Free chlorine', desc: 'From tap water - toxic', unit: 'ppm', okHigh: 0 },
  { key: 'nacl_ppm', label: 'Salt (NaCl)', desc: 'Aquarium salt level', unit: 'ppm' }
];

/* Plain-language explainers shown when a reading tile is tapped (v1.2).
 * Each entry: lead, what, ideal, low, high, why, fix. low/high may be omitted. */
const INFO = {
  temp_f: {
    lead: 'How warm the water is. Fish are cold-blooded, so temperature sets their metabolism, appetite, and immune system.',
    ideal: '76–80°F for a tropical community tank. Zebra danios do best at the cooler end (about 72–77°F). Platys are happy from 70–80°F.',
    low: 'Below 74°F fish slow down, eat less, and get sick more easily. The good bacteria also work slower, so cycling takes longer.',
    high: 'Above 82°F the water holds less oxygen and fish breathe faster. Ammonia also gets more toxic as the water warms.',
    why: 'A steady temperature matters as much as the number. Swings of more than 2–3°F in a day stress fish.',
    fix: 'Adjust the heater a little at a time. Match new water to the tank temperature on water changes.'
  },
  ph: {
    lead: 'How acidic or alkaline the water is. 7 is neutral; lower is more acidic, higher is more alkaline.',
    ideal: '6.5–7.8 for most community fish. Platys prefer the higher end (7.0–8.0). Zebra danios are fine from 6.5–7.5.',
    low: 'Below 6.5 the good bacteria slow down and the cycle can stall. Below 6.0 they can nearly stop, and fish get stressed.',
    high: 'Above 8.2 most community fish are stressed, and any ammonia in the water becomes much more toxic.',
    why: 'Sudden pH swings hurt fish more than a steady number that is a little off. KH (alkalinity) is what holds pH steady.',
    fix: 'Raise it slowly with water changes using your tap water, which carries more buffer. Fix KH rather than using pH-up chemicals.'
  },
  ammonia_ppm: {
    lead: 'Toxic waste from fish gills, poop, and uneaten food. In a cycled tank, bacteria turn it into nitrite within hours.',
    ideal: '0 ppm with fish in the tank.',
    high: '0.25 ppm: do a 25% water change that day. 0.5 ppm or more: 50% change and retest the next morning. Ammonia burns gills and can kill fish quickly.',
    why: 'It is the first sign the bacteria cannot keep up. Common in new tanks, after overfeeding, or after a fish dies. It is more toxic at higher pH and temperature.',
    fix: 'Feed less, do a water change, and dose a conditioner that binds ammonia (Fraction).'
  },
  nitrite_ppm: {
    lead: 'What bacteria turn ammonia into. A second group of bacteria then turns nitrite into nitrate.',
    ideal: '0 ppm with fish in the tank.',
    high: '0.25 ppm: 25% water change that day. 0.5 ppm or more: 50% change. Nitrite stops fish blood from carrying oxygen, so fish gasp at the surface.',
    why: 'During a cycle, nitrite usually rises after ammonia. When ammonia and nitrite both read 0 for about a week, the tank is cycled.',
    fix: 'Water change, then dose conditioner. Feed lightly until it comes back to 0.'
  },
  nitrate_ppm: {
    lead: 'The end product of the nitrogen cycle. Much less toxic than ammonia or nitrite, but it builds up over time.',
    ideal: 'Under 20 ppm. Some nitrate is a good sign: it means the bacteria are doing their job.',
    low: '0 is fine. In a cycled tank with fish it usually reads above 0.',
    high: '20–40 ppm: plan a water change. Above 40 ppm: long-term stress, algae, and weaker immune systems.',
    why: 'Rising nitrate during a cycle tells you the whole chain is working.',
    fix: 'Regular water changes and live plants keep it down.'
  },
  kh_ppm: {
    lead: 'Carbonate hardness: the carbonate and bicarbonate in the water. It acts as a shield that soaks up acid and keeps pH from crashing.',
    ideal: '70–140 ppm (4–8 dKH) for a community tank. 60 ppm or more is OK.',
    low: 'Below 60 ppm: watch closely. Below 40 ppm (about 2 dKH): risk of a sudden pH crash that can stress or kill fish.',
    high: 'Above about 215 ppm (12 dKH) pH stays very stable, but soft-water fish can be stressed.',
    why: 'The good bacteria use up KH as they work, and plant soil and driftwood pull it down too. When KH runs out, pH can drop fast.',
    fix: 'Water changes with tap water raise it. A small bag of crushed coral in the filter adds slow, steady KH.'
  },
  gh_ppm: {
    lead: 'General hardness: the calcium and magnesium dissolved in the water. Fish use these minerals for bones, scales, and body chemistry.',
    ideal: 'Depends on the fish. Zebra danios: about 90–340 ppm (5–19 dGH). Platys like harder water: about 180 ppm (10 dGH) or more.',
    low: 'Very soft water (under about 70 ppm / 4 dGH) can stress livebearers like platys over time.',
    high: 'Very hard water is rarely a problem for danios or platys.',
    why: 'GH does not set pH directly, but steady mineral levels keep fish healthy. Plant soil can lower it.',
    fix: 'Water changes with harder tap water raise it.'
  },
  free_chlorine_ppm: {
    lead: 'The disinfectant added to city tap water.',
    ideal: '0 ppm in the tank, always.',
    high: 'Anything above 0 burns gills and kills the good bacteria in the filter.',
    why: 'Every water change brings chlorine in unless the new water is treated.',
    fix: 'Dose conditioner for the full tank volume on every water change (Fraction: 4 ml for 40 gallons).'
  },
  nacl_ppm: {
    lead: 'Aquarium salt (sodium chloride). Not needed in a normal freshwater tank.',
    ideal: '0 ppm unless you are treating a disease.',
    high: 'Salt left in long-term can stress plants and some fish. Use it only as a short treatment.',
    why: 'Sometimes used short-term to treat illness or to protect fish from nitrite.',
    fix: 'Water changes remove it.'
  }
};

const DETAIL_DAYS = 14;
let OPEN_DETAIL = null;

const TANK_KEY = 'tank_selected_v1';
let STATE = { recs: [], problems: [], source: '' };

const RANK = { OK: 0, WATCH: 1, ACTION: 2 };

/* ---------- Data ---------- */

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  text = String(text).replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(x => x !== '')) rows.push(row);
  return rows;
}

function toRecords(rows) {
  if (!rows.length) throw new Error('The CSV file is empty.');
  const header = rows[0].map(h => h.trim());
  const problems = [];
  const exact = header.length === SCHEMA.length && header.every((h, i) => h === SCHEMA[i]);
  if (!exact) {
    const missing = SCHEMA.filter(h => !header.includes(h));
    const extra = header.filter(h => !SCHEMA.includes(h));
    let msg = 'The CSV header does not match the 22-column schema.';
    if (missing.length) msg += ' Missing: ' + missing.join(', ') + '.';
    if (extra.length) msg += ' Unexpected: ' + extra.join(', ') + '.';
    if (!missing.length && !extra.length) msg += ' Columns are out of order.';
    problems.push(msg);
  }
  const idx = {};
  header.forEach((h, i) => { idx[h] = i; });
  const recs = [];
  rows.slice(1).forEach((r, n) => {
    if (r.length !== header.length) {
      problems.push(`Row ${n + 2} has ${r.length} columns (expected ${header.length}).`);
    }
    const o = {};
    SCHEMA.forEach(k => { o[k] = idx[k] !== undefined ? String(r[idx[k]] ?? '').trim() : ''; });
    o._ts = new Date(`${o.date}T${o.time || '00:00'}`).getTime();
    if (isNaN(o._ts)) problems.push(`Row ${n + 2} has an unreadable date/time.`);
    o.status = o.status.toUpperCase();
    recs.push(o);
  });
  recs.sort((a, b) => a._ts - b._ts);
  return { recs, problems };
}

function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isFishless(rec) {
  return num(rec.fish_count) === 0;
}

/* Per-parameter status using the project thresholds and fishless-cycle rules. */
function paramStatus(key, v, fishless) {
  if (v == null) return null;
  switch (key) {
    case 'temp_f': return (v < 74 || v > 82) ? 'ACTION' : (v < 76 || v > 80) ? 'WATCH' : 'OK';
    case 'ph': return (v < 6.0 || v > 8.2) ? 'ACTION' : (v < 6.5 || v > 7.8) ? 'WATCH' : 'OK';
    case 'ammonia_ppm':
      if (fishless) return (v === 0 || v > 4) ? 'ACTION' : 'WATCH';
      return v >= 0.5 ? 'ACTION' : v > 0 ? 'WATCH' : 'OK';
    case 'nitrite_ppm':
      if (fishless) return v > 5 ? 'ACTION' : v > 0 ? 'WATCH' : 'OK';
      return v >= 0.5 ? 'ACTION' : v > 0 ? 'WATCH' : 'OK';
    case 'nitrate_ppm': return v > 40 ? 'ACTION' : v >= 20 ? 'WATCH' : 'OK';
    case 'kh_ppm': return v < 40 ? 'ACTION' : v < 60 ? 'WATCH' : 'OK';
    case 'free_chlorine_ppm': return v > 0 ? 'ACTION' : 'OK';
    default: return null;
  }
}

function worstStatus(rec) {
  const fishless = isFishless(rec);
  let worst = null;
  PARAMS.forEach(p => {
    const s = paramStatus(p.key, num(rec[p.key]), fishless);
    if (s && (worst == null || RANK[s] > RANK[worst])) worst = s;
  });
  return worst;
}

function daysBetween(a, b) {
  return Math.floor((b - a) / 86400000);
}

/* ---------- Chart ---------- */

function fmt(v) {
  if (v == null) return '–';
  return Math.abs(v) >= 100 ? String(Math.round(v)) : String(+v.toFixed(2));
}

function chartSVG(p, points, fishless) {
  const W = 340, H = 170, L = 34, R = 12, T = 12, B = 24;
  const vals = points.map(d => d.v);
  const ok = [p.okLow, p.okHigh].filter(x => x != null);
  const dHigh = fishless && p.cycleDangerHigh != null ? p.cycleDangerHigh : p.dangerHigh;
  const danger = [p.dangerLow, dHigh].filter(x => x != null);
  const avg = vals.length > 1 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;

  const all = vals.concat(ok, danger);
  let lo = Math.min(...all), hi = Math.max(...all);
  const floor0 = lo >= 0;
  if (hi === lo) { hi = hi + 1; lo = lo - 1; }
  const pad = (hi - lo) * 0.12;
  hi += pad; lo -= pad;
  if (floor0 && lo < 0) lo = 0;

  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const x = t => (t1 === t0) ? (L + (W - L - R) / 2) : L + (t - t0) / (t1 - t0) * (W - L - R);
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${p.label} trend">`;
  s += `<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--line)"/>`;

  const hline = (v, color, dash, label) => {
    const yy = y(v).toFixed(1);
    s += `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" stroke="${color}" stroke-width="1.5" stroke-dasharray="${dash}"/>`;
    s += `<text x="${L - 4}" y="${(+yy + 3).toFixed(1)}" text-anchor="end">${label}</text>`;
  };
  ok.forEach(v => hline(v, 'var(--ok)', '5 4', fmt(v)));
  danger.forEach(v => hline(v, 'var(--action)', '', fmt(v)));
  if (avg != null) hline(avg, 'var(--avg)', '2 3', '');

  if (points.length > 1) {
    const pts = points.map(d => `${x(d.t).toFixed(1)},${y(d.v).toFixed(1)}`).join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="var(--series)" stroke-width="2" stroke-linejoin="round"/>`;
  }
  points.forEach(d => {
    const st = paramStatus(p.key, d.v, d.fishless);
    const col = st === 'ACTION' ? 'var(--action)' : st === 'WATCH' ? 'var(--watch)' : 'var(--series)';
    s += `<circle cx="${x(d.t).toFixed(1)}" cy="${y(d.v).toFixed(1)}" r="4" fill="${col}" stroke="var(--card)" stroke-width="1.5"><title>${d.label}: ${fmt(d.v)} ${p.unit}</title></circle>`;
  });

  const dl = d => d.label.slice(5, 10);
  s += `<text x="${L}" y="${H - 6}">${dl(points[0])}</text>`;
  if (points.length > 1) s += `<text x="${W - R}" y="${H - 6}" text-anchor="end">${dl(points[points.length - 1])}</text>`;
  s += '</svg>';
  return s;
}

/* ---------- Render ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function badge(s) {
  const cls = RANK[s] != null ? s : 'NONE';
  return `<span class="badge ${cls}">${esc(s || '—')}</span>`;
}

/* Group rows by tank_id. Tanks are ordered by most recent test first. */
function groupTanks(recs) {
  const map = new Map();
  recs.forEach(r => {
    const id = r.tank_id || 'Unnamed tank';
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(r);
  });
  return [...map.entries()]
    .map(([id, rows]) => ({ id, rows, last: rows[rows.length - 1] }))
    .sort((a, b) => b.last._ts - a.last._ts);
}

function savedTank() {
  try { return localStorage.getItem(TANK_KEY); } catch (e) { return null; }
}

function selectTank(id) {
  try { localStorage.setItem(TANK_KEY, id); } catch (e) { /* storage unavailable */ }
  render(STATE, STATE.source);
  window.scrollTo(0, 0);
}

function render(data, sourceText) {
  const $ = id => document.getElementById(id);
  STATE = { recs: data.recs, problems: data.problems, source: sourceText };
  const { problems } = data;

  // Tank switcher (shown when the log has more than one tank_id)
  const tanks = groupTanks(data.recs);
  const want = savedTank();
  const current = tanks.find(t => t.id === want) || tanks[0];
  const recs = current ? current.rows : [];
  const sw = $('tankSwitch');
  if (tanks.length > 1) {
    sw.hidden = false;
    sw.innerHTML = tanks.map(t => {
      const s = RANK[t.last.status] != null ? t.last.status : 'NONE';
      const on = t.id === current.id;
      return `<button class="chip${on ? ' on' : ''}" data-tank="${esc(t.id)}" aria-pressed="${on}"><i class="dot ${s}"></i>${esc(t.id)}</button>`;
    }).join('');
    sw.querySelectorAll('button').forEach(b => b.addEventListener('click', () => selectTank(b.dataset.tank)));
  } else { sw.hidden = true; sw.innerHTML = ''; }

  const warn = $('warnings');
  if (problems.length) {
    warn.hidden = false;
    warn.innerHTML = `<div class="card"><b>Data problem</b>${problems.map(p => `<p>${esc(p)}</p>`).join('')}</div>`;
  } else { warn.hidden = true; warn.innerHTML = ''; }

  $('source').textContent = sourceText;

  if (!recs.length) {
    ['statusCard', 'readingsSection', 'chartsSection', 'logSection'].forEach(id => { $(id).hidden = true; });
    $('empty').hidden = false;
    $('tankSub').textContent = 'No tests logged yet';
    return;
  }
  $('empty').hidden = true;

  const last = recs[recs.length - 1];
  const fishless = isFishless(last);

  // Header
  $('tankTitle').textContent = last.tank_id || 'Tank';
  const parts = [];
  if (last.cycle_day) parts.push(`Cycle day ${last.cycle_day}`);
  parts.push(fishless ? 'Fishless cycle' : `${last.fish_count || '?'} fish`);
  const wc = recs.filter(r => num(r.water_change_pct) > 0);
  parts.push(wc.length ? `Water change ${daysBetween(wc[wc.length - 1]._ts, Date.now())}d ago` : 'No water change logged');
  $('tankSub').textContent = parts.join(' · ');

  // Status + recommendation
  const st = RANK[last.status] != null ? last.status : 'NONE';
  const computed = worstStatus(last);
  let html = `<div class="row"><span class="muted small">Last test ${esc(last.date)} ${esc(last.time)} · ${esc(last.test_method || 'method not logged')}</span>${badge(last.status)}</div>`;
  html += `<p class="rec">${esc(last.recommendation || 'No recommendation logged.')}</p>`;
  if (last.dose_product) html += `<p class="small muted">Dose: ${esc(last.dose_product)}${last.dose_ml ? ' · ' + esc(last.dose_ml) + ' ml' : ''}</p>`;
  if (computed && last.status && computed !== last.status) {
    html += `<div class="note">App check: the readings work out to ${computed}, but the log says ${esc(last.status)}. Ask Joseph to review.</div>`;
  }
  const card = $('statusCard');
  card.className = `card status-card ${st}`;
  card.innerHTML = html;
  card.hidden = false;

  // Latest readings
  $('readings').innerHTML = PARAMS.map(p => {
    const v = num(last[p.key]);
    if (v == null) {
      // Skipped on the latest test but logged before: show a dimmed tile so its history stays one tap away.
      if (!recs.some(r => num(r[p.key]) != null)) return '';
      return `<button type="button" class="tile skipped" data-key="${p.key}" aria-label="${esc(p.label)} not tested on latest test, details"><div class="lbl">${esc(p.label)}</div><div class="val">– <span class="unit">not tested</span></div><div class="desc">${esc(p.desc)}</div></button>`;
    }
    const s = paramStatus(p.key, v, fishless) || '';
    return `<button type="button" class="tile ${s}" data-key="${p.key}" aria-label="${esc(p.label)} ${fmt(v)} ${esc(p.unit)}, details"><div class="lbl">${esc(p.label)}</div><div class="val">${fmt(v)} <span class="unit">${esc(p.unit)}</span></div><div class="desc">${esc(p.desc)}</div></button>`;
  }).join('');
  $('readings').querySelectorAll('.tile').forEach(b => b.addEventListener('click', () => openDetail(b.dataset.key)));
  $('readingsSection').hidden = false;
  STATE.current = recs;

  // Charts
  $('charts').innerHTML = PARAMS.map(p => {
    const points = recs
      .map(r => ({ t: r._ts, v: num(r[p.key]), label: `${r.date} ${r.time}`, fishless: isFishless(r) }))
      .filter(d => d.v != null && !isNaN(d.t));
    if (!points.length) return '';
    const lastV = points[points.length - 1].v;
    let trend = '';
    if (points.length > 1) {
      const prev = points[points.length - 2].v;
      trend = lastV > prev ? ' ↑' : lastV < prev ? ' ↓' : ' →';
    }
    let hint = '';
    if (fishless && (p.key === 'ammonia_ppm' || p.key === 'nitrite_ppm')) {
      hint = `<p class="hint">Fishless cycle: up to ${p.cycleDangerHigh} ppm is expected while bacteria grow.</p>`;
    }
    return `<div class="card chart"><div class="chart-head"><b>${esc(p.label)}</b><span>${fmt(lastV)} ${esc(p.unit)}${trend}</span></div><p class="hint">${esc(p.desc)}</p>${hint}${chartSVG(p, points, fishless)}</div>`;
  }).join('');
  $('chartsSection').hidden = false;

  // Log (newest first)
  $('log').innerHTML = recs.slice().reverse().map(r => {
    const meta = [];
    if (r.cycle_day) meta.push(`Day ${esc(r.cycle_day)}`);
    if (r.dose_product) meta.push(`${esc(r.dose_product)}${r.dose_ml ? ' ' + esc(r.dose_ml) + ' ml' : ''}`);
    if (num(r.water_change_pct) > 0) meta.push(`${esc(r.water_change_pct)}% water change`);
    return `<li><div class="when"><span>${esc(r.date)} ${esc(r.time)}</span>${badge(r.status)}</div>` +
      (meta.length ? `<div class="meta">${meta.join(' · ')}</div>` : '') +
      (r.observations ? `<div class="obs">${esc(r.observations)}</div>` : '') + '</li>';
  }).join('');
  $('logSection').hidden = false;

  if (OPEN_DETAIL) fillDetail(OPEN_DETAIL);
}

/* ---------- Reading detail card (v1.2) ---------- */

function fillDetail(key) {
  const p = PARAMS.find(x => x.key === key);
  const info = INFO[key];
  if (!p || !info) return;
  const recs = STATE.current || [];
  const last = recs[recs.length - 1];
  const cutoff = Date.now() - DETAIL_DAYS * 86400000;
  const recent = recs.filter(r => !isNaN(r._ts) && r._ts >= cutoff);

  // Current value
  let now = '';
  const withVal = recs.filter(r => num(r[key]) != null);
  const latest = withVal[withVal.length - 1];
  if (latest) {
    const v = num(latest[key]);
    const st = paramStatus(key, v, isFishless(latest));
    let trend = '';
    if (withVal.length > 1) {
      const prev = num(withVal[withVal.length - 2][key]);
      trend = v > prev ? 'Up from ' + fmt(prev) : v < prev ? 'Down from ' + fmt(prev) : 'Same as last test';
    }
    const missing = last && last !== latest ? `<p class="small warn-text">Not recorded on the latest test (${esc(last.date)} ${esc(last.time)}).</p>` : '';
    now = `<div class="now ${st || ''}"><div><div class="lbl">Latest reading</div>` +
      `<div class="big">${fmt(v)} <span class="unit">${esc(p.unit)}</span></div>` +
      `<div class="small muted">${esc(latest.date)} ${esc(latest.time)}${trend ? ' · ' + trend : ''}</div></div>` +
      (st ? badge(st) : '') + `</div>${missing}`;
  } else {
    now = '<p class="muted">No readings logged yet.</p>';
  }

  // Explainer
  const items = [
    ['Ideal range', info.ideal],
    ['Too low', info.low],
    ['Too high', info.high],
    ['Why it matters', info.why],
    ['What to do', info.fix]
  ].filter(x => x[1]);
  const explain = `<ul class="explain">${items.map(([h, t]) => `<li><b>${h}:</b> ${esc(t)}</li>`).join('')}</ul>`;

  // 14-day chart
  const points = recent
    .map(r => ({ t: r._ts, v: num(r[key]), label: `${r.date} ${r.time}`, fishless: isFishless(r) }))
    .filter(d => d.v != null);
  const chart = points.length
    ? `<div class="chart">${chartSVG(p, points, last ? isFishless(last) : false)}</div>`
    : `<p class="muted small">No ${esc(p.label.toLowerCase())} readings in the last ${DETAIL_DAYS} days.</p>`;

  // 14-day table (newest first)
  const rows = recent.slice().reverse().map(r => {
    const v = num(r[key]);
    const st = v == null ? null : paramStatus(key, v, isFishless(r));
    return `<tr><td>${esc(r.date.slice(5))}</td><td>${esc(r.time)}</td>` +
      `<td class="num">${v == null ? '<span class="muted">not tested</span>' : fmt(v) + (p.unit ? ' ' + esc(p.unit) : '')}</td>` +
      `<td>${st ? badge(st) : ''}</td></tr>`;
  }).join('');
  const table = rows
    ? `<table class="dtable"><thead><tr><th>Date</th><th>Time</th><th class="num">Reading</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`
    : '';

  document.getElementById('detailTitle').textContent = p.label;
  document.getElementById('detailBody').innerHTML =
    `<p class="lead">${esc(info.lead)}</p>${now}` +
    `<h3>Understanding ${esc(p.label)}</h3>${explain}` +
    `<h3>Last ${DETAIL_DAYS} days</h3>` +
    `<div class="legend"><span><i class="sw ok"></i>Normal</span><span><i class="sw danger"></i>Danger</span><span><i class="sw avg"></i>Average</span></div>` +
    chart + table +
    '<button type="button" class="btn close-wide" data-close>Close</button>';
  document.querySelectorAll('#detailBody [data-close]').forEach(b => b.addEventListener('click', closeDetail));
}

function openDetail(key) {
  OPEN_DETAIL = key;
  fillDetail(key);
  const wrap = document.getElementById('detail');
  wrap.hidden = false;
  document.body.classList.add('noscroll');
  document.getElementById('detailBody').scrollTop = 0;
  try { history.pushState({ detail: key }, ''); } catch (e) { /* ignore */ }
  document.getElementById('detailClose').focus();
}

function hideDetail() {
  OPEN_DETAIL = null;
  document.getElementById('detail').hidden = true;
  document.body.classList.remove('noscroll');
}

/* Close button / backdrop / Escape. Uses history so the phone's Back button also closes it. */
function closeDetail() {
  if (history.state && history.state.detail) history.back();
  else hideDetail();
}

/* ---------- Loading ---------- */

function saveLocal(text) {
  try { localStorage.setItem(STORE_KEY, text); } catch (e) { /* storage unavailable */ }
}
function loadLocal() {
  try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; }
}

function show(text, sourceText) {
  try {
    render(toRecords(parseCSV(text)), sourceText);
  } catch (e) {
    render({ recs: [], problems: [e.message] }, sourceText);
  }
}

async function load() {
  try {
    const res = await fetch(CSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    saveLocal(text);
    show(text, 'Data: tank_water_log.csv from GitHub');
    return;
  } catch (e) { /* fall through to saved copy */ }
  const saved = loadLocal();
  if (saved) show(saved, 'Data: last loaded copy (offline or no CSV on GitHub)');
  else show('', 'Data: none loaded');
}

if (typeof document !== 'undefined') {
  document.getElementById('refreshBtn').addEventListener('click', load);
  document.getElementById('detailClose').addEventListener('click', closeDetail);
  document.getElementById('detail').addEventListener('click', e => { if (e.target.id === 'detail') closeDetail(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && OPEN_DETAIL) closeDetail(); });
  window.addEventListener('popstate', () => { if (OPEN_DETAIL) hideDetail(); });
  document.getElementById('fileInput').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      saveLocal(reader.result);
      show(reader.result, `Data: ${f.name} (loaded from phone)`);
    };
    reader.readAsText(f);
    e.target.value = '';
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  load();
}

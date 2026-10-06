'use strict';
/* Tank Manager PWA v1.1
 * Reads tank_water_log.csv (fixed 22-column schema) and shows status,
 * recommendation, latest readings, per-parameter trend charts, and the test log.
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
    if (v == null) return '';
    const s = paramStatus(p.key, v, fishless) || '';
    return `<div class="tile ${s}"><div class="lbl">${esc(p.label)}</div><div class="val">${fmt(v)} <span class="unit">${esc(p.unit)}</span></div><div class="desc">${esc(p.desc)}</div></div>`;
  }).join('');
  $('readingsSection').hidden = false;

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

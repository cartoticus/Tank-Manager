'use strict';
/* Tank Manager PWA v1.8
 * Reads tank_water_log.csv (fixed 22-column schema) and shows status,
 * recommendation, latest readings (tap a tile for its detail card and 14-day trend), and the test log.
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
  { key: 'ammonia_ppm', label: 'Ammonia nitrogen', desc: 'Fish waste - toxic', unit: 'ppm', okHigh: 0, dangerHigh: 0.5, cycleDangerHigh: 4 },
  { key: 'nitrite_ppm', label: 'Nitrite', desc: 'Breakdown of ammonia - toxic', unit: 'ppm', okHigh: 0, dangerHigh: 0.5, cycleDangerHigh: 5 },
  { key: 'nitrate_ppm', label: 'Nitrate', desc: 'End product - remove with water changes', unit: 'ppm', okHigh: 20, dangerHigh: 40 },
  { key: 'kh_ppm', label: 'Total Alkalinity (KH)', desc: 'Carbonate hardness - keeps pH steady', unit: 'ppm', okLow: 60, dangerLow: 40 },
  { key: 'gh_ppm', label: 'Hardness (GH)', desc: 'General hardness - calcium and magnesium', unit: 'ppm' },
  { key: 'free_chlorine_ppm', label: 'Free Chlorine', desc: 'From tap water - toxic', unit: 'ppm', okHigh: 0 },
  { key: 'nacl_ppm', label: 'Sodium Chloride (NaCl)', desc: 'Salt level', unit: 'ppm' }
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

/* Nitrogen cycle guide (v1.3). Opened from the Learn button in the header. */
const CYCLE_STEPS = [
  {
    key: 'ammonia_ppm', name: 'Ammonia', formula: 'NH₃ / NH₄⁺', tone: 'ACTION', tag: 'Step 1 · Toxic',
    role: 'The starting point. Every bit of waste in the tank breaks down into ammonia. It is the food for the first group of bacteria.',
    sources: [
      'Fish breathing it out through their gills (the biggest source)',
      'Fish poop',
      'Uneaten food rotting on the bottom',
      'Dead or melting plant leaves',
      'New plant soil, which can leak ammonia for its first few weeks',
      'A dead fish or snail hidden in the tank'
    ],
    note: 'At low pH most of it is in the milder ammonium form (NH₄⁺). As pH and temperature rise, more turns into the toxic form (NH₃).'
  },
  {
    key: 'nitrite_ppm', name: 'Nitrite', formula: 'NO₂⁻', tone: 'WATCH', tag: 'Step 2 · Toxic',
    role: 'The middle step. Bacteria make it from ammonia, and a second group of bacteria eats it. It only builds up when that second group cannot keep up.',
    sources: [
      'Made by ammonia-eating bacteria in the filter, sand, and on the driftwood',
      'Not normally in tap water'
    ],
    note: 'Nitrite stops fish blood from carrying oxygen. Fish with nitrite poisoning gasp at the surface.'
  },
  {
    key: 'nitrate_ppm', name: 'Nitrate', formula: 'NO₃⁻', tone: 'OK', tag: 'Step 3 · Much safer',
    role: 'The end product. Far less toxic, but it keeps building up because nothing in a normal tank breaks it down. You remove it.',
    sources: [
      'Made by nitrite-eating bacteria',
      'Some tap water (yours tested 0 on 10/04)',
      'Nutrient-rich plant soil can release some'
    ],
    note: 'Removed by water changes and soaked up by live plants as fertilizer.'
  }
];

/* How-to guides (v1.7). Opened from the How-to button in the header.
 * Written for T40-FW: 40 gal, Oase canister with built-in heater, plant soil under sand,
 * driftwood, tap water with chlorine, Continuum Fraction conditioner, Nite-Out II. */
const HOWTO = [
  {
    id: 'water-change', title: 'Do a 25% water change', time: '20–30 min',
    when: 'When a test calls for it (ammonia or nitrite 0.25 or more, KH under 60), and about once a week after the tank is cycled.',
    need: ['Siphon / gravel vac and a bucket (about 10 gal total for 25%)', 'Continuum Fraction (4 ml)', 'Thermometer, or your hand on the glass'],
    steps: [
      'Unplug the canister filter (the heater is built into it) so it does not suck air while the water is low.',
      'Siphon out about 10 gallons (25%). Hold the vac just above the sand and skim the surface. Do not push into the soil layer or near the root-tab spots.',
      'Pick up any dead leaves or uneaten food while the siphon is running.',
      'Run the new tap water at about the same temperature as the tank (within 2°F). Check it with your hand or a thermometer.',
      'Add 4 ml of Fraction to the tank. This treats the whole 40 gal, so do it even if you only change 25%. It takes care of chlorine from the tap.',
      'Refill slowly. Pour onto the driftwood or a plate so the sand is not stirred up.',
      'Plug the canister back in. Check that water is flowing and the heater is running.',
      'For a 50% change, do two 25% changes a few hours apart. A big change all at once makes pH jump.',
      'Tell the team how much you changed so it goes in the log.'
    ],
    tip: 'Never skip the Fraction. Your tap has chlorine, and chlorine kills the filter bacteria.'
  },
  {
    id: 'test', title: 'Test the water (strips)', time: '5 min',
    when: 'Every morning while the tank is cycling. Test before feeding and before dosing anything.',
    need: ['Test strips', 'Separate ammonia test', 'Clean cup', 'Phone timer'],
    steps: [
      'Take a sample from the middle of the tank in a clean cup, not right next to the filter outlet.',
      'Dip the strip as the box says (usually 1–2 seconds), then hold it flat. Do not shake it.',
      'Read each pad at the time the box says. Read in daylight or good white light; yellow kitchen light shifts the colors.',
      'If a color falls between two pads, write both (for example "40–80"). The team will log a value in between. Nitrite jumps from 0 straight to 1 on this strip, so any pink at all means nitrite is present.',
      'Run the ammonia test as its own instructions say.',
      'Read the thermometer.',
      'Send everything to the team, using the names on the strip: Free Chlorine, Nitrate, Nitrite, Hardness (GH), Total Alkalinity (KH), pH, Sodium Chloride, Ammonia nitrogen, plus the temperature. Total Alkalinity matters every time right now.'
    ],
    tip: 'Strips are rough. A liquid kit (like the API Freshwater Master Kit) tells 0.25 from 0.5 much better.'
  },
  {
    id: 'nite-out', title: 'Dose Nite-Out II', time: '1 min',
    when: 'Once a day while cycling, after testing and after any water change.',
    need: ['Microbe-Lift Nite-Out II', 'Measuring cup or syringe'],
    steps: [
      'Shake the bottle.',
      'Measure 20 ml.',
      'Pour it near the filter intake so it gets pulled into the canister, where the bacteria live.',
      'Leave the filter running. The bacteria need oxygen.'
    ],
    tip: 'Do not dose it right before a water change, or you siphon half of it out.'
  },
  {
    id: 'spike', title: 'Ammonia or nitrite spike', time: 'Same day',
    when: 'Ammonia or nitrite at 0.5 or higher, or fish gasping at the surface.',
    need: ['Continuum Fraction', 'Water change gear'],
    steps: [
      'Do not feed today.',
      'Dose 4 ml of Fraction right away. It locks up ammonia for about a day while you get ready. It does not remove nitrite.',
      'Do a 25% water change (see "Do a 25% water change").',
      'Wait a few hours, then do a second 25% change.',
      'Dose Nite-Out II after the second change.',
      'Retest the next morning. If it is still 0.5 or higher, repeat.',
      'If fish are gasping, lying on the bottom, or have red gills, do the first water change now. Do not wait.'
    ],
    tip: 'Water changes raise pH. At higher pH, ammonia turns more toxic, so always dose Fraction with the change.'
  },
  {
    id: 'kh', title: 'Raise KH (low KH)', time: '10 min + water change',
    when: 'KH under 60. Under 40 is urgent: pH can crash suddenly.',
    need: ['Crushed coral (about 1 cup)', 'Mesh media bag', 'Water change gear'],
    steps: [
      'Fast fix: do a 25% water change. Your tap is KH 180, so each change lifts the tank about 35–40.',
      'Long-term fix: rinse about 1 cup of crushed coral in a bucket of old tank water.',
      'Put it in a mesh bag and tie it shut.',
      'Turn off and open the canister (see "Rinse the canister media" for opening). Put the bag in a tray where water flows through it.',
      'Close it up, restart, and check for leaks.',
      'Test KH every morning. The coral works slowly over 1–2 weeks. If KH climbs over about 150, take some coral out.'
    ],
    tip: 'Your plant soil and the bacteria both use up KH, so it drops faster than in most tanks.'
  },
  {
    id: 'filter', title: 'Rinse the canister media', time: '20 min',
    when: 'Only when the flow is clearly weaker. Not while the tank is cycling unless flow has nearly stopped. Most of your bacteria live in there.',
    need: ['Bucket of OLD tank water (from a water change)', 'Towel'],
    steps: [
      'Siphon a bucket of tank water first. Do not use tap water: chlorine kills the bacteria.',
      'Unplug the canister (the heater is in it too).',
      'Close the hose valves or lift the hoses so the water stays in them, then disconnect.',
      'Open the canister and lift out the media trays.',
      'Swish the sponges and pads in the bucket and squeeze them a few times. They should still look a bit brown. Do not try to get them clean.',
      'Leave the biological media (rings or balls) alone, or just dunk them once.',
      'Put everything back the same way and reconnect the hoses.',
      'Plug it in. Check for leaks and air. Tilt or shake it gently to clear air bubbles.',
      'Check the heater is on and the temperature is right in an hour.'
    ],
    tip: 'Never replace all the media at once, and never let it dry out or sit switched off for more than an hour.'
  },
  {
    id: 'feed', title: 'Feed during the cycle', time: '1 min',
    when: 'Once a day. Skip days when ammonia or nitrite is 0.5 or higher.',
    need: ['Flake or micro pellet food'],
    steps: [
      'Feed after testing and dosing, not before.',
      'Drop in a small pinch, enough for 7 small fish.',
      'Watch for 1 minute. It should all be gone.',
      'If food reaches the bottom, use less next time. Remove leftovers with the siphon or a net.'
    ],
    tip: 'Every flake that is not eaten turns into ammonia. Underfeeding is safer than overfeeding right now.'
  },
  {
    id: 'plants', title: 'Plant care', time: '10–15 min',
    when: 'Weekly check. Trim when a plant reaches the surface or blocks light.',
    need: ['Long tweezers or tongs', 'Scissors', 'Root tabs (only every 2–3 months)'],
    steps: [
      'Pull off yellow, brown, or melting leaves at the base. Rotting leaves become ammonia.',
      'If a plant floated up, push the roots back into the sand with tweezers until the base is covered.',
      'Trim stem plants by cutting the top part off. You can replant the cuttings.',
      'Root tabs: push them deep into the sand next to the roots, fully covered. An exposed tab leaks nutrients and grows algae.',
      'Your soil is already rich, so the next root tabs are due around early 2027.',
      'Net out any floating bits after you trim.'
    ],
    tip: 'Some new plants "melt" (lose leaves) for a few weeks while they adjust. Remove the dead leaves; new ones usually grow back.'
  },
  {
    id: 'glass', title: 'Clean the glass', time: '5 min',
    when: 'When algae makes the glass hazy, usually weekly. Do it before a water change.',
    need: ['Algae scraper or magnet cleaner'],
    steps: [
      'Make sure no sand is stuck under the scraper. It will scratch the glass.',
      'Scrape the inside glass top to bottom.',
      'Do it right before a water change so the siphon picks up what falls off.',
      'Wipe the outside with a damp cloth. Do not spray glass cleaner near the tank.'
    ],
    tip: 'Lots of green on the glass usually means too much light or extra nutrients. Keep the light on about 8 hours a day.'
  },
  {
    id: 'new-fish', title: 'Add new fish', time: '45–60 min',
    when: 'Only after the tank is cycled (the app shows "Cycled"). Add a few at a time.',
    need: ['Bag of fish', 'Clean cup', 'Net'],
    steps: [
      'Test first. Ammonia and nitrite should both be 0.',
      'Turn the tank light off. It calms new fish.',
      'Float the sealed bag on the water for 15 minutes so the temperature matches.',
      'Open the bag. Add about half a cup of tank water to it every 5 minutes, 4–5 times.',
      'Net the fish into the tank. Do not pour store water into your tank.',
      'Leave the light off for the rest of the day and feed lightly.',
      'Test the next 2–3 mornings. New fish add waste, so ammonia can bump up.',
      'Tell the team the new fish count and species.'
    ],
    tip: 'Add no more than 3–4 small fish at a time and give the bacteria a week to catch up.'
  },
  {
    id: 'outage', title: 'Power outage', time: 'As needed',
    when: 'The filter and heater are off for more than an hour.',
    need: ['Bucket', 'Blanket or towel'],
    steps: [
      'Do not feed while the power is out.',
      'Wrap the tank in a blanket to hold heat.',
      'Every hour, scoop a cup of water and pour it back from a height to add oxygen.',
      'If the power was off more than 4–6 hours, the water inside the canister can go bad. Before restarting, rinse the media in tank water and dump the old water from inside the canister.',
      'When power returns, check the heater, then test ammonia and nitrite the next morning.'
    ],
    tip: 'A battery air pump is a cheap backup for longer outages.'
  }
];

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
    ['statusCard', 'readingsSection', 'logSection'].forEach(id => { $(id).hidden = true; });
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

/* Where the latest test puts the tank in the cycle. Plain language, no overclaiming. */
function cycleStageText(recs) {
  const last = recs[recs.length - 1];
  if (!last) return null;
  const a = num(last.ammonia_ppm), n = num(last.nitrite_ppm), no3 = num(last.nitrate_ppm), ph = num(last.ph);
  const day = last.cycle_day ? `Day ${esc(last.cycle_day)}` : 'Latest test';
  const fishless = isFishless(last);
  let stage, text;
  if (a == null && n == null) return null;
  if ((n || 0) > 0) {
    stage = 'Stage 2 · Nitrite rising';
    text = (a || 0) > 0
      ? 'Ammonia and nitrite are both showing. The first bacteria are working and the second group is still catching up.'
      : 'Ammonia is being handled and nitrite is showing. The nitrite-eating bacteria are still growing. Nitrite usually takes longest to clear.';
  } else if ((a || 0) > 0) {
    stage = 'Stage 1 · Ammonia rising';
    text = 'Ammonia is showing but no nitrite yet. The ammonia-eating bacteria are still growing.';
  } else if (fishless) {
    stage = 'Waiting';
    text = 'Ammonia and nitrite both read 0 with no fish. The bacteria need an ammonia source to grow.';
  } else {
    // Both 0 with fish in. Only call it cycled when the history proves it (v1.6):
    // a spike already happened (or the cycle is 4+ weeks old), then 7+ days of zeros with nitrate showing.
    const withN = recs.filter(r => num(r.ammonia_ppm) != null || num(r.nitrite_ppm) != null);
    const spiked = withN.some(r => (num(r.ammonia_ppm) || 0) > 0 || (num(r.nitrite_ppm) || 0) > 0);
    let lastSpike = -Infinity;
    withN.forEach(r => { if ((num(r.ammonia_ppm) || 0) > 0 || (num(r.nitrite_ppm) || 0) > 0) lastSpike = r._ts; });
    const zeros = withN.filter(r => r._ts > lastSpike);
    const zeroDays = zeros.length ? (zeros[zeros.length - 1]._ts - zeros[0]._ts) / 86400000 : 0;
    const dayNum = num(last.cycle_day) || 0;
    const nitrateShowing = (no3 || 0) > 0;
    if ((spiked || dayNum >= 28) && zeroDays >= 7 && nitrateShowing) {
      stage = 'Stage 3 · Cycled';
      text = 'Ammonia and nitrite have read 0 for at least a week while nitrate shows up. The bacteria are keeping up with the waste. Keep testing a few times a week and do regular water changes to control nitrate.';
    } else if (spiked) {
      stage = 'Stage 3 · Finishing';
      text = 'Ammonia and nitrite are back to 0 after showing earlier. The bacteria are catching up. Keep testing daily; once both stay at 0 for about a week with nitrate showing, the tank is cycled.';
    } else {
      stage = 'Stage 1 · Early cycle';
      text = 'Ammonia and nitrite still read 0 because waste has not built up faster than the young bacteria can handle yet. With fish in, ammonia usually shows up within the first week or two (new plant soil can bring it sooner). Keep testing daily so you catch it early.';
    }
  }
  const extra = [];
  if (ph != null && ph < 6.5) extra.push(`pH is ${fmt(ph)}. Below about 6.5 the bacteria slow down, so the cycle can take longer.`);
  const kh = num(last.kh_ppm);
  if (kh != null && kh < 60) extra.push(`KH is ${fmt(kh)} ppm. The bacteria use up KH as they work, so keep it topped up with water changes.`);
  return `<div class="now"><div><div class="lbl">${day} · ${esc(last.date)}</div>` +
    `<div class="stage">${stage}</div>` +
    `<div class="small muted">Ammonia ${fmt(a)} · Nitrite ${fmt(n)} · Nitrate ${fmt(no3)} ppm</div></div></div>` +
    `<p>${text}</p>${extra.map(t => `<p class="small warn-text">${t}</p>`).join('')}`;
}

/* Nitrogen cycle graphic (v1.4). Circular diagram drawn with theme colors so it
 * works in light and dark mode. Shows the latest readings inside each circle. */
function cycleGraphicSVG(last) {
  const val = k => { const v = last ? num(last[k]) : null; return v == null ? '' : `yours: ${fmt(v)}`; };
  const node = (x, y, color, l1, l2, l3, cls = 'nc-val') =>
    `<circle cx="${x}" cy="${y}" r="40" fill="var(--card)" stroke="${color}" stroke-width="3"/>` +
    `<text x="${x}" y="${y - 6}" class="nc-name">${l1}</text>` +
    `<text x="${x}" y="${y + 8}" class="nc-sub">${l2}</text>` +
    (l3 ? `<text x="${x}" y="${y + 22}" class="${cls}">${l3}</text>` : '');
  const label = (x, y, a, b) =>
    `<text x="${x}" y="${y - 2}" class="nc-lbl">${a}</text><text x="${x}" y="${y + 10}" class="nc-lbl">${b}</text>`;
  const arc = d => `<path d="${d}" fill="none" stroke="var(--muted)" stroke-width="2" marker-end="url(#ncArrow)"/>`;
  return '<svg class="ncycle" viewBox="0 0 340 410" role="img" aria-labelledby="ncTitle ncDesc">' +
    '<title id="ncTitle">The nitrogen cycle in your tank</title>' +
    '<desc id="ncDesc">Fish waste, food, and plants break down into ammonia. Ammonia-eating bacteria turn it into nitrite. ' +
    'Nitrite-eating bacteria turn that into nitrate. Plants feed on nitrate, and water changes remove the rest.</desc>' +
    '<defs><marker id="ncArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
    '<path d="M0,0 L10,5 L0,10 z" fill="var(--muted)"/></marker></defs>' +
    // ring arcs (clockwise)
    arc('M216.0,84.7 A104,104 0 0 1 263.3,132.0') +
    arc('M263.3,224.0 A104,104 0 0 1 216.0,271.3') +
    arc('M124.0,271.3 A104,104 0 0 1 76.7,224.0') +
    arc('M76.7,132.0 A104,104 0 0 1 124.0,84.7') +
    // what happens on each arc
    label(217, 131, 'breaks down', 'into ammonia') +
    label(217, 225, 'ammonia-eating', 'bacteria') +
    label(123, 225, 'nitrite-eating', 'bacteria') +
    label(123, 131, 'plants feed', 'on nitrate') +
    // center
    '<text x="170" y="172" class="nc-center">Bacteria live on the</text>' +
    '<text x="170" y="186" class="nc-center">filter, sand &amp; wood</text>' +
    // nodes
    node(170, 74, 'var(--avg)', 'Waste', 'fish · food', '& plants', 'nc-sub') +
    node(274, 178, 'var(--action)', 'Ammonia', 'NH₃ · toxic', val('ammonia_ppm')) +
    node(170, 282, 'var(--watch)', 'Nitrite', 'NO₂ · toxic', val('nitrite_ppm')) +
    node(66, 178, 'var(--ok)', 'Nitrate', 'NO₃ · safer', val('nitrate_ppm')) +
    // exit: water changes
    '<path d="M36,206 L36,346" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#ncArrow)"/>' +
    '<rect x="16" y="352" width="308" height="46" rx="10" fill="var(--card)" stroke="var(--line)" stroke-width="1.5"/>' +
    '<text x="170" y="371" class="nc-name">Out of the tank</text>' +
    '<text x="170" y="388" class="nc-sub">water changes remove the nitrate that builds up</text>' +
    '</svg>';
}

function fillLearn() {
  const recs = STATE.current || [];
  const last = recs[recs.length - 1];

  const flow = `<div class="ncycle-wrap">${cycleGraphicSVG(last)}</div>` +
    '<p class="small muted">Follow the arrows clockwise from the top. Red and yellow are the toxic steps; green is much safer. The numbers are your latest test.</p>';

  const steps = CYCLE_STEPS.map(s => {
    const v = last ? num(last[s.key]) : null;
    const st = v == null ? null : paramStatus(s.key, v, isFishless(last));
    return `<div class="step ${st || ''}"><div class="step-head"><b>${s.name}</b>${st ? badge(st) : ''}</div>` +
      `<p>${esc(s.role)}</p><p class="step-sub">Where it comes from in your tank</p>` +
      `<ul>${s.sources.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` +
      `<p class="small muted">${esc(s.note)}</p>` +
      `<button type="button" class="link-btn" data-open="${s.key}">See your ${s.name.toLowerCase()} readings →</button></div>`;
  }).join('');

  const stage = cycleStageText(recs);

  document.getElementById('detailTitle').textContent = 'The nitrogen cycle';
  document.getElementById('detailBody').innerHTML =
    '<p class="lead">How your tank turns toxic fish waste into something much safer. The work is done by bacteria that live on surfaces: the filter media, the sand, and the driftwood. Very few float in the water.</p>' +
    `<h3>The cycle in one picture</h3>${flow}` +
    (stage ? `<h3>Your tank right now</h3>${stage}` : '') +
    `<h3>Each step</h3>${steps}` +
    '<h3>The bacteria</h3><ul class="explain">' +
    '<li><b>Ammonia eaters</b> (Nitrosomonas-type bacteria) turn ammonia into nitrite.</li>' +
    '<li><b>Nitrite eaters</b> (mostly Nitrospira) turn nitrite into nitrate.</li>' +
    '<li><b>What they need:</b> oxygen (good water flow), a steady food supply, warm water, pH above about 6.5, and KH, which they use up as they work.</li>' +
    '<li><b>What kills them:</b> chlorine from untreated tap water, and letting the filter dry out or sit switched off for hours.</li>' +
    '<li><b>Protect them:</b> rinse filter media in old tank water, never under the tap. Never replace all the media at once.</li>' +
    '<li><b>Bottled bacteria</b> like Nite-Out II add a starter colony so they establish sooner.</li>' +
    '</ul>' +
    '<h3>How a new tank cycles</h3><ol class="explain">' +
    '<li><b>Stage 1 — Ammonia rises.</b> Waste builds up faster than the few bacteria can eat it.</li>' +
    '<li><b>Stage 2 — Nitrite rises, ammonia falls.</b> Ammonia eaters have grown; nitrite eaters are catching up. This stage usually lasts longest.</li>' +
    '<li><b>Stage 3 — Ammonia and nitrite at 0, nitrate rising.</b> Both groups keep up. When this holds for about a week of daily tests, the tank is cycled.</li>' +
    '</ol><p>It usually takes 2–6 weeks. With fish in the tank, water changes keep ammonia and nitrite at 0.25 ppm or lower while the bacteria catch up.</p>' +
    '<button type="button" class="link-btn" data-open="howto">How-to guides: water changes, testing, spikes →</button>' +
    '<button type="button" class="btn close-wide" data-close>Close</button>';

  document.querySelectorAll('#detailBody [data-close]').forEach(b => b.addEventListener('click', closeDetail));
  document.querySelectorAll('#detailBody [data-open]').forEach(b => b.addEventListener('click', () => switchDetail(b.dataset.open)));
}

function fillHowto() {
  const items = HOWTO.map(h =>
    `<details class="howto" id="howto-${h.id}"><summary><span class="ht-title">${esc(h.title)}</span><span class="ht-time">${esc(h.time)}</span></summary>` +
    `<div class="ht-body"><p class="ht-when"><b>When:</b> ${esc(h.when)}</p>` +
    `<p class="step-sub">You need</p><ul>${h.need.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` +
    `<p class="step-sub">Steps</p><ol class="ht-steps">${h.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` +
    (h.tip ? `<p class="ht-tip"><b>Tip:</b> ${esc(h.tip)}</p>` : '') +
    '</div></details>'
  ).join('');
  document.getElementById('detailTitle').textContent = 'How-to';
  document.getElementById('detailBody').innerHTML =
    '<p class="lead">Step-by-step guides for common jobs on your tank. Tap one to open it.</p>' + items +
    '<button type="button" class="link-btn" data-open="learn">How the nitrogen cycle works →</button>' +
    '<button type="button" class="btn close-wide" data-close>Close</button>';
  // One guide open at a time keeps the list short on a phone.
  document.querySelectorAll('#detailBody details.howto').forEach(d => d.addEventListener('toggle', () => {
    if (!d.open) return;
    document.querySelectorAll('#detailBody details.howto').forEach(o => { if (o !== d) o.open = false; });
    d.scrollIntoView({ block: 'nearest' });
  }));
  document.querySelectorAll('#detailBody [data-close]').forEach(b => b.addEventListener('click', closeDetail));
  document.querySelectorAll('#detailBody [data-open]').forEach(b => b.addEventListener('click', () => switchDetail(b.dataset.open)));
}

/* Swap the open card's content without stacking history entries. */
function switchDetail(key) {
  OPEN_DETAIL = key;
  fillDetail(key);
  try { history.replaceState({ detail: key }, ''); } catch (e) { /* ignore */ }
  document.getElementById('detailBody').scrollTop = 0;
}

function fillDetail(key) {
  if (key === 'learn') return fillLearn();
  if (key === 'howto') return fillHowto();
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
    (['ammonia_ppm', 'nitrite_ppm', 'nitrate_ppm'].includes(key)
      ? '<button type="button" class="link-btn" data-open="learn">How the nitrogen cycle works →</button>' : '') +
    '<button type="button" class="btn close-wide" data-close>Close</button>';
  document.querySelectorAll('#detailBody [data-close]').forEach(b => b.addEventListener('click', closeDetail));
  document.querySelectorAll('#detailBody [data-open]').forEach(b => b.addEventListener('click', () => switchDetail(b.dataset.open)));
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
  document.getElementById('learnBtn').addEventListener('click', () => openDetail('learn'));
  document.getElementById('howtoBtn').addEventListener('click', () => openDetail('howto'));
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

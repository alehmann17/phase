/* Phase: Garmin Connect data via the Phase relay. Data provided by Garmin. */
(function (root) {
  'use strict';

  const MI = 1609.344;

  /* ---------- relay requests ---------- */
  class RelayError extends Error {
    constructor(kind, msg, retryAfter) { super(msg); this.kind = kind; this.retryAfter = retryAfter; }
  }

  async function request(cfg, path, params, binary) {
    if (!cfg || !cfg.url || !cfg.key) throw new RelayError('config', 'Add the relay URL and key');
    const base = cfg.url.replace(/\/+$/, '');
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    let res;
    try {
      res = await fetch(base + path + qs, { headers: { 'X-Phase-Key': cfg.key }, cache: 'no-store' });
    } catch (e) {
      throw new RelayError('network', "Can't reach the relay");
    }
    if (res.status === 429) {
      const ra = Number(res.headers.get('Retry-After')) || 60;
      throw new RelayError('rate', 'Garmin rate limit. Try again in ' + Math.ceil(ra / 60) + ' min', ra);
    }
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (e) { /* ignore */ }
      if (res.status === 401 && body.includes('"key"')) throw new RelayError('relaykey', "Relay key doesn't match");
      if (res.status === 500 && body.includes('not configured')) throw new RelayError('relaycfg', 'Relay is missing its secrets');
      if (res.status === 401 || res.status === 403) throw new RelayError('garminkey', 'Garmin rejected the API key');
      if (res.status === 502 && body.includes('token')) throw new RelayError('garminkey', 'Garmin rejected the API key');
      throw new RelayError('http', 'Garmin error ' + res.status);
    }
    if (binary) return new Uint8Array(await res.arrayBuffer());
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /* ---------- dates ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return isoDate(d); };
  const dayDiff = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);

  /* ---------- parsing Garmin JSON ---------- */
  function trimActivity(a) {
    const local = (a.startTimeLocal || a.startTimeGMT || '').replace('T', ' ');
    return {
      id: a.activityId,
      date: local.slice(0, 10),
      time: local.slice(11, 16),
      name: a.activityName || null,
      type: (a.activityType && a.activityType.typeKey) || 'other',
      dur: a.duration || null,
      dist: a.distance || null,
      avgHR: a.averageHR || null,
      maxHR: a.maxHR || null,
      aTE: a.aerobicTrainingEffect || null,
      anTE: a.anaerobicTrainingEffect || null,
      load: a.activityTrainingLoad || null,
    };
  }
  function mergeWellness(days, hrv, sleep, summaries) {
    const day = (d) => (days[d] = days[d] || {});
    const hs = (hrv && hrv.hrvSummaries) || (Array.isArray(hrv) ? hrv : []);
    for (const x of hs) {
      if (!x || !x.calendarDate) continue;
      const b = x.baseline || {};
      Object.assign(day(x.calendarDate), {
        hrv: x.lastNightAvg ?? null, hrvWk: x.weeklyAvg ?? null, hrvStatus: x.status || null,
        hrvLow: b.balancedLow ?? null, hrvHigh: b.balancedUpper ?? null,
      });
    }
    const sl = Array.isArray(sleep) ? sleep : (sleep && sleep.dailySleepDTO ? [sleep.dailySleepDTO] : []);
    for (const x of sl) {
      if (!x || !x.calendarDate) continue;
      const score = x.sleepScores && x.sleepScores.overall ? x.sleepScores.overall.value : null;
      Object.assign(day(x.calendarDate), { sleepS: x.sleepTimeSeconds ?? null, sleepScore: score ?? null });
    }
    const ds = (summaries && summaries.data) || (Array.isArray(summaries) ? summaries : []);
    for (const x of ds) {
      if (!x || !x.calendarDate) continue;
      const hr = x.heartRate || {};
      const rhr = hr.restingValue ?? x.restingHeartRate ?? null;
      if (rhr != null) day(x.calendarDate).rhr = rhr;
    }
    return days;
  }
  function parseZones(z) {
    const arr = Array.isArray(z) ? z : [];
    const pick = arr.find((x) => x && x.sport === 'RUNNING') || arr.find((x) => x && x.sport === 'DEFAULT') || arr[0];
    if (!pick) return null;
    return { maxHR: pick.maxHeartRateUsed ?? null, lthr: pick.lactateThresholdHeartRateUsed ?? null, rhr: pick.restingHeartRateUsed ?? null };
  }

  /* ---------- sync ---------- */
  // Pulls everything the plan uses for [start, end] in windows Garmin accepts.
  async function sync(cfg, store, opts) {
    const today = opts.today;
    const floor = opts.floor; // earliest date worth fetching
    let start = store.syncedTo ? addDays(store.syncedTo, -2) : floor;
    if (dayDiff(start, floor) > 0) start = floor;
    if (dayDiff(start, today) > 120) start = addDays(today, -120);
    const errors = [];
    store.acts = store.acts || {};
    store.days = store.days || {};
    let s = start;
    while (dayDiff(s, today) >= 0) {
      const e = dayDiff(s, today) > 27 ? addDays(s, 27) : today;
      const [acts, hrv, sleep, sums] = await Promise.allSettled([
        request(cfg, '/activitylist-service/activities/search/activities', { start: 0, limit: 100, startDate: s, endDate: e }),
        request(cfg, '/hrv-service/hrv/daily/' + s + '/' + e),
        request(cfg, '/sleep-service/sleep/dailySleepSummariesByDate', { startDate: s, endDate: e }),
        request(cfg, '/usersummary-service/v2/dailysummaries', { startDate: s, endDate: e }),
      ]);
      const all = [acts, hrv, sleep, sums];
      const fatal = all.find((r) => r.status === 'rejected' && ['config', 'network', 'relaykey', 'relaycfg', 'garminkey', 'rate'].includes(r.reason.kind));
      if (fatal) throw fatal.reason;
      if (acts.status === 'fulfilled') {
        const list = Array.isArray(acts.value) ? acts.value : (acts.value && acts.value.activityList) || [];
        for (const a of list) if (a && a.activityId) store.acts[a.activityId] = trimActivity(a);
      } else errors.push('activities');
      mergeWellness(store.days,
        hrv.status === 'fulfilled' ? hrv.value : null,
        sleep.status === 'fulfilled' ? sleep.value : null,
        sums.status === 'fulfilled' ? sums.value : null);
      all.slice(1).forEach((r, i) => { if (r.status === 'rejected') errors.push(['hrv', 'sleep', 'resting HR'][i]); });
      s = addDays(e, 1);
    }
    try { const z = parseZones(await request(cfg, '/biometric-service/heartRateZones/v2')); if (z) store.zones = z; } catch (e) { errors.push('zones'); }
    if (!errors.includes('activities')) store.syncedTo = today;
    store.last = Date.now();
    return { errors };
  }

  async function laps(cfg, id) {
    const bytes = await request(cfg, '/download-service/files/activity/' + id, null, true);
    const fit = await extractFit(bytes);
    return parseFitLaps(fit);
  }

  /* ---------- zip ---------- */
  async function inflateRaw(data) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([data]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function extractFit(bytes) {
    const isFit = (b) => b.length > 12 && b[8] === 0x2e && b[9] === 0x46 && b[10] === 0x49 && b[11] === 0x54;
    if (isFit(bytes)) return bytes;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a zip or FIT file');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const loff = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + elen + clen;
      if (!/\.fit$/i.test(name)) continue;
      const lnlen = dv.getUint16(loff + 26, true), lelen = dv.getUint16(loff + 28, true);
      const start = loff + 30 + lnlen + lelen;
      const raw = bytes.subarray(start, start + csize);
      const out = method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null;
      if (out && isFit(out)) return out;
    }
    throw new Error('No FIT file in the download');
  }

  /* ---------- FIT laps ---------- */
  const LAP = 19;
  const LAP_FIELDS = { 2: 'start', 7: 'elapsed', 8: 'timer', 9: 'dist', 15: 'avgHR', 16: 'maxHR', 23: 'intensity', 24: 'trigger', 71: 'step', 254: 'index' };
  const INTENSITY = ['active', 'rest', 'warmup', 'cooldown', 'recovery', 'interval', 'other'];

  function parseFitLaps(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const hsize = b[0];
    const dataSize = dv.getUint32(4, true);
    const end = Math.min(b.length, hsize + dataSize);
    const defs = {};
    const out = [];
    let p = hsize;
    while (p < end) {
      const h = b[p++];
      let local, def;
      if (h & 0x80) { // compressed timestamp header, data message
        local = (h >> 5) & 0x03;
      } else if (h & 0x40) { // definition
        local = h & 0x0f;
        const little = b[p + 1] === 0;
        const global = little ? dv.getUint16(p + 2, true) : dv.getUint16(p + 2, false);
        const nf = b[p + 4];
        p += 5;
        const fields = [];
        for (let i = 0; i < nf; i++) { fields.push({ num: b[p], size: b[p + 1], base: b[p + 2] }); p += 3; }
        let devSize = 0;
        if (h & 0x20) {
          const nd = b[p++];
          for (let i = 0; i < nd; i++) { devSize += b[p + 1]; p += 3; }
        }
        defs[local] = { little, global, fields, devSize };
        continue;
      } else {
        local = h & 0x0f;
      }
      def = defs[local];
      if (!def) throw new Error('Corrupt FIT file');
      if (def.global === LAP) {
        const lap = {};
        let q = p;
        for (const f of def.fields) {
          const key = LAP_FIELDS[f.num];
          if (key && (f.size === 1 || f.size === 2 || f.size === 4)) {
            const v = f.size === 1 ? b[q] : f.size === 2 ? dv.getUint16(q, def.little) : dv.getUint32(q, def.little);
            const invalid = f.size === 1 ? v === 0xff : f.size === 2 ? v === 0xffff : v === 0xffffffff;
            if (!invalid) lap[key] = v;
          }
          q += f.size;
        }
        out.push({
          timer: lap.timer != null ? lap.timer / 1000 : lap.elapsed != null ? lap.elapsed / 1000 : null,
          dist: lap.dist != null ? lap.dist / 100 : null,
          avgHR: lap.avgHR ?? null,
          maxHR: lap.maxHR ?? null,
          intensity: lap.intensity != null ? (INTENSITY[lap.intensity] || 'other') : null,
          step: lap.step ?? null,
        });
      }
      p += def.fields.reduce((a, f) => a + f.size, 0) + def.devSize;
    }
    return out;
  }

  /* ---------- matching ---------- */
  const RUNNY = /run|treadmill|track|rowing|row|elliptical|cardio|hiit|walk/i;
  function activityFor(store, date) {
    const list = Object.values((store && store.acts) || {}).filter((a) => a.date === date && RUNNY.test(a.type));
    if (!list.length) return null;
    return list.sort((a, b) => (b.dur || 0) - (a.dur || 0))[0];
  }

  const isStructured = (ls) => ls.some((l) => ['warmup', 'cooldown', 'rest', 'recovery'].includes(l.intensity));
  const isWork = (l) => l.intensity == null || l.intensity === 'active' || l.intensity === 'interval';
  const near = (l, sec, tol) => l.timer != null && Math.abs(l.timer - sec) <= Math.max(sec * tol, 6);

  // Laps for N reps of `sec` seconds.
  function repLaps(ls, sec, n) {
    const structured = isStructured(ls);
    const pool = structured ? ls.filter(isWork) : ls;
    const fit = pool.filter((l) => near(l, sec, 0.15));
    const pickFrom = fit.length >= Math.min(n, 1) ? fit : structured ? pool : [];
    return pickFrom.slice(0, n);
  }

  // 30/15 sets: groups of ~30 s work laps separated by a longer recovery.
  function setPeaks(ls, n) {
    const idx = [];
    ls.forEach((l, i) => { if (isWork(l) && near(l, 30, 0.25)) idx.push(i); });
    if (!idx.length) return [];
    const groups = [];
    let g = [idx[0]];
    for (let k = 1; k < idx.length; k++) {
      const gap = ls.slice(idx[k - 1] + 1, idx[k]).reduce((a, l) => a + (l.timer || 0), 0);
      if (gap <= 40) g.push(idx[k]); else { groups.push(g); g = [idx[k]]; }
    }
    groups.push(g);
    return groups.filter((x) => x.length >= 3).slice(0, n).map((x) => {
      const span = ls.slice(x[0], x[x.length - 1] + 2);
      return Math.max(...span.map((l) => l.maxHR || 0)) || null;
    });
  }

  const mi = (m) => (m == null ? null : Math.round((m / MI) * 100) / 100);

  // Values to log for each item of a run session, from the activity and its laps.
  function fillFor(items, act, ls) {
    const out = {};
    for (const it of items) {
      if (it.id === 'co' || it.id === 'long' || it.id === 'tuesum') {
        out[it.id] = [{ min: act.dur ? Math.round(act.dur / 60) : null, mi: mi(act.dist), bpm: act.avgHR ? Math.round(act.avgHR) : null }];
      } else if (it.id === 'thr' && ls) {
        out[it.id] = repLaps(ls, it.repMin * 60, it.sets).map((l) => ({ mi: mi(l.dist), bpm: l.avgHR }));
      } else if (it.id === 'vo2' && ls) {
        const sec = parseFloat(it.repTxt) * 60;
        out[it.id] = repLaps(ls, sec, it.sets).map((l) => ({ bpm: l.maxHR }));
      } else if (it.id === 'ron' && ls) {
        out[it.id] = setPeaks(ls, it.sets).map((v) => ({ bpm: v }));
      } else if (it.id === 'cooper' && ls) {
        const c = ls.filter((l) => isWork(l) && near(l, 720, 0.05)).sort((a, b) => (b.dist || 0) - (a.dist || 0));
        out[it.id] = c[0] ? [{ mi: mi(c[0].dist), bpm: c[0].maxHR }] : [];
      } else if (it.id === 'anttest' && ls) {
        out[it.id] = repLaps(ls, 300, it.sets).map((l) => ({ bpm: l.avgHR }));
      }
      if (out[it.id] && !out[it.id].length) delete out[it.id];
    }
    return out;
  }
  const needsLaps = (items) => items.some((it) => ['thr', 'vo2', 'ron', 'cooper', 'anttest'].includes(it.id));

  /* ---------- readiness ---------- */
  function readiness(days, date) {
    const d = days && days[date];
    if (!d) return null;
    const flags = [];
    const out = { date, d, flags };
    if (d.hrvStatus && /LOW|POOR/i.test(d.hrvStatus)) flags.push('hrv');
    const y = days[addDays(date, -1)];
    const base = [];
    for (let k = 2; k <= 8; k++) { const x = days[addDays(date, -k)]; if (x && x.rhr) base.push(x.rhr); }
    if (base.length >= 4 && d.rhr && y && y.rhr) {
      const avg = base.reduce((a, b) => a + b, 0) / base.length;
      out.rhrAvg = Math.round(avg);
      if (d.rhr >= avg + 5 && y.rhr >= avg + 5) flags.push('rhr');
    }
    if (d.sleepS != null && d.sleepS < 6 * 3600) flags.push('sleep');
    return out;
  }

  const api = { request, sync, laps, extractFit, parseFitLaps, activityFor, fillFor, needsLaps, readiness, repLaps, setPeaks, mergeWellness, trimActivity, parseZones, addDays, RelayError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Garmin = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* Phase: in-gym logbook */
(function () {
  'use strict';
  const P = window.Plan;
  const KEY = 'phase24.v1';
  const WEEKS = 24;

  /* ---------- state ---------- */
  const DEFAULT = {
    v: 1,
    settings: { start: '2026-11-02', squat1rm: null, pullMax: null, ant: null, sound: true, awake: true },
    logs: {}, drafts: {}, notes: {},
    ui: { view: 'train', w: null, d: null, short: false, metric: 'squat' },
  };
  let S = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        return {
          ...DEFAULT, ...s,
          settings: { ...DEFAULT.settings, ...(s.settings || {}) },
          ui: { ...DEFAULT.ui, ...(s.ui || {}) },
          logs: s.logs || {}, drafts: s.drafts || {}, notes: s.notes || {},
        };
      }
    } catch (e) { /* fall through */ }
    return JSON.parse(JSON.stringify(DEFAULT));
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full or blocked */ }
  }

  /* ---------- dates ---------- */
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function iso(dt) { return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); }
  function addDays(dt, n) { const x = new Date(dt); x.setDate(x.getDate() + n); return x; }
  function sessionDate(w, d) { return addDays(parseDate(S.settings.start), (w - 1) * 7 + d); }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDay = (dt) => MON[dt.getMonth()] + ' ' + dt.getDate();
  function todayPos() {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((t - parseDate(S.settings.start)) / 86400000);
    if (diff < 0) return { w: 1, d: 0, before: true };
    if (diff >= WEEKS * 7) return { w: WEEKS, d: 6, after: true };
    return { w: Math.floor(diff / 7) + 1, d: diff % 7 };
  }
  function snapMonday(dt) { const wd = (dt.getDay() + 6) % 7; return addDays(dt, -wd); }

  /* ---------- helpers ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const svgNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(svgNS, tag);
    for (const k in attrs || {}) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    for (const c of kids.flat()) if (c) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const fmt = (v) => (v == null ? '' : String(Math.round(v * 10) / 10));
  const key = (w, d) => w + '-' + d;
  const phaseCls = (ph) => (P.PHASES[ph] || P.PHASES.test).cls;

  function sessionFor(w, d) {
    const sess = P.session(w, d, S.settings);
    sess.all = sess.items;
    if (S.ui.short && sess.kind === 'lift') sess.items = P.shortItems(sess.items);
    return sess;
  }

  /* ---------- history lookups ---------- */
  function prevEntry(id, w, d, ph) {
    for (let ww = w; ww >= 1; ww--) {
      for (let dd = ww === w ? d - 1 : 6; dd >= 0; dd--) {
        const L = S.logs[key(ww, dd)];
        const e = L && L[id];
        if (e && e.sets && e.sets.some(Boolean) && (!ph || e.ph === ph)) return { w: ww, d: dd, sets: e.sets, ph: e.ph };
      }
    }
    return null;
  }
  function lastOf(sets, f) {
    for (let i = sets.length - 1; i >= 0; i--) if (sets[i] && sets[i][f] != null) return sets[i][f];
    return null;
  }

  function cueFor(it, prev, samePhase) {
    if (!prev) return null;
    const sets = prev.sets.filter(Boolean);
    if (!sets.length) return null;
    if (it.fields === 'ws') {
      const mx = Math.max(...sets.map((x) => x.s || 0));
      return mx >= 40 ? { dir: 'up', txt: '+5 lb' } : { dir: 'up', txt: '+5 s' };
    }
    if (it.fields !== 'wr' || it.lo == null || !['acc', 'primary'].includes(it.kind)) return null;
    if (it.kind === 'primary' && !samePhase) return null;
    const lowCount = sets.filter((x) => (x.r || 0) < it.lo).length;
    if (sets.length >= 2 && sets.every((x) => (x.r || 0) >= it.hi)) return { dir: 'up', txt: '+' + it.step + ' lb' };
    if (lowCount >= 2) return { dir: 'down', txt: '−' + it.step + ' lb' };
    return { dir: 'hold', txt: 'Hold' };
  }

  function context(it, w, d) {
    let prev = null, samePhase = false;
    if (it.kind === 'primary' || it.kind === 'squat') {
      prev = prevEntry(it.id, w, d, it.ph);
      samePhase = !!prev;
      if (!prev) prev = prevEntry(it.id, w, d);
    } else prev = prevEntry(it.id, w, d);
    const cue = cueFor(it, prev, samePhase);
    return { prev, cue };
  }

  function squatWeight(it) {
    if (it.kind !== 'squat' || !it.pct || !S.settings.squat1rm) return null;
    return P.round5(S.settings.squat1rm * it.pct[0] / 100);
  }

  function defaults(it, ctx) {
    const d = {};
    const prev = ctx.prev;
    const lastW = prev ? lastOf(prev.sets, 'w') : null;
    const adj = ctx.cue && ctx.cue.dir === 'up' ? it.step : ctx.cue && ctx.cue.dir === 'down' ? -it.step : 0;
    switch (it.fields) {
      case 'wr': {
        const sw = squatWeight(it);
        if (sw != null) d.w = sw;
        else if (lastW != null) d.w = Math.max(0, lastW + adj);
        else if (it.wLabel) d.w = 0;
        d.r = it.hi != null ? it.hi : it.lo;
        break;
      }
      case 'r': d.r = it.hi != null ? it.hi : null; break;
      case 'ws': {
        const mx = prev ? Math.max(...prev.sets.filter(Boolean).map((x) => x.s || 0)) : 0;
        d.s = prev ? Math.min(40, mx + 5) : 20;
        d.w = mx >= 40 ? (lastW || 0) + 5 : (lastW || 0);
        break;
      }
      case 'wm': d.w = lastW; d.m = 40; break;
      case 'run': d.min = it.target || null; d.mi = null; d.bpm = null; break;
      case 'bpm': d.bpm = null; break;
      default: break;
    }
    return d;
  }

  const FIELD = {
    w: { u: 'lb', dec: true }, r: { u: 'reps', step: 1 }, s: { u: 'sec', step: 5 }, m: { u: 'm', step: 5 },
    min: { u: 'min', step: 5 }, mi: { u: 'mi', step: 0.1, dec: true }, bpm: { u: 'bpm', step: 1 },
  };
  const FIELDSETS = { wr: ['w', 'r'], r: ['r'], ws: ['s', 'w'], wm: ['w', 'm'], run: ['min', 'mi', 'bpm'], bpm: ['bpm'], tick: [] };
  function fieldStep(it, f) { return f === 'w' ? it.step : FIELD[f].step; }
  function fieldLabel(it, f) {
    if (f === 'w' && it.wLabel) return it.wLabel;
    if (f === 'bpm' && it.bpmLabel) return it.bpmLabel;
    if (f === 'bpm' && it.fields === 'run') return 'avg bpm';
    if (f === 'bpm') return 'avg bpm';
    return FIELD[f].u;
  }

  function setText(it, x) {
    switch (it.fields) {
      case 'wr': return (x.w ? fmt(x.w) + '×' : '') + (x.r != null ? x.r : '✓');
      case 'r': return x.r != null ? String(x.r) : '✓';
      case 'ws': return (x.s != null ? x.s + 's' : '✓') + (x.w ? '+' + fmt(x.w) : '');
      case 'wm': return (x.w ? fmt(x.w) + '×' : '') + (x.m != null ? x.m + 'm' : '✓');
      case 'run': return x.min != null ? x.min + '′' : '✓';
      case 'bpm': return x.bpm != null ? String(x.bpm) : '✓';
      default: return '✓';
    }
  }

  function rxText(it) {
    let reps;
    if (it.repTxt) reps = it.repTxt;
    else if (it.lo == null) reps = '';
    else if (it.lo === it.hi) reps = String(it.lo);
    else reps = it.lo + '-' + it.hi;
    if (it.fields === 'ws') reps = holdTarget(it) + ' s';
    if (it.fields === 'run') return reps;
    return (it.sets > 1 || it.fields !== 'tick' ? it.sets + ' × ' : '') + reps + (it.unit || '');
  }
  let holdCache = {};
  function holdTarget(it) { return holdCache[it.id] != null ? holdCache[it.id] : 20; }

  function loadText(it) {
    if (it.kind !== 'squat' || !it.pct) return null;
    const pct = it.pct.length > 1 ? it.pct[0] + '-' + it.pct[1] + '%' : it.pct[0] + '%';
    const lb = S.settings.squat1rm ? it.pct.map((p) => P.round5(S.settings.squat1rm * p / 100)) : null;
    return pct + (lb ? ', ' + (lb.length > 1 && lb[0] !== lb[1] ? lb[0] + '-' + lb[1] : lb[0]) + ' lb' : ' of 1RM');
  }

  /* ---------- logging ---------- */
  function logSet(it, w, d, i, values) {
    const k = key(w, d);
    S.logs[k] = S.logs[k] || {};
    const e = S.logs[k][it.id] = S.logs[k][it.id] || { sets: [], ph: it.ph || null };
    e.ph = it.ph || null;
    const entry = { t: Date.now() };
    for (const f of FIELDSETS[it.fields]) entry[f] = num(values[f]);
    e.sets[i] = entry;
    applyTests(it, e);
    save();
  }
  function clearSet(it, w, d, i) {
    const e = S.logs[key(w, d)] && S.logs[key(w, d)][it.id];
    if (!e) return;
    e.sets[i] = null;
    while (e.sets.length && !e.sets[e.sets.length - 1]) e.sets.pop();
    if (!e.sets.length) delete S.logs[key(w, d)][it.id];
    applyTests(it, e);
    save();
  }
  function applyTests(it, e) {
    const sets = (e.sets || []).filter(Boolean);
    if (!it.test || !sets.length) return;
    if (it.test === 'squat') {
      const best = Math.max(...sets.map((x) => P.e1rm(x.w, x.r) || 0));
      if (best > 0) S.settings.squat1rm = Math.round(best);
    } else if (it.test === 'pull') {
      const best = Math.max(...sets.map((x) => x.r || 0));
      if (best > 0) S.settings.pullMax = best;
    } else if (it.test === 'ant') {
      const v = sets.map((x) => x.bpm).filter((x) => x != null);
      if (v.length) S.settings.ant = Math.round(v.reduce((a, b) => a + b, 0) / v.length);
    }
  }
  function dayProgress(w, d) {
    const sess = P.session(w, d, S.settings);
    if (sess.kind === 'off') return null;
    const L = S.logs[key(w, d)] || {};
    let total = 0, done = 0;
    for (const it of sess.items) {
      total += it.sets;
      const e = L[it.id];
      if (e) done += Math.min(it.sets, e.sets.filter(Boolean).length);
    }
    return { total, done, frac: total ? done / total : 0, optional: !!sess.optional };
  }

  /* ---------- rest timer ---------- */
  let timer = null, timerTick = null, audioCtx = null;
  function unlockAudio() {
    if (!S.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* no audio */ }
  }
  function beep() {
    if (!S.settings.sound || !audioCtx) return;
    try {
      [0, 0.22].forEach((t) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = 880; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.35, audioCtx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.18);
        o.connect(g).connect(audioCtx.destination);
        o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.2);
      });
    } catch (e) { /* ignore */ }
  }
  function startTimer(sec, label) {
    if (!sec) return;
    timer = { end: Date.now() + sec * 1000, total: sec, label, done: false };
    runTimer();
  }
  function runTimer() {
    clearInterval(timerTick);
    paintTimer();
    timerTick = setInterval(paintTimer, 250);
  }
  function stopTimer() { timer = null; clearInterval(timerTick); paintTimer(); }
  function paintTimer() {
    const bar = document.getElementById('timer');
    if (!bar) return;
    if (!timer) { bar.hidden = true; return; }
    const left = Math.ceil((timer.end - Date.now()) / 1000);
    if (left <= 0 && !timer.done) {
      timer.done = true;
      beep();
      try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ }
      setTimeout(() => { if (timer && timer.done) stopTimer(); }, 4000);
    }
    bar.hidden = false;
    bar.classList.toggle('go', left <= 0);
    const t = Math.max(0, left);
    bar.querySelector('.t-time').textContent = left <= 0 ? 'Go' : Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    bar.querySelector('.t-label').textContent = timer.label;
    bar.querySelector('.t-fill').style.transform = 'scaleX(' + Math.max(0, Math.min(1, 1 - (timer.end - Date.now()) / (timer.total * 1000))) + ')';
  }

  /* ---------- wake lock ---------- */
  let wakeLock = null;
  async function keepAwake() {
    if (!S.settings.awake || S.ui.view !== 'train' || document.visibilityState !== 'visible') {
      if (wakeLock) { try { await wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; }
      return;
    }
    if (wakeLock || !('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => { keepAwake(); if (timer) paintTimer(); });

  /* ---------- tempo glyph ---------- */
  function tempoGlyph(ph) {
    // bar height over a rep: 1 = top, 0 = bottom
    const shapes = {
      ecc: [[0, 1], [5, 0], [6, 1]],
      iso: [[0, 1], [2, 0], [5, 0], [6, 1]],
      conc: [[0, 1], [2, 0], [2.5, 1]],
      cal: [[0, 1], [2, 0], [3.5, 1]],
      test: [[0, 1], [2, 0], [3.5, 1]],
    };
    const pts = shapes[ph] || shapes.test;
    const W = 52, H = 22, pad = 3, sx = (W - pad * 2) / 6;
    const d = pts.map((p, i) => (i ? 'L' : 'M') + (pad + p[0] * sx).toFixed(1) + ' ' + (pad + (1 - p[1]) * (H - pad * 2)).toFixed(1)).join(' ');
    return s('svg', { class: 'glyph ' + phaseCls(ph), viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'aria-hidden': 'true' },
      s('path', { d: 'M' + pad + ' ' + (H - pad) + ' H' + (W - pad), class: 'glyph-floor' }),
      s('path', { d, class: 'glyph-line' }));
  }

  /* ---------- views ---------- */
  const app = document.getElementById('app');

  function render() {
    const y = window.scrollY;
    app.replaceChildren();
    if (S.ui.view === 'train') app.append(trainHeader(), trainView());
    else if (S.ui.view === 'progress') app.append(progressView());
    else app.append(settingsView());
    app.append(timerBar(), tabBar());
    paintTimer();
    keepAwake();
    if (renderKeepScroll) window.scrollTo(0, y);
    renderKeepScroll = true;
  }
  let renderKeepScroll = true;
  function go(view) { S.ui.view = view; save(); renderKeepScroll = false; render(); window.scrollTo(0, 0); }

  function ensurePos() {
    if (S.ui.w == null || S.ui.d == null) { const t = todayPos(); S.ui.w = t.w; S.ui.d = t.d; }
  }
  function goSession(w, d) {
    S.ui.w = Math.min(WEEKS, Math.max(1, w)); S.ui.d = d; S.ui.view = 'train';
    save(); renderKeepScroll = false; render(); window.scrollTo(0, 0);
  }

  function trainHeader() {
    ensurePos();
    const w = S.ui.w, wi = P.weekInfo(w);
    const t = todayPos();
    const monday = sessionDate(w, 0), sunday = sessionDate(w, 6);
    const range = fmtDay(monday) + ' to ' + (monday.getMonth() === sunday.getMonth() ? sunday.getDate() : fmtDay(sunday));
    const isToday = (dd) => !t.before && !t.after && t.w === w && t.d === dd;
    const onToday = !t.before && !t.after && t.w === w && t.d === S.ui.d;

    const days = P.DAYS.map((name, dd) => {
      const pr = dayProgress(w, dd);
      const frac = pr ? pr.frac : 0;
      return h('button', {
        class: 'day' + (dd === S.ui.d ? ' on' : '') + (isToday(dd) ? ' today' : '') + (pr ? '' : ' rest') + (pr && pr.optional ? ' opt' : '') + (frac >= 1 ? ' full' : ''),
        style: '--p:' + Math.round(frac * 100),
        onclick: () => { S.ui.d = dd; save(); renderKeepScroll = false; render(); window.scrollTo(0, 0); },
        'aria-label': name + ' ' + fmtDay(sessionDate(w, dd)),
      }, h('span', { class: 'day-n' }, name.slice(0, 1)), h('span', { class: 'day-ring' }, h('span', null, sessionDate(w, dd).getDate())));
    });

    return h('header', { class: 'top ' + phaseCls(wi.ph) },
      h('div', { class: 'wk-row' },
        h('button', { class: 'nav', 'aria-label': 'Previous week', disabled: w <= 1, onclick: () => goSession(w - 1, S.ui.d) }, chevron(-1)),
        h('div', { class: 'wk' },
          h('div', { class: 'wk-title' }, h('span', { class: 'wk-num' }, 'Week ' + w), tempoGlyph(wi.ph)),
          h('div', { class: 'wk-sub' },
            h('span', { class: 'ph-name' }, P.PHASES[wi.ph].name),
            wi.deload ? h('span', { class: 'tag' }, 'Deload') : null,
            h('span', { class: 'wk-range' }, range))),
        !onToday && !t.after && !t.before ? h('button', { class: 'today-btn', onclick: () => goSession(t.w, t.d) }, 'Today') : null,
        h('button', { class: 'nav', 'aria-label': 'Next week', disabled: w >= WEEKS, onclick: () => goSession(w + 1, S.ui.d) }, chevron(1))),
      h('nav', { class: 'days' }, days));
  }
  function chevron(dir) {
    return s('svg', { viewBox: '0 0 24 24', width: 22, height: 22, 'aria-hidden': 'true' },
      s('path', { d: dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  function trainView() {
    const w = S.ui.w, d = S.ui.d;
    const sess = sessionFor(w, d);
    const main = h('main', { class: 'train ' + phaseCls(sess.wi.ph) });

    if (sess.kind === 'off') {
      const hasNext = w < WEEKS || d < 6;
      const nw = d === 6 ? w + 1 : w, nd = d === 6 ? 0 : d + 1;
      main.append(h('section', { class: 'rest-day' },
        h('h1', null, 'Rest'),
        hasNext ? h('button', { class: 'ghost', onclick: () => goSession(nw, nd) }, 'Next: ' + sessionFor(nw, nd).title) : null));
      return main;
    }

    const est = sess.kind === 'lift' ? (S.ui.short ? sess.est[1] : sess.est[0]) : sess.est[0];
    main.append(h('section', { class: 'sess-head' },
      h('div', null,
        h('h1', null, sess.title),
        h('p', { class: 'sess-meta' }, fmtDay(sessionDate(w, d)) + ', about ' + est + ' min' + (sess.optional ? ', optional' : ''))),
      sess.kind === 'lift' ? h('div', { class: 'seg', role: 'group' },
        h('button', { class: !S.ui.short ? 'on' : '', 'aria-pressed': String(!S.ui.short), onclick: () => { S.ui.short = false; save(); render(); } }, 'Full'),
        h('button', { class: S.ui.short ? 'on' : '', 'aria-pressed': String(S.ui.short), onclick: () => { S.ui.short = true; save(); render(); } }, '60 min')) : null));

    if (sess.kind === 'lift') {
      main.append(h('details', { class: 'warm' },
        h('summary', null, 'Warm-up, 8 min'),
        h('p', null, 'CARs for shoulders, hips, spine and ankles. World\'s greatest stretch ×2 per side. Deep squat hold with T-spine rotation, 45-60 s.')));
    } else if (sess.pre) {
      main.append(h('p', { class: 'pre' }, sess.pre));
    }

    // group supersets
    const groups = [];
    for (const it of sess.items) {
      const g = groups[groups.length - 1];
      if (it.ss && g && g.ss === it.ss) g.items.push(it);
      else groups.push({ ss: it.ss || null, items: [it] });
    }
    const list = h('div', { class: 'list' });
    for (const g of groups) {
      if (g.items.length > 1) {
        list.append(h('section', { class: 'ss' }, g.items.map((it, j) => exRow(it, w, d, j < g.items.length - 1))));
      } else list.append(exRow(g.items[0], w, d, false));
    }
    main.append(list);

    if (sess.kind === 'lift') main.append(h('p', { class: 'cool' }, 'Cool-down: nasal-breathing walk until HR is under 100.'));

    const k = key(w, d);
    const note = h('textarea', { class: 'note', rows: 2, placeholder: 'Notes', 'aria-label': 'Session notes' });
    note.value = S.notes[k] || '';
    let nt;
    note.addEventListener('input', () => { clearTimeout(nt); nt = setTimeout(() => { if (note.value) S.notes[k] = note.value; else delete S.notes[k]; save(); }, 300); });
    main.append(note);
    return main;
  }

  function exRow(it, w, d, holdRest) {
    const ctx = context(it, w, d);
    if (it.fields === 'ws') {
      const mx = ctx.prev ? Math.max(...ctx.prev.sets.filter(Boolean).map((x) => x.s || 0)) : 0;
      holdCache[it.id] = ctx.prev ? Math.min(40, mx + 5) : 20;
    }
    const k = key(w, d);
    const draft = (S.drafts[k] && S.drafts[k][it.id]) || defaults(it, ctx);
    const commit = () => { S.drafts[k] = S.drafts[k] || {}; S.drafts[k][it.id] = draft; save(); };
    const L = S.logs[key(w, d)] || {};
    const logged = (L[it.id] && L[it.id].sets) || [];
    const fields = FIELDSETS[it.fields];

    const head = h('div', { class: 'ex-head' },
      h('span', { class: 'ex-no' }, it.no),
      h('div', { class: 'ex-title' },
        h('h2', null, it.name),
        h('div', { class: 'rx' },
          h('span', { class: 'rx-main' }, rxText(it)),
          loadText(it) ? h('span', { class: 'rx-load' }, loadText(it)) : null,
          ctx.cue && ctx.cue.dir !== 'hold' ? h('span', { class: 'cue ' + ctx.cue.dir }, ctx.cue.txt) : null)));

    const row = h('article', { class: 'ex' + (it.kind === 'primary' || it.kind === 'squat' || it.kind === 'cluster' ? ' primary' : '') }, head);
    if (it.cue) row.append(h('p', { class: 'ex-cue' }, it.cue));
    if (ctx.prev) {
      const lastSets = ctx.prev.sets.filter(Boolean).map((x) => setText(it, x)).join('  ');
      row.append(h('p', { class: 'ex-last' }, h('span', null, 'Last, wk ' + ctx.prev.w), ' ' + lastSets));
    }

    if (fields.length) {
      const inputs = h('div', { class: 'inputs' + (fields.length === 3 ? ' three' : '') });
      for (const f of fields) inputs.append(stepper(it, f, draft, commit));
      row.append(inputs);
    }

    const sets = h('div', { class: 'sets' });
    const firstEmpty = Array.from({ length: it.sets }, (_, i) => i).find((i) => !logged[i]);
    const count = Math.max(it.sets, logged.length);
    for (let i = 0; i < count; i++) {
      const x = logged[i];
      if (x) {
        sets.append(h('button', { class: 'set done', onclick: () => openSheet(it, w, d, i, x) }, setText(it, x)));
      } else {
        sets.append(h('button', {
          class: 'set' + (i === firstEmpty ? ' next' : ''),
          'aria-label': 'Log set ' + (i + 1),
          onclick: () => {
            unlockAudio();
            logSet(it, w, d, i, draft);
            if (!holdRest && it.rest) startTimer(it.rest, it.name);
            render();
          },
        }, String(i + 1)));
      }
    }
    row.append(sets);
    return row;
  }

  function stepper(it, f, draft, onchange) {
    const step = fieldStep(it, f);
    const input = h('input', {
      type: 'text', inputmode: FIELD[f].dec ? 'decimal' : 'numeric', class: 'num',
      'aria-label': fieldLabel(it, f), autocomplete: 'off',
    });
    input.value = draft[f] == null ? '' : fmt(draft[f]);
    input.addEventListener('input', () => { draft[f] = num(input.value.replace(',', '.')); onchange && onchange(); });
    input.addEventListener('focus', () => input.select());
    const bump = (dir) => {
      const cur = num(draft[f]);
      let v = (cur == null ? 0 : cur) + dir * step;
      v = Math.round(v * 10) / 10;
      if (v < 0) v = 0;
      draft[f] = v; input.value = fmt(v); onchange && onchange();
    };
    return h('div', { class: 'stepper' },
      h('button', { class: 'bump', 'aria-label': 'Decrease ' + fieldLabel(it, f), onclick: () => bump(-1) }, '−'),
      h('label', { class: 'field' }, input, h('span', { class: 'unit' }, fieldLabel(it, f))),
      h('button', { class: 'bump', 'aria-label': 'Increase ' + fieldLabel(it, f), onclick: () => bump(1) }, '+'));
  }

  /* ---------- edit sheet ---------- */
  function openSheet(it, w, d, i, x) {
    const vals = {};
    for (const f of FIELDSETS[it.fields]) vals[f] = x[f];
    const close = () => { sheet.remove(); document.body.classList.remove('locked'); };
    const fields = FIELDSETS[it.fields];
    const sheet = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === sheet) close(); } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-label': it.name + ', set ' + (i + 1) },
        h('div', { class: 'sheet-head' }, h('h3', null, it.name), h('span', null, 'Set ' + (i + 1))),
        fields.length ? h('div', { class: 'inputs' + (fields.length === 3 ? ' three' : '') }, fields.map((f) => stepper(it, f, vals))) : null,
        h('div', { class: 'sheet-actions' },
          h('button', { class: 'danger', onclick: () => { clearSet(it, w, d, i); close(); render(); } }, 'Delete set'),
          h('button', { class: 'primary-btn', onclick: () => { logSet(it, w, d, i, vals); close(); render(); } }, 'Save'))));
    document.body.classList.add('locked');
    document.body.append(sheet);
  }

  /* ---------- timer + tabs ---------- */
  function timerBar() {
    return h('div', { id: 'timer', class: 'timer', hidden: true },
      h('div', { class: 't-fill' }),
      h('div', { class: 't-body' },
        h('span', { class: 't-time' }, ''),
        h('span', { class: 't-label' }, ''),
        h('button', { onclick: () => { if (timer) { timer.end += 30000; timer.total += 30; timer.done = false; paintTimer(); } } }, '+30 s'),
        h('button', { onclick: stopTimer }, 'Skip')));
  }
  function tabBar() {
    const tab = (v, label, path) => h('button', { class: 'tab' + (S.ui.view === v ? ' on' : ''), onclick: () => go(v), 'aria-current': S.ui.view === v ? 'page' : null },
      s('svg', { viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': 'true' }, s('path', { d: path, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })),
      h('span', null, label));
    return h('nav', { class: 'tabs' },
      tab('train', 'Train', 'M3 10v4M6.5 7v10M17.5 7v10M21 10v4M6.5 12h11'),
      tab('progress', 'Progress', 'M4 19V5M4 19h16M8 15l4-4 3 3 5-6'),
      tab('settings', 'Settings', 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4'));
  }

  /* ---------- progress ---------- */
  const METRICS = [
    { id: 'squat', name: 'Squat e1RM', unit: 'lb', ids: ['squat'], mode: 'e1rm' },
    { id: 'fdb', name: 'Flat DB Press', unit: 'lb e1RM', ids: ['fdb'], mode: 'e1rm' },
    { id: 'idb', name: 'Incline DB Press', unit: 'lb e1RM', ids: ['idb'], mode: 'e1rm' },
    { id: 'row', name: 'Barbell Row', unit: 'lb e1RM', ids: ['row'], mode: 'e1rm' },
    { id: 'rdl', name: 'RDL', unit: 'lb e1RM', ids: ['rdl'], mode: 'e1rm' },
    { id: 'pull', name: 'Pull-up Max', unit: 'reps', ids: ['pullmax'], mode: 'maxr' },
    { id: 'ant', name: 'Threshold HR', unit: 'bpm', ids: ['anttest'], mode: 'avgbpm' },
    { id: 'pace', name: 'Easy Pace', unit: 'min/mi', ids: ['co', 'long'], mode: 'pace', lowerBetter: true },
  ];
  function series(m) {
    const out = [];
    for (let w = 1; w <= WEEKS; w++) for (let d = 0; d < 7; d++) {
      const L = S.logs[key(w, d)];
      if (!L) continue;
      for (const id of m.ids) {
        const e = L[id];
        if (!e) continue;
        const sets = e.sets.filter(Boolean);
        if (!sets.length) continue;
        let v = null, detail = '';
        if (m.mode === 'e1rm') {
          let best = null;
          for (const x of sets) { const v1 = P.e1rm(x.w, x.r); if (v1 && (!best || v1 > best.v)) best = { v: v1, x }; }
          if (best) { v = Math.round(best.v); detail = fmt(best.x.w) + ' × ' + best.x.r; }
        } else if (m.mode === 'maxr') {
          v = Math.max(...sets.map((x) => x.r || 0)) || null;
        } else if (m.mode === 'avgbpm') {
          const b = sets.map((x) => x.bpm).filter((x) => x != null);
          if (b.length) v = Math.round(b.reduce((a, c) => a + c, 0) / b.length);
        } else if (m.mode === 'pace') {
          const x = sets[0];
          if (x.min && x.mi) { v = x.min / x.mi; detail = x.mi + ' mi in ' + x.min + ' min' + (x.bpm ? ', ' + x.bpm + ' bpm' : ''); }
        }
        if (v != null) out.push({ w, d, v, ph: e.ph || P.weekInfo(w).ph, detail, sets });
      }
    }
    return out;
  }
  const paceTxt = (v) => Math.floor(v) + ':' + String(Math.round((v % 1) * 60)).padStart(2, '0');
  const valTxt = (m, v) => (m.mode === 'pace' ? paceTxt(v) : String(Math.round(v)));

  function progressView() {
    ensurePos();
    const main = h('main', { class: 'progress' });
    main.append(h('h1', { class: 'page-title' }, 'Progress'));

    // season grid
    const t = todayPos();
    const grid = h('div', { class: 'season', role: 'grid', 'aria-label': 'Season' });
    const phaseRow = h('div', { class: 'season-phases' }, h('span'));
    for (let w = 1; w <= WEEKS; w++) {
      const wi = P.weekInfo(w);
      phaseRow.append(h('span', { class: 'ph-cell ' + phaseCls(wi.ph) + (wi.deload ? ' deload' : ''), title: 'Week ' + w + ', ' + P.PHASES[wi.ph].name }));
    }
    grid.append(phaseRow);
    for (let d = 0; d < 6; d++) {
      const r = h('div', { class: 'season-row' }, h('span', { class: 'season-day' }, P.DAYS[d].slice(0, 1)));
      for (let w = 1; w <= WEEKS; w++) {
        const pr = dayProgress(w, d);
        const wi = P.weekInfo(w);
        const lvl = !pr || pr.done === 0 ? 0 : pr.frac >= 1 ? 2 : 1;
        r.append(h('button', {
          class: 'cell ' + phaseCls(wi.ph) + ' l' + lvl + (pr && pr.optional ? ' opt' : '') + (!t.before && !t.after && t.w === w && t.d === d ? ' now' : ''),
          'aria-label': 'Week ' + w + ' ' + P.DAYS[d] + (lvl === 2 ? ', done' : lvl === 1 ? ', partial' : ''),
          onclick: () => goSession(w, d),
        }));
      }
      grid.append(r);
    }
    grid.append(h('div', { class: 'season-axis' }, h('span'), h('span', { style: 'grid-column: 2' }, '1'), h('span', { style: 'grid-column: 9' }, '8'), h('span', { style: 'grid-column: 17' }, '16'), h('span', { style: 'grid-column: 25' }, '24')));
    main.append(h('section', { class: 'panel' }, h('h2', null, 'Season'), grid,
      h('div', { class: 'legend' }, ['ecc', 'iso', 'conc', 'test'].map((p) => h('span', { class: 'lg ' + p }, h('i'), p === 'test' ? 'Calibrate and test' : P.PHASES[p].name)))));

    // metric chips
    const m = METRICS.find((x) => x.id === S.ui.metric) || METRICS[0];
    const chips = h('div', { class: 'chips', role: 'tablist' }, METRICS.map((mm) => {
      const sr = series(mm);
      const last = sr.length ? valTxt(mm, sr[sr.length - 1].v) : '–';
      return h('button', { class: 'chip' + (mm.id === m.id ? ' on' : ''), role: 'tab', 'aria-selected': String(mm.id === m.id), onclick: () => { S.ui.metric = mm.id; save(); render(); } },
        h('span', { class: 'chip-name' }, mm.name), h('span', { class: 'chip-val' }, last));
    }));
    main.append(chips);

    const sr = series(m);
    const panel = h('section', { class: 'panel' }, h('h2', null, m.name, h('span', { class: 'unit-note' }, m.unit)));
    if (!sr.length) {
      panel.append(h('p', { class: 'empty' }, 'Nothing logged yet.'));
    } else {
      panel.append(chart(m, sr));
      const hist = h('ol', { class: 'hist' });
      sr.slice().reverse().slice(0, 12).forEach((p) => {
        hist.append(h('li', null,
          h('span', { class: 'h-when' }, 'Wk ' + p.w + ' ' + P.DAYS[p.d]),
          h('span', { class: 'h-ph ' + phaseCls(p.ph) }, P.PHASES[p.ph].name),
          h('span', { class: 'h-val' }, valTxt(m, p.v)),
          h('span', { class: 'h-detail' }, p.detail || '')));
      });
      panel.append(hist);
    }
    main.append(panel);
    return main;
  }

  function chart(m, sr) {
    const W = 340, H = 170, L = 34, R = 10, T = 12, B = 24;
    let lo = Math.min(...sr.map((p) => p.v)), hi = Math.max(...sr.map((p) => p.v));
    if (lo === hi) { const pad = m.mode === 'pace' ? 0.5 : Math.max(2, Math.abs(lo) * 0.05); lo -= pad; hi += pad; }
    const padY = (hi - lo) * 0.15; lo -= padY; hi += padY;
    const xs = (w) => L + ((w - 1) / (WEEKS - 1)) * (W - L - R);
    const ys = (v) => (m.lowerBetter ? T + ((v - lo) / (hi - lo)) * (H - T - B) : H - B - ((v - lo) / (hi - lo)) * (H - T - B));
    const svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': m.name + ' by week' });
    for (let i = 0; i <= 2; i++) {
      const v = lo + ((hi - lo) * i) / 2;
      svg.append(s('line', { x1: L, x2: W - R, y1: ys(v), y2: ys(v), class: 'grid' }));
      svg.append(s('text', { x: L - 6, y: ys(v) + 4, class: 'ax', 'text-anchor': 'end' }, valTxt(m, v)));
    }
    [1, 8, 16, 24].forEach((w) => svg.append(s('text', { x: xs(w), y: H - 6, class: 'ax', 'text-anchor': 'middle' }, 'wk ' + w)));
    // small x jitter by day so same-week points don't collide
    const px = (p) => xs(p.w) + (p.d - 3) * 1.6;
    svg.append(s('path', { class: 'line', d: sr.map((p, i) => (i ? 'L' : 'M') + px(p).toFixed(1) + ' ' + ys(p.v).toFixed(1)).join(' ') }));
    const readout = h('p', { class: 'readout' });
    const show = (p) => { readout.textContent = 'Week ' + p.w + ' ' + P.DAYS[p.d] + ', ' + P.PHASES[p.ph].name + ': ' + valTxt(m, p.v) + ' ' + m.unit + (p.detail ? ' (' + p.detail + ')' : ''); };
    sr.forEach((p) => {
      const g = s('g', { class: 'pt ' + phaseCls(p.ph) });
      g.append(s('circle', { cx: px(p), cy: ys(p.v), r: 4.5, class: 'dot' }));
      g.append(s('rect', { x: px(p) - 7, y: T, width: 14, height: H - T - B, class: 'hit' }));
      g.addEventListener('pointerenter', () => show(p));
      g.addEventListener('click', () => show(p));
      svg.append(g);
    });
    show(sr[sr.length - 1]);
    return h('div', null, svg, readout);
  }

  /* ---------- settings ---------- */
  function settingsView() {
    const st = S.settings;
    const main = h('main', { class: 'settings' });
    main.append(h('h1', { class: 'page-title' }, 'Settings'));

    const numRow = (label, k, unit) => {
      const inp = h('input', { type: 'text', inputmode: 'numeric', class: 'num', placeholder: '–', 'aria-label': label });
      inp.value = st[k] == null ? '' : st[k];
      inp.addEventListener('input', () => { st[k] = num(inp.value); save(); });
      return h('label', { class: 'row' }, h('span', { class: 'row-label' }, label), h('span', { class: 'row-val' }, inp, h('span', { class: 'unit' }, unit)));
    };
    const toggle = (label, k) => h('label', { class: 'row' }, h('span', { class: 'row-label' }, label),
      h('input', { type: 'checkbox', class: 'switch', checked: st[k] ? true : null, onchange: (e) => { st[k] = e.target.checked; save(); keepAwake(); } }));

    const start = h('input', { type: 'date', class: 'date', 'aria-label': 'Plan start' });
    start.value = st.start;
    start.addEventListener('change', () => {
      if (!start.value) return;
      st.start = iso(snapMonday(parseDate(start.value)));
      start.value = st.start; S.ui.w = null; S.ui.d = null; save(); render();
    });
    const end = addDays(parseDate(st.start), WEEKS * 7 - 1);

    main.append(h('section', { class: 'panel' }, h('h2', null, 'Plan'),
      h('label', { class: 'row' }, h('span', { class: 'row-label' }, 'Start (Monday)'), start),
      h('p', { class: 'row-note' }, 'Ends ' + fmtDay(end) + ', ' + end.getFullYear())));

    main.append(h('section', { class: 'panel' }, h('h2', null, 'Maxes'),
      numRow('Squat e1RM', 'squat1rm', 'lb'),
      numRow('Pull-up max', 'pullMax', 'reps'),
      numRow('Threshold HR', 'ant', 'bpm')));

    main.append(h('section', { class: 'panel' }, h('h2', null, 'Gym'),
      toggle('Sound when rest ends', 'sound'),
      toggle('Keep screen on while training', 'awake')));

    const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data || typeof data.logs !== 'object') throw new Error('bad');
        S = { ...DEFAULT, ...data, settings: { ...DEFAULT.settings, ...data.settings }, ui: { ...DEFAULT.ui, ...data.ui, view: 'settings' }, drafts: data.drafts || {}, notes: data.notes || {} };
        save(); flash('Backup restored'); render();
      } catch (e) { flash('That file is not a Phase backup'); }
      file.value = '';
    });
    let armed = false;
    const erase = h('button', { class: 'danger wide', onclick: () => {
      if (!armed) { armed = true; erase.textContent = 'Tap again to erase everything'; setTimeout(() => { armed = false; erase.textContent = 'Erase all data'; }, 4000); return; }
      S = JSON.parse(JSON.stringify(DEFAULT)); S.ui.view = 'settings'; save(); flash('All data erased'); render();
    } }, 'Erase all data');

    main.append(h('section', { class: 'panel' }, h('h2', null, 'Backup'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'ghost', onclick: exportData }, 'Export backup'),
        h('button', { class: 'ghost', onclick: () => file.click() }, 'Import backup')), file),
      h('section', { class: 'panel plain' }, erase));
    return main;
  }

  async function exportData() {
    const name = 'phase-backup-' + iso(new Date()) + '.json';
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    try {
      const f = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f] }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
  }

  function flash(msg) {
    const el = h('div', { class: 'toast', role: 'status' }, msg);
    document.body.append(el);
    setTimeout(() => el.remove(), 2200);
  }

  /* ---------- boot ---------- */
  ensurePos();
  // reopen on today's session each launch
  { const t = todayPos(); S.ui.w = t.w; S.ui.d = t.d; S.ui.view = 'train'; }
  render();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  window.__phase = { get state() { return S; }, render };
})();

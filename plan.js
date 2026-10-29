/* Phase: 24-week plan data. Pure functions, no DOM. */
(function (root) {
  'use strict';

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const PHASES = {
    cal: { name: 'Calibrate', cls: 'test' },
    ecc: { name: 'Eccentric', cls: 'ecc' },
    iso: { name: 'Isometric', cls: 'iso' },
    conc: { name: 'Concentric', cls: 'conc' },
    test: { name: 'Test', cls: 'test' },
  };

  function weekInfo(w) {
    const b = Math.ceil(w / 8);
    const wib = ((w - 1) % 8) + 1;
    const seq = b === 1
      ? ['cal', 'ecc', 'ecc', 'iso', 'iso', 'conc', 'conc', 'test']
      : ['ecc', 'ecc', 'iso', 'iso', 'conc', 'conc', 'conc', 'test'];
    return { w, b, wib, ph: seq[wib - 1], deload: wib === 4, test: wib === 8 };
  }

  /* Back squat, % of estimated 1RM, by block and week-in-block */
  const SQ = {
    1: [{ cal: 1 }, { s: 4, r: 4, p: [72] }, { s: 4, r: 4, p: [75] }, { s: 3, r: 3, p: [75] },
        { s: 4, r: 3, p: [78, 80] }, { s: 4, r: 3, p: [80] }, { s: 3, r: 3, p: [83] }, { test: '3RM', lo: 3 }],
    2: [{ s: 4, r: 4, p: [75] }, { s: 4, r: 4, p: [78, 80] }, { s: 4, r: 3, p: [80, 82] }, { s: 3, r: 3, p: [78] },
        { s: 5, r: 3, p: [82] }, { s: 4, r: 2, p: [85] }, { s: 3, r: 2, p: [87] }, { test: '3RM', lo: 3 }],
    3: [{ s: 4, r: 3, p: [78] }, { s: 4, r: 3, p: [80, 82] }, { s: 4, r: 3, p: [82, 85] }, { s: 3, r: 2, p: [80] },
        { s: 4, r: 2, p: [85] }, { s: 3, r: 2, p: [88] }, { s: 3, r: [1, 2], p: [90] }, { test: '3RM or 1RM', lo: 1 }],
  };

  const TEMPO = {
    squat: { ecc: '5 s lower, drive up', iso: '3 s pause in the hole', conc: 'Fast up, no grinding' },
    db: {
      cal: '2 RIR. Find your working weight', ecc: '5 s lower, 2 RIR', iso: '3 s pause 1 in off the chest',
      conc: 'Explosive', test: 'Explosive',
    },
    row: {
      cal: 'RPE 8. Find your working weight', ecc: '4 s lower, RPE 8', iso: '2 s hold at the sternum, RPE 8',
      conc: 'Explosive pull, RPE 8', test: 'Explosive pull, RPE 8',
    },
    rdl: {
      cal: 'RPE 8. Find your working weight', ecc: '4 s lower, RPE 8', iso: '2 s pause just below the knee, RPE 8',
      conc: 'Explosive hip drive, RPE 8', test: 'Explosive hip drive, RPE 8',
    },
    pull: { ecc: '5 s lower', iso: '2 s hold at the top', conc: 'Fast up' },
  };

  const TUE = {
    1: [['test'], ['th', 4, 5], ['th', 4, 5], ['th', 3, 5, 4], ['th', 5, 5, 6], ['cpi', 5, 60], ['cpi', 6, 60], ['test']],
    2: [['th', 4, 6], ['th', 4, 6], ['th', 5, 6, 6], ['th', 3, 6, 4], ['cpi', 6, 75], ['cpi', 7, 75], ['cpi', 8, 75], ['test']],
    3: [['th', 4, 8], ['th', 4, 8], ['th', 5, 8, 8], ['th', 3, 8, 4], ['cpi', 6, 90], ['cpi', 7, 90], ['cpi', 8, 90], ['test']],
  };
  const SAT = {
    1: [60, 65, 70, 45, 75, 80, 85, 50],
    2: [80, 85, 90, 55, 90, 95, 100, 60],
    3: [85, 90, 95, 60, 95, 100, 100, 60],
  };

  function ex(o) {
    return Object.assign({ fields: 'wr', step: 5, rest: 60, kind: 'acc' }, o);
  }
  function accSets(n, wi) {
    if (wi.test) return Math.max(1, Math.round(n * 0.6));
    if (wi.deload) return Math.max(1, n - 1);
    return n;
  }

  function dbPress(id, name, wi, extra) {
    const t = { cal: [3, 6, 8], ecc: [3, 5, 6], iso: [3, 5, 6], conc: [3, 6, 8], test: [2, 6, 8] }[wi.ph];
    return ex({
      id, name, kind: 'primary', ph: wi.ph, sets: wi.deload ? 2 : t[0], lo: t[1], hi: t[2],
      cue: TEMPO.db[wi.ph] + (extra ? '. ' + extra : ''), rest: 120,
    });
  }
  function bbLift(id, name, key, wi, rest) {
    return ex({
      id, name, kind: 'primary', ph: wi.ph, sets: (wi.deload || wi.test) ? 2 : 3, lo: 4, hi: 6,
      cue: TEMPO[key][wi.ph], rest,
    });
  }
  function squat(wi) {
    const q = SQ[wi.b][wi.wib - 1];
    const base = { id: 'squat', name: 'Back Squat', kind: 'squat', rest: 180, step: 5 };
    if (q.cal) return ex(Object.assign(base, { ph: 'cal', sets: 1, lo: 5, hi: 5, test: 'squat', cue: 'Work up to a 5RM at RPE 9, normal tempo. Safeties set' }));
    if (q.test) return ex(Object.assign(base, { ph: 'test', sets: 1, lo: q.lo, hi: 3, test: 'squat', cue: 'Test ' + q.test + '. Safeties set' }));
    const [lo, hi] = Array.isArray(q.r) ? q.r : [q.r, q.r];
    return ex(Object.assign(base, { ph: wi.ph, sets: q.s, lo, hi, pct: q.p, cue: TEMPO.squat[wi.ph] }));
  }
  function pullCluster(wi, max) {
    if (wi.ph === 'cal' || wi.ph === 'test') {
      return ex({ id: 'pullmax', name: 'Pull-up Max Test', kind: 'test', fields: 'r', sets: 1, lo: null, hi: null, test: 'pull', rest: 120, cue: 'One dead-hang set to failure', repTxt: 'max' });
    }
    const pct = { ecc: [0.5, 0.5], iso: [0.5, 0.6], conc: [0.6, 0.6] }[wi.ph];
    const lo = max ? Math.max(1, Math.round(max * pct[0])) : null;
    const hi = max ? Math.max(1, Math.round(max * pct[1])) : null;
    const pctTxt = pct[0] === pct[1] ? Math.round(pct[0] * 100) + '% of max' : '50-60% of max';
    return ex({
      id: 'pullcl', name: 'Pull-up Clusters', kind: 'cluster', fields: 'r', ph: wi.ph,
      sets: wi.deload ? 3 : 5, lo, hi, repTxt: lo == null ? pctTxt : null, cue: TEMPO.pull[wi.ph], rest: 90,
    });
  }

  function antTxt(ant) {
    return ant ? (ant - 5) + '-' + (ant + 5) + ' bpm' : 'Threshold HR ±5';
  }

  function session(w, d, st) {
    st = st || {};
    const wi = weekInfo(w);
    const A = (n) => accSets(n, wi);
    const L = (o) => ex(o);

    if (d === 0) {
      return {
        title: 'Upper A', kind: 'lift', est: [75, 60], wi,
        items: [
          Object.assign(dbPress('fdb', 'Flat DB Press', wi), { no: '1' }),
          Object.assign(pullCluster(wi, st.pullMax), { no: '2' }),
          L({ no: '3', id: 'latpd', name: 'Lat Pulldown', sets: A(3), lo: 8, hi: 10, rest: 90 }),
          L({ no: '4', id: 'cfly', name: 'Cable Fly', sets: A(3), lo: 10, hi: 12, repTxt: '12', rest: 75 }),
          L({ no: '5a', ss: 'lat', id: 'slat', name: 'Seated Lateral Raise', sets: A(3), lo: 13, hi: 15, repTxt: '15', rest: 0, cut: 2, cue: 'Scapular plane, stop at shoulder height' }),
          L({ no: '5b', ss: 'lat', id: 'stlat', name: 'Standing Lateral Raise, heavy', sets: A(3), lo: 13, hi: 15, repTxt: '15', rest: 75, cut: 2, cue: 'Same path, no heaving' }),
          L({ no: '6a', ss: 'arm', id: 'ccurl', name: 'Cable Bicep Curl', sets: A(3), lo: 13, hi: 15, repTxt: '15', rest: 0 }),
          L({ no: '6b', ss: 'arm', id: 'tpush', name: 'Tricep Pushdown', sets: A(3), lo: 13, hi: 15, repTxt: '15', rest: 60 }),
          L({ no: '7', id: 'fpull', name: 'Cable Face Pull', sets: A(2), lo: 13, hi: 15, repTxt: '15', rest: 60, cut: 'drop' }),
          L({ no: '8a', ss: 'core', id: 'pallof', name: 'Pallof Press', sets: A(3), lo: 8, hi: 10, repTxt: '10', unit: '/side', rest: 0 }),
          L({ no: '8b', ss: 'core', id: 'hlr', name: 'Hanging Leg Raise', fields: 'r', sets: A(3), lo: 8, hi: 12, rest: 60, cue: "Captain's chair if the shoulder complains" }),
        ],
      };
    }
    if (d === 1) {
      const t = TUE[wi.b][wi.wib - 1];
      const items = [];
      if (t[0] === 'test') {
        items.push(L({ no: '1', id: 'anttest', name: wi.w === 24 ? 'Final Threshold Test' : 'Threshold Test', kind: 'test', test: 'ant', fields: 'bpm', sets: 3, repTxt: '5 min hard', rest: 60, cue: '60 s rest between rounds. Log average bpm for each round' }));
      } else if (t[0] === 'th') {
        items.push(L({ no: '1', id: 'thr', name: 'Threshold Reps', kind: 'run', fields: 'bpm', sets: t[1], repTxt: t[2] + ' min', rest: 150, cue: antTxt(st.ant) + ', 2-3 min easy jog between' }));
        if (t[3]) items.push(L({ no: '2', id: 'hri', name: 'Hill Sprints', kind: 'run', fields: 'tick', sets: t[3], repTxt: '10-12 s', rest: 75, cue: 'Steep hill or max-incline treadmill. Walk back, stay under threshold' }));
      } else {
        items.push(L({ no: '1', id: 'cpi', name: 'Cardiac Power Intervals', kind: 'run', fields: 'bpm', bpmLabel: 'peak bpm', sets: t[1], repTxt: t[2] + ' s', rest: 120, cue: 'Bike or rower. Drive to 186+ bpm, recover to 120-130 before the next rep' }));
      }
      items.push(L({ no: String(items.length + 1), id: 'tuesum', name: 'Session Total', kind: 'run', fields: 'run', sets: 1, target: 45, repTxt: '~45 min', rest: 0 }));
      return {
        title: t[0] === 'test' ? 'Threshold Test' : t[0] === 'cpi' ? 'Cardiac Power' : 'Threshold Run',
        kind: 'run', est: [45], wi, pre: '10 min easy jog at 130-150 bpm, then the main set, then 5-10 min easy', items,
      };
    }
    if (d === 2) {
      return {
        title: 'Lower', kind: 'lift', est: [65, 55], wi,
        items: [
          Object.assign(squat(wi), { no: '1' }),
          Object.assign(bbLift('rdl', 'Barbell RDL', 'rdl', wi, 150), { no: '2' }),
          L({ no: '3', id: 'kbss', name: 'KB Split Squat', sets: A(3), lo: 4, hi: 6, unit: '/side', step: 9, rest: 90 }),
          L({ no: '4', id: 'kbslrdl', name: 'KB Single-Leg RDL', sets: A(3), lo: 4, hi: 6, unit: '/side', step: 9, rest: 90, cut: 2 }),
          L({ no: '5', id: 'slgb', name: 'Single-Leg Glute Bridge Hold', kind: 'hold', fields: 'ws', sets: A(2), unit: '/side', rest: 30, cue: '+5 s a week to 40 s, then add load' }),
          L({ no: '6', id: 'calf', name: 'Calf Isohold', kind: 'hold', fields: 'ws', sets: A(3), rest: 30, cut: 'drop', cue: '+5 s a week to 40 s, then add load' }),
        ],
      };
    }
    if (d === 3) {
      const min = (wi.deload || wi.test) ? 30 : (wi.b === 1 ? 40 : 45);
      const sat = SAT[wi.b][wi.wib - 1];
      return {
        title: 'Easy Run', kind: 'run', est: [min], wi,
        items: [L({ no: '1', id: 'co', name: 'Cardiac Output Run', kind: 'run', fields: 'run', sets: 1, target: min, repTxt: min + ' min', rest: 0, cue: '130-150 bpm. Skipping Saturday? Go ' + sat + ' min' })],
      };
    }
    if (d === 4) {
      return {
        title: 'Upper B', kind: 'lift', est: [70, 60], wi,
        items: [
          Object.assign(bbLift('row', 'Barbell Row', 'row', wi, 150), { no: '1' }),
          Object.assign(dbPress('idb', 'Incline DB Press', wi, 'Bench at 30° or lower'), { no: '2' }),
          L({ no: '3', id: 'pu', name: 'Pull-ups', sets: A(3), lo: 8, hi: 12, wLabel: 'added lb', rest: 90, cue: 'Band for reps past your strict max. At 3×12 strict, add 5 lb' }),
          L({ no: '4', id: 'cfly', name: 'Cable Fly', sets: A(3), lo: 10, hi: 12, repTxt: '12', rest: 75 }),
          L({ no: '5a', ss: 'lat', id: 'slat', name: 'Seated Lateral Raise', sets: A(3), lo: 13, hi: 15, repTxt: '15', rest: 0, cue: 'Scapular plane, stop at shoulder height' }),
          L({ no: '5b', ss: 'lat', id: 'stlat', name: 'Standing Lateral Raise, heavy', sets: A(3), lo: 13, hi: 15, repTxt: '15', rest: 75, cue: 'Same path, no heaving' }),
          L({ no: '6', id: 'rdfly', name: 'Rear Delt Fly', sets: A(3), lo: 13, hi: 15, repTxt: '15', rest: 60, cut: 2 }),
          L({ no: '7a', ss: 'arm', id: 'hcurl', name: 'Hammer Curl', sets: A(3), lo: 10, hi: 12, repTxt: '12', rest: 0, cut: 'drop' }),
          L({ no: '7b', ss: 'arm', id: 'rpush', name: 'Rope Pushdown', sets: A(3), lo: 10, hi: 12, repTxt: '12', rest: 60, cut: 'drop' }),
          L({ no: '8a', ss: 'core', id: 'abw', name: 'Ab Wheel Rollout', fields: 'r', sets: A(3), lo: 6, hi: 8, repTxt: '8', rest: 0 }),
          L({ no: '8b', ss: 'core', id: 'suit', name: 'Suitcase Carry', fields: 'wm', sets: A(3), repTxt: '40 m', unit: '/side', rest: 60 }),
        ],
      };
    }
    if (d === 5) {
      const min = SAT[wi.b][wi.wib - 1];
      return {
        title: 'Long Run', kind: 'run', optional: true, est: [min], wi,
        items: [L({ no: '1', id: 'long', name: 'Long Run', kind: 'run', fields: 'run', sets: 1, target: min, repTxt: min + ' min', rest: 0, cue: '130-150 bpm' })],
      };
    }
    return { title: 'Rest', kind: 'off', est: [], wi, items: [] };
  }

  /* Apply the 60-minute cut order */
  function shortItems(items) {
    return items.filter((it) => it.cut !== 'drop').map((it) => (it.cut === 2 ? Object.assign({}, it, { sets: Math.min(it.sets, 2) }) : it));
  }

  function e1rm(w, r) {
    if (!w || !r) return null;
    return r <= 1 ? w : w * (1 + r / 30);
  }
  const round5 = (x) => Math.round(x / 5) * 5;

  const api = { DAYS, PHASES, weekInfo, session, shortItems, e1rm, round5, SQ, TUE, SAT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Plan = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* ZetaQ telemetry kit (zq-telemetry.js) - envelope v2 (+ v3 additions), the 6 building blocks:
   Session, Item, Step, Attempt, Support (hints / replays / feedback), Observation.
   One file, no dependencies, no DOM required (works in a browser page, an iframe, a webview, or Node for tests).

   Delivery (the lesson never knows the backend):
     1. window.parent.postMessage({zq:"event", v:2, event}, "*")   (+ ReactNativeWebView.postMessage if present)
     2. optional batched POST when the URL has ?zq_endpoint=<url>&zq_token=<t>  (every 10 s / 20 events / page hide)
        body {v:2, batch_id, events:[...], rows:{...}}; rows come from a ZQRows attached with T.attachRows(R) (zq-rows.js)
     3. AT-LEAST-ONCE: every event and row batch is written to a persistent queue the moment it exists (localStorage,
        one key per item "zq_e:" / "zq_r:"; IndexedDB "zq_queue" when localStorage is full or blocked; memory last).
        An item leaves the queue only when the server answers 2xx echoing the batch_id. Retries every 10 s, on load,
        online and visibility change, with backoff 2 s .. 5 min. No cap, nothing is dropped. The server dedupes on
        event_id and (session_id, seq). One POST = one session's events (+ that session's rows). Never blocks the lesson.
        PARTIAL ACK (kit 1.2.0, 2026-11-12): an answer {partial_batch_id: <batch_id>, stored: [{session_id, seq}], rejected: [...]}
        (HTTP 422 from the reference servers when some events fail the schema) drops only the events listed in stored (and the
        batch's rows, which the server wrote). An answer that echoes the batch_id but lists rejected events (servers before
        2026-11-12) is read the same way: everything except the rejected events counts as stored. Every other event stays queued with a reject count and is sent again (2 s after a batch that stored something, else
        with the usual backoff);
        after 5 rejections it moves to the dead-letter list "zq_dead:<session>:<seq>" (kept on the device, never sent with the
        normal queue, so one bad event cannot hold the queue). Once a day (on load) each dead letter gets one more try, so a fixed
        server still receives it. T.deadLetters() -> Promise of [{e, n, errors, t}]; T.requeueDead() puts them all back now.
     6. heartbeat event every 60 s while visible. Each session keeps a marker "zq_open:<session_id>"; on the next load
        for the same student + content, a session left without session_end (killed page) gets a synthetic
        session_end {completed:false, reason:'abandoned_or_killed', last_event_ts} (games: item_end quit for an open
        round first), stamped with the last event's ts. Server side: v_session_liveness (no event for 30 min = closed).
        KIT 1.2.1 (2026-11-12, EVENT_CONTRACT 1.0): a killed QUIZ sitting (content_type quiz) is closed with the quiz's own end
        event, quiz_session_end {completed:false, reason:'abandoned_or_killed', last_event_ts, detected_at, synthetic:true},
        never a generic session_end, so every content type closes with exactly the end event of its contract. T.quiz.start()
        now also runs the start block (heartbeat + killed-sitting check) that only sessionStart() ran before, and a quiz page
        that is closed mid-sitting (pagehide) sends quiz_session_end {completed:false, reason:'pagehide'} (before: session_end).
        KIT 1.2.2 (2026-11-12, additive): QUIZ SEGMENTS for answer games (True/False road: "Ride on" starts a new quiz sitting inside
        one game session). T.quiz.segmentEnd(completed, fields) (= T.quiz.end(completed, fields, {segment: true})) sends
        quiz_session_end WITHOUT ending the session; the quiz counters restart for the next T.quiz.start(). An open segment is
        closed by the kit like a sitting: page closed -> quiz_session_end {completed:false, reason:'pagehide'} before the game's
        session_end; killed page -> on the next load quiz_session_end {completed:false, reason:'abandoned_or_killed', synthetic:true}
        before the synthetic item_end / session_end. Lessons and the quiz player send exactly what kit 1.2.1 sent.
     5. T.resume(chapterId) -> Promise of {student_model, student_skill_state} | null from GET <endpoint base>/resume
     4. window.ZQ.getEvents(), window.ZQ.getSummary(), window.ZQ.onEvent(fn)
   Identity from the app: URL params zq_student, zq_class_section, zq_school, zq_mode (student|teacher|preview),
   zq_launch (assigned|voluntary), zq_entry (home|plan|teacher|lesson_end), or a {zq:"init", ...} postMessage.
   Plain aliases (zq_* wins): student, school, class_section, mode, entry, endpoint, token, assigned=1|0 (= launch
   assigned|voluntary).
   The lesson never asks for names. No identity -> student_id "anon".

   Timing rule (fixed): a step's clock starts at step_ready (inputs live); paused time (hidden tab, idle > 30 s,
   voice replays) is subtracted; feedback animations are outside all timers.                                  */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZQTelemetry = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = 2, KIT = '1.2.2', IDLE_MS = 30000, QKEY = 'zq_queue_v2', RKEY = 'zq_rows_v2', EP = 'zq_e:', RP = 'zq_r:', OP = 'zq_open:', HEARTBEAT_MS = 60000, BATCH_MAX = 2000;
  var DP = 'zq_dead:', MAX_REJECT = 5, DEAD_RETRY_MS = 86400000;   // dead letters (kit 1.2.0): see the header

  function uuid() {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* fall through */ }
    var d = Date.now(), r = Math.random;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var x = (d + r() * 16) % 16 | 0; d = Math.floor(d / 16); return (c === 'x' ? x : (x & 3 | 8)).toString(16); });
  }
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function param(name, search) {
    try { var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(search || (typeof location !== 'undefined' ? location.search : '')); return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null; } catch (e) { return null; }
  }
  /* Q: persistent key/value queue. put/del are fire-and-forget; list(prefix) -> {sync: [[k, v]], all: Promise<[[k, v]]>}.
     localStorage first (synchronous, survives a killed page), IndexedDB when localStorage throws (full / blocked),
     memory until IndexedDB confirms (and as the last resort).                                                       */
  var Q = (function () {
    var mem = {}, idbP = null;
    function ls() { try { return typeof localStorage !== 'undefined' && localStorage ? localStorage : null; } catch (e) { return null; } }
    function idb() {
      if (idbP) return idbP;
      idbP = new Promise(function (ok) {
        try {
          if (typeof indexedDB === 'undefined') return ok(null);
          var rq = indexedDB.open('zq_queue', 1);
          rq.onupgradeneeded = function () { rq.result.createObjectStore('q'); };
          rq.onsuccess = function () { ok(rq.result); }; rq.onerror = function () { ok(null); };
        } catch (e) { ok(null); }
      });
      return idbP;
    }
    function tx(mode, fn) {
      return idb().then(function (db) {
        if (!db) return null;
        return new Promise(function (ok) {
          try { var t = db.transaction('q', mode), out = fn(t.objectStore('q')); t.oncomplete = function () { ok(out || true); }; t.onerror = t.onabort = function () { ok(null); }; }
          catch (e) { ok(null); }
        });
      });
    }
    function put(k, v) {
      var s = JSON.stringify(v), L = ls();
      try { if (L) { L.setItem(k, s); return; } } catch (e) { /* full or blocked: IndexedDB */ }
      mem[k] = s;
      if (typeof indexedDB !== 'undefined') tx('readwrite', function (st) { st.put(s, k); }).then(function (r) { if (r && mem[k] === s) delete mem[k]; });
    }
    function del(keys) {
      var L = ls();
      keys.forEach(function (k) { try { if (L) L.removeItem(k); } catch (e) { /* blocked */ } delete mem[k]; });
      if (typeof indexedDB !== 'undefined' && idbP) tx('readwrite', function (st) { keys.forEach(function (k) { st.delete(k); }); });
    }
    function parse(k, s) { try { return [k, JSON.parse(s)]; } catch (e) { return null; } }
    function list(prefix) {
      var out = [], seen = {}, L = ls();
      try { if (L) for (var i = 0; i < L.length; i++) { var k = L.key(i); if (k && k.indexOf(prefix) === 0) { var x = parse(k, L.getItem(k)); if (x) { out.push(x); seen[k] = 1; } } } } catch (e) { /* blocked */ }
      Object.keys(mem).forEach(function (k) { if (k.indexOf(prefix) === 0 && !seen[k]) { var x = parse(k, mem[k]); if (x) { out.push(x); seen[k] = 1; } } });
      var all = typeof indexedDB === 'undefined' ? Promise.resolve(out) : tx('readonly', function (st) {
        var o = { keys: null, vals: null }, rg = IDBKeyRange.bound(prefix, prefix + '\uffff');
        st.getAllKeys(rg).onsuccess = function (e) { o.keys = e.target.result; }; st.getAll(rg).onsuccess = function (e) { o.vals = e.target.result; };
        return o;
      }).then(function (o) {
        var res = out.slice();
        if (o && o.keys) o.keys.forEach(function (k, i) { if (!seen[k]) { var x = parse(k, o.vals[i]); if (x) res.push(x); } });
        return res;
      });
      return { sync: out, all: all };
    }
    // one-time migration of the kit 1.0 queue (one array per key) into per-item keys
    function migrate() {
      var L = ls(); if (!L) return;
      try {
        var ev = JSON.parse(L.getItem(QKEY) || 'null'), rw = JSON.parse(L.getItem(RKEY) || 'null');
        (ev || []).forEach(function (e) { if (e && e.session_id) put(EP + e.session_id + ':' + pad(e.seq), { e: e, r: 0 }); });
        (rw || []).forEach(function (r, i) { put(RP + '_legacy:' + pad(i) + ':' + uuid(), { s: '_legacy', rows: r }); });
        if (ev) L.removeItem(QKEY); if (rw) L.removeItem(RKEY);
      } catch (e) { /* keep the old keys */ }
    }
    return { put: put, del: del, list: list, migrate: migrate };
  })();
  function pad(n) { n = String(n); while (n.length < 9) n = '0' + n; return n; }

  /* init(opts)
     opts.content = {board, class, subject, chapter_id, chapter, content_type: lesson|game|sim, content_id, content_version, spec_hash}
     opts.search (tests), opts.device {w,h,touch,lang}, opts.sink(fn) extra listener, opts.clock() ms (tests)       */
  function init(opts) {
    opts = opts || {};
    var clock = opts.clock || nowMs, t0 = clock();
    var S = opts.search;
    function p2(n) { var v = param('zq_' + n, S); return v != null ? v : param(n, S); }   // zq_<name> wins over the plain alias
    var asg = param('assigned', S);
    var ident = {
      student_id: p2('student') || 'anon', class_section: p2('class_section') || null, school: p2('school') || null,
      mode: p2('mode') || 'student', launch: param('zq_launch', S) || (asg === '0' ? 'voluntary' : asg === '1' ? 'assigned' : param('launch', S)) || 'assigned', entry: p2('entry') || 'home'
    };
    if (['student', 'teacher', 'preview'].indexOf(ident.mode) < 0) ident.mode = 'student';
    if (['assigned', 'voluntary'].indexOf(ident.launch) < 0) ident.launch = 'assigned';
    var endpoint = p2('endpoint'), token = p2('token');
    if (!Q.migrated) { Q.migrated = true; try { Q.migrate(); } catch (e) { /* keep the old keys */ } }
    var T = { session_id: uuid(), seq: 0, events: [], listeners: [], ident: ident, content: opts.content || {}, ended: false, rows: null,
      paused: { since: null, total: 0 }, step: null, item: null, counts: { items: 0, steps: 0, reward: 0, max: 0 }, lastInput: clock() };
    if (opts.sink) T.listeners.push(opts.sink);
    function device() {
      if (opts.device) return opts.device;
      try { return { w: window.innerWidth, h: window.innerHeight, touch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0, lang: (navigator.language || 'en').slice(0, 2) }; }
      catch (e) { return { w: 0, h: 0, touch: false, lang: 'en' }; }
    }
    var dev = device();

    // ---------- delivery (at-least-once, see the header) ----------
    var pending = 0, inflight = {}, fails = 0, nextTry = 0, retryT = null, rowsTick = false, rowSeq = 0;
    function post(ev) {
      try { if (typeof window !== 'undefined' && window.parent && window.parent !== window) window.parent.postMessage({ zq: 'event', v: VERSION, event: ev }, '*'); } catch (e) { /* no parent */ }
      try { if (typeof window !== 'undefined' && window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ zq: 'event', v: VERSION, event: ev })); } catch (e) { /* no webview */ }
    }
    function deliver(ev) {
      post(ev);
      if (!endpoint) return;
      Q.put(EP + ev.session_id + ':' + pad(ev.seq), { e: ev, r: T.rows ? 1 : 0, t: Date.now() });   // stored at once
      // rows are taken right after the current task (the page updates its own model just after emitting), still before any kill
      if (T.rows && !rowsTick) { rowsTick = true; Promise.resolve().then(function () { rowsTick = false; takeRows(); }); }
      if (++pending >= 20) flush();
    }
    /* row batches of one session, oldest first (upserts: the newest snapshot must be written last). 2026-11-12 (review T1): the order is
       the page's own counter n (one page = one session), never the clock: two batches taken in the same millisecond used to be
       ordered by a random uuid, so an older game_session / student_model snapshot could be written last. Old items: t, then key. */
    function rowsInOrder(rws) {
      return rws.slice().sort(function (p, q) {
        var a = p[1] || {}, b = q[1] || {};
        return ((a.n != null ? a.n : -1) - (b.n != null ? b.n : -1)) || ((a.t || 0) - (b.t || 0)) || (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0);
      }).map(function (kv) { return kv[1].rows; });
    }
    function mergeRows(list) {
      var o = {}; list.forEach(function (r) { Object.keys(r || {}).forEach(function (k) { if (r[k] && r[k].length) o[k] = (o[k] || []).concat(r[k]); }); });
      return o;
    }
    function takeRows() {
      if (!T.rows) return;
      try { var tk = T.rows.take().rows; if (Object.keys(tk).some(function (k) { return tk[k].length; })) { var n = ++rowSeq; Q.put(RP + T.session_id + ':' + pad(n) + ':' + uuid(), { s: T.session_id, rows: tk, t: Date.now(), n: n }); } }
      catch (e) { /* rows are optional */ }
    }
    function failed() {
      fails++; var wait = Math.min(300000, 2000 * Math.pow(2, fails - 1)); nextTry = Date.now() + wait;
      if (typeof setTimeout !== 'undefined') { if (retryT) clearTimeout(retryT); retryT = setTimeout(function () { retryT = null; flush(); }, wait); }
    }
    /* group the queue into payloads: one session (and rows flag) per POST, oldest first; a session already in flight waits */
    function payloads(items) {
      var groups = {}, rowsBy = {};
      items.forEach(function (kv) {
        var k = kv[0], v = kv[1];
        if (k.indexOf(RP) === 0) { (rowsBy[v.s] = rowsBy[v.s] || []).push(kv); return; }
        if (!v || !v.e) return;
        var g = v.e.session_id + '|' + (v.r ? 1 : 0); (groups[g] = groups[g] || { sid: v.e.session_id, r: !!v.r, evs: [] }).evs.push(kv);
      });
      var list = Object.keys(groups).map(function (g) { var x = groups[g]; x.evs.sort(function (p, q) { return p[1].e.seq - q[1].e.seq; }); x.t = x.evs[0][1].e.ts; return x; });
      Object.keys(rowsBy).forEach(function (sid) { if (!list.some(function (x) { return x.sid === sid && x.r; })) list.push({ sid: sid, r: true, evs: [], t: '' }); });
      list.sort(function (p, q) { return p.t < q.t ? -1 : p.t > q.t ? 1 : (p.r ? -1 : 1); });
      var busy = {}, out = [];
      Object.keys(inflight).forEach(function (id) { busy[inflight[id]] = 1; });
      list.forEach(function (x) {
        if (busy[x.sid]) return; busy[x.sid] = 1;          // one payload per session at a time keeps the order
        var evs = x.evs.slice(0, BATCH_MAX), rws = x.r ? (rowsBy[x.sid] || []) : [];
        var items = {}; evs.forEach(function (kv) { items[kv[0]] = kv[1]; });
        out.push({ sid: x.sid, items: items, keys: evs.map(function (kv) { return kv[0]; }).concat(rws.map(function (kv) { return kv[0]; })),
          body: { v: VERSION, events: evs.map(function (kv) { return kv[1].e; }), rows: x.r ? mergeRows(rowsInOrder(rws)) : undefined } });
      });
      return out;
    }
    function send(pl, keepalive) {
      var id = uuid(); pl.body.batch_id = id; inflight[id] = pl.sid;
      var body = JSON.stringify(pl.body);
      var done = function (j) {
        delete inflight[id];
        var rej = j && j.rejected && j.rejected.length;
        if (j && j.batch_id === id && !rej) { Q.del(pl.keys); fails = 0; nextTry = 0; flush(); }        // every event stored
        else if (j && (j.partial_batch_id === id || (j.batch_id === id && rej))) partial(pl, j);         // some rejected (an old server echoes the id anyway)
        else failed();                                                                     // nothing confirmed: keep all, retry
      };
      try {
        fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || '') }, body: body, keepalive: !!keepalive && body.length < 60000 })
          .then(function (r) {   // 2xx, or a 4xx that carries a partial ack (422 from the reference servers)
            if (!r) return null;
            return r.json().catch(function () { return null; }).then(function (j) { return r.ok || (j && j.partial_batch_id) ? j : null; });
          }).then(done, function () { done(null); });
      } catch (e) { done(null); }
    }
    /* partial ack: drop what the server stored (and the batch's rows, written as sent); count a rejection on every other event;
       an event rejected MAX_REJECT times moves to the dead-letter list so it never holds the queue */
    function partial(pl, j) {
      var ok = {}, why = {}, del = [], again = 0;
      (j.rejected || []).forEach(function (r) { if (r) why[EP + r.session_id + ':' + pad(r.seq)] = r.errors || null; });
      if (Array.isArray(j.stored)) j.stored.forEach(function (s) { if (s) ok[EP + s.session_id + ':' + pad(s.seq)] = 1; });
      else pl.keys.forEach(function (k) { if (k.indexOf(EP) === 0 && !(k in why)) ok[k] = 1; });   // old server: no stored list, only rejected
      pl.keys.forEach(function (k) {
        if (k.indexOf(RP) === 0 || ok[k]) { del.push(k); return; }
        var v = pl.items[k]; if (!v) return;
        v.n = (v.n || 0) + 1; v.errors = why[k] || ['not stored'];
        if (v.n >= MAX_REJECT) { Q.put(DP + k.slice(EP.length), { e: v.e, r: v.r, n: v.n, errors: v.errors, t: Date.now() }); del.push(k); }
        else { Q.put(k, v); again++; }
      });
      Q.del(del);
      var progress = del.some(function (k) { return k.indexOf(EP) === 0; });
      if (again) { if (progress) fails = 0; failed(); }   // events were stored: retry the rest in 2 s; nothing stored: back off further
      else { fails = 0; nextTry = 0; flush(); }
    }
    function deadLetters() { return Q.list(DP).all.then(function (l) { return l.map(function (kv) { return kv[1]; }); }); }
    /* dead letters back into the queue: all of them now (requeueDead), or once a day each (on load); one more rejection sends it back */
    function requeueDead(onlyOld) {
      return Q.list(DP).all.then(function (l) {
        var n = 0;
        l.forEach(function (kv) {
          var v = kv[1]; if (!v || !v.e || (onlyOld && Date.now() - (v.t || 0) < DEAD_RETRY_MS)) return;
          Q.put(EP + kv[0].slice(DP.length), { e: v.e, r: v.r || 0, t: v.t, n: onlyOld ? MAX_REJECT - 1 : 0 }); Q.del([kv[0]]); n++;
        });
        if (n) retryNow();
        return n;
      });
    }
    /* flush(leaving): leaving = page hidden or closing -> only this page's own items, sent with keepalive, right now */
    function flush(leaving) {
      if (!endpoint || typeof fetch === 'undefined') return;
      takeRows(); pending = 0;
      if (!leaving && Date.now() < nextTry) return;
      var L = Q.list(EP), R = Q.list(RP);
      if (leaving) { payloads(L.sync.concat(R.sync)).filter(function (pl) { return pl.sid === T.session_id; }).forEach(function (pl) { send(pl, true); }); return; }
      Promise.all([L.all, R.all]).then(function (x) { payloads(x[0].concat(x[1])).forEach(function (pl) { send(pl, false); }); });
    }
    function retryNow() { nextTry = 0; flush(); }
    /* resume(chapterId): GET <endpoint base>/resume?student=&school=&chapter= -> {student_model, student_skill_state} | null.
       The base is the endpoint with a trailing /events removed. The Promise never rejects (offline or no endpoint -> null).
       resume() with no argument still ends a pause (old API).                                                          */
    function resumeModel(chapterId) {
      return new Promise(function (ok) {
        if (!endpoint || typeof fetch === 'undefined') return ok(null);
        var base = endpoint.replace(/[?#].*$/, '').replace(/\/events\/?$/, '').replace(/\/$/, '');
        var url = base + '/resume?student=' + encodeURIComponent(T.ident.student_id) + '&school=' + encodeURIComponent(T.ident.school || '') + '&chapter=' + encodeURIComponent(chapterId || '');
        try {
          fetch(url, { headers: { 'Authorization': 'Bearer ' + (token || '') } })
            .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { ok(j || null); }).catch(function () { ok(null); });
        } catch (e) { ok(null); }
      });
    }
    function unref(t) { try { if (t && t.unref) t.unref(); } catch (e) { /* browser */ } return t; }
    if (endpoint && typeof setInterval !== 'undefined') unref(setInterval(function () { flush(); }, 10000));
    if (endpoint) { try { requeueDead(true); } catch (e) { /* best effort */ } }

    // ---------- killed sessions: marker per open session, synthetic session_end on the next load ----------
    function marker(ev) {
      if (ev.type === 'session_end' || (ev.type === 'quiz_session_end' && T.content.content_type === 'quiz') || T.ended) { Q.del([OP + ev.session_id]); return; }   // a game's quiz segment end keeps the session open   // nothing after the end reopens the session
      var g = T.content.content_type === 'game' && api && api.game ? api.game : null;
      Q.put(OP + ev.session_id, { session_id: ev.session_id, seq: ev.seq, ts: ev.ts, t_ms: ev.t_ms, student_id: ev.student_id, class_section: ev.class_section, school: ev.school,
        mode: ev.mode, content: ev.content, device: ev.device,
        round: g && g.round ? { id: g.round.id, level: g.round.level, retries: g.round.retries } : null,
        quiz: T.content.content_type === 'game' && api && api.quiz && api.quiz.open ? { segment: api.quiz.seg || null } : null,
        game: g ? { score: g.score, rounds_played: g.rounds, rounds_completed: g.completed, max_level: g.maxLevel } : null });
    }
    function closeAbandoned(alive) {
      var me = T.ident.student_id, cid = T.content.content_id, now = new Date().toISOString();
      Q.list(OP).all.then(function (list) {
        list.forEach(function (kv) {
          var m = kv[1];
          if (!m || m.session_id === T.session_id || alive[m.session_id] || m.student_id !== me || !m.content || m.content.content_id !== cid) return;
          var seq = m.seq, base = function (type, data) {
            return { v: VERSION, event_id: uuid(), seq: ++seq, ts: m.ts, t_ms: m.t_ms, session_id: m.session_id, student_id: m.student_id, class_section: m.class_section,
              school: m.school, mode: m.mode, content: m.content, device: m.device, type: type, data: data };
          };
          var evs = [];
          if (m.quiz) evs.push(base('quiz_session_end', Object.assign({ completed: false, reason: 'abandoned_or_killed', last_event_ts: m.ts, detected_at: now, synthetic: true }, m.quiz.segment || {})));   // kit 1.2.2: an open game quiz segment first
          if (m.round) evs.push(base('item_end', { item_id: m.round.id, round_id: m.round.id, level: m.round.level, outcome: 'quit', score: 0, retries: m.round.retries || 0, abandoned: true, synthetic: true }));
          var d = { completed: false, reason: 'abandoned_or_killed', last_event_ts: m.ts, detected_at: now, synthetic: true };
          if (m.game) { d.score = m.game.score; d.rounds_played = m.game.rounds_played + (m.round ? 1 : 0); d.rounds_completed = m.game.rounds_completed; d.max_level = m.game.max_level; }
          evs.push(base(m.content.content_type === 'quiz' ? 'quiz_session_end' : 'session_end', d));   // kit 1.2.1: a quiz closes with its own end event
          evs.forEach(function (ev) { post(ev); if (endpoint) Q.put(EP + ev.session_id + ':' + pad(ev.seq), { e: ev, r: 0 }); });   // r 0: the server maps them with the session's stored events
          Q.del([kv[0]]);
        });
        flush();
      });
    }
    /* other tabs answer "who is open" over BroadcastChannel, so a live session in another tab is never closed */
    var bc = null;
    try { if (typeof BroadcastChannel !== 'undefined') { bc = new BroadcastChannel('zq_sessions'); unref(bc); bc.onmessage = function (e) { var m = e.data || {}; if (m.q === 'who' && !T.ended) bc.postMessage({ a: T.session_id }); }; } } catch (e) { bc = null; }
    function checkAbandoned() {
      if (!bc) return closeAbandoned({});
      var alive = {}; var h = function (e) { var m = e.data || {}; if (m.a) alive[m.a] = 1; };
      bc.addEventListener('message', h); bc.postMessage({ q: 'who' });
      setTimeout(function () { bc.removeEventListener('message', h); closeAbandoned(alive); }, 400);
    }

    // ---------- the envelope ----------
    function emit(type, data, tsIso) {   // tsIso: optional, so a model computed just before emitting uses the exact same timestamp
      var ev = { v: VERSION, event_id: uuid(), seq: ++T.seq, ts: tsIso || new Date().toISOString(), t_ms: Math.round(clock() - t0),
        session_id: T.session_id, student_id: T.ident.student_id, class_section: T.ident.class_section, school: T.ident.school, mode: T.ident.mode,
        content: T.content, device: dev, type: type, data: data || {} };
      T.events.push(ev);
      if (T.rows) { try { T.rows.add(ev); } catch (e) { /* rows never break the lesson */ } }
      deliver(ev);
      try { marker(ev); } catch (e) { /* marker is best effort */ }
      for (var i = 0; i < T.listeners.length; i++) { try { T.listeners[i](ev); } catch (e) { /* a listener never breaks the lesson */ } }
      return ev;
    }

    // ---------- pause accounting (hidden tab, idle, voice replay) ----------
    function pauseStart() { if (T.paused.since == null) T.paused.since = clock(); }
    function pauseEnd() { if (T.paused.since != null) { T.paused.total += clock() - T.paused.since; T.paused.since = null; } }
    function pausedTotal() { return T.paused.total + (T.paused.since != null ? clock() - T.paused.since : 0); }
    var idleTimer = null;
    function input() {
      T.lastInput = clock();
      if (T.step && T.step.idleFrom != null) { var idle = clock() - T.step.idleFrom; T.step.idleFrom = null; pauseEnd(); emit('idle', { step_id: T.step.id, idle_ms: Math.round(idle + IDLE_MS) }); }
      armIdle();
    }
    function armIdle() {
      if (typeof setTimeout === 'undefined') return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { if (T.step && T.step.ready != null && !T.step.done) { T.step.idleFrom = clock(); pauseStart(); } }, IDLE_MS);
    }
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        var vis = document.visibilityState !== 'hidden';
        if (vis) pauseEnd(); else pauseStart();
        emit('focus_change', { visible: vis });
        if (vis) retryNow(); else flush(true);
      });
      ['pointerdown', 'keydown'].forEach(function (n) { document.addEventListener(n, input, true); });
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', retryNow);
      // page closed: each content type ends with its OWN end event (kit 1.2.1: a quiz sitting -> quiz_session_end {completed:false, reason:'pagehide'},
      // before it got a lesson-style session_end); a page that never started a session sends nothing
      window.addEventListener('pagehide', function () {
        if (!T.ended && T.seq > 0) {
          if (T.content.content_type === 'game' && api && api.game) { if (api.quiz && api.quiz.open) api.quiz.segmentEnd(false, { reason: 'pagehide' }); if (api.game.round) api.game.roundEnd('quit', 0); api.game.end(false); }
          else if (T.content.content_type === 'quiz' && api && api.quiz) api.quiz.end(false, { reason: 'pagehide' });
          else { T.ended = true; emit('session_end', sessionEndData(false)); }
        }
        flush(true);
      });
      window.addEventListener('message', function (e) {
        var m = e.data; if (!m || m.zq !== 'init') return;
        ['student_id', 'class_section', 'school', 'mode', 'launch', 'entry'].forEach(function (k) { if (m[k] != null) T.ident[k] = m[k]; });
      });
    }

    // ---------- Session ----------
    function sessionStart(extra) {
      var d = { resume: false, session_kind: T.content.content_type || 'lesson', launch: T.ident.launch, entry: T.ident.entry, kit_version: KIT };
      for (var k in (extra || {})) d[k] = extra[k];
      var ev = emit('session_start', d);
      started();
      return ev;
    }
    /* once per page, after the first start event (session_start, or quiz_session_start since kit 1.2.1): heartbeats, the killed-session
       check (a killed earlier sitting of the same student + content is closed) and a first flush. Before 1.2.1 a quiz app never ran it. */
    function started() {
      if (T.started) return;
      T.started = true;
      if (typeof document !== 'undefined' && typeof setInterval !== 'undefined')
        unref(setInterval(function () { if (!T.ended && document.visibilityState !== 'hidden') emit('heartbeat', { t_active_ms: Math.round(clock() - t0 - pausedTotal()) }); }, HEARTBEAT_MS));
      try { checkAbandoned(); } catch (e) { /* best effort */ }
      flush();
    }
    function sessionEndData(completed, extra) {
      var d = { completed: !!completed, reward_total: T.counts.reward, max: T.counts.max, t_active_ms: Math.round(clock() - t0 - pausedTotal()), items_done: T.counts.items, steps_done: T.counts.steps };
      for (var k in (extra || {})) d[k] = extra[k];
      return d;
    }
    function sessionEnd(completed, extra) { if (T.ended) return null; T.ended = true; var ev = emit('session_end', sessionEndData(completed, extra)); flush(true); return ev; }

    // ---------- Item ----------
    function itemStart(d) { T.item = { id: d.item_id, t: clock(), p: pausedTotal(), reward: 0, max: 0, steps: 0 }; return emit('item_start', d); }
    function itemEnd(extra) {
      var it = T.item; if (!it) return null; T.item = null; T.counts.items++;
      var d = { item_id: it.id, steps_done: it.steps, reward_score: it.reward, max: it.max, t_total_ms: Math.round(clock() - it.t - (pausedTotal() - it.p)), abandoned: false };
      for (var k in (extra || {})) d[k] = extra[k];
      return emit('item_end', d);
    }

    /* ---------- Step ----------
       spec (from the item spec): {step_id, item_id, label, role, kc_q, response_mode, guess_c, level, speed_relevance,
                                   wm_load, novelty, mis_signatures, expected_time_s, max_score}
       returns a step handle: ready(voiceSkipped), touch(), attempt(d), hint(level, kind, requested), observe(kind, value),
       feedback(kind, ms), end(d)                                                                                        */
    function step(spec) {
      var st = { id: spec.step_id, spec: spec, ready: null, firstTouch: null, n: 0, hintsSeen: 0, requested: 0, done: false, p0: 0, idleFrom: null, attempts: [] };
      T.step = st;
      var h = {
        spec: spec,
        ready: function (voiceSkipped) {
          st.ready = clock(); st.p0 = pausedTotal(); st.firstTouch = null; armIdle();
          return emit('step_ready', { step_id: st.id, item_id: spec.item_id, label: spec.label || null, ready_t_ms: Math.round(st.ready - t0), voice_skipped: !!voiceSkipped,
            role: spec.role, kc_q: spec.kc_q, response_mode: spec.response_mode, guess_c: spec.guess_c, level: spec.level, speed_relevance: spec.speed_relevance || 'none',
            wm_load: spec.wm_load || 0, novelty: spec.novelty || 'new', mis_signatures: spec.mis_signatures || [], expected_time_s: spec.expected_time_s || null,
            mission_id: spec.mission_id || null, scaffold: !!spec.scaffold, strategy_kc: spec.strategy_kc || null, context_id: spec.context_id || null,
            item_name: spec.item_name || null, right_answer: spec.right != null ? spec.right : null, max_attempts: spec.max_attempts || null });
        },
        touch: function () { if (st.ready != null && st.firstTouch == null) st.firstTouch = clock(); input(); },
        elapsed: function () { return st.ready == null ? 0 : Math.round(clock() - st.ready - (pausedTotal() - st.p0)); },
        /* d = {response, outcome: correct|partial|incorrect, score, misconception, strategy, abs_error, rel_error, moves, undos, motor_misses, sequence} */
        attempt: function (d) {
          st.n++;
          var tSub = clock(), paused = pausedTotal() - st.p0;
          var a = { step_id: st.id, attempt_no: st.n, response: d.response, outcome: d.outcome, score: d.score,
            t_first_ms: Math.round((st.firstTouch != null ? st.firstTouch : tSub) - st.ready), t_submit_ms: Math.max(0, Math.round(tSub - st.ready - paused)), paused_ms: Math.round(paused),
            moves: d.moves || 0, undos: d.undos || 0, motor_misses: d.motor_misses || 0, hints_before: st.hintsSeen, requested_before: st.requested,
            misconception: d.misconception || null, strategy: d.strategy || null };
          ['abs_error', 'rel_error', 'sequence', 'unit', 'strat_rank'].forEach(function (k) { if (d[k] != null) a[k] = d[k]; });
          st.attempts.push(a);
          st.firstTouch = null;
          return emit('attempt', a);
        },
        hint: function (level, kind, requested) {
          st.hintsSeen = Math.max(st.hintsSeen, level); if (requested) st.requested++;
          return emit('hint', { step_id: st.id, level: level, kind: kind, requested: !!requested, t_since_ready_ms: st.ready == null ? 0 : Math.round(clock() - st.ready) });
        },
        replay: function (clipId) { return emit('media', { clip_id: clipId, action: 'replay', step_id: st.id }); },
        observe: function (kind, value) { return emit('observation', { step_id: st.id, kind: kind, value: value }); },
        feedback: function (kind, ms) { return emit('feedback', { step_id: st.id, kind: kind, dur_ms: Math.round(ms || 0) }); },
        /* d = {code, ev_score, reward_score, flags, solution, solution_new, strategy, misconception} */
        end: function (d, tsIso) {
          if (st.done) return null; st.done = true; T.counts.steps++;
          var reward = d.reward_score != null ? d.reward_score : 0, max = spec.max_score != null ? spec.max_score : 1;
          if (spec.role !== 'instruct') { T.counts.reward += reward; T.counts.max += max; if (T.item) { T.item.reward += reward; T.item.max += max; } }
          if (T.item) T.item.steps++;
          var out = { step_id: st.id, item_id: spec.item_id, role: spec.role, code: d.code, ev_score: d.ev_score, reward_score: reward, attempts: st.n,
            t_total_ms: st.ready == null ? 0 : Math.round(clock() - st.ready - (pausedTotal() - st.p0)), flags: d.flags || [], kc_q: spec.kc_q, level: spec.level,
            hints_max: st.hintsSeen, hints_requested: st.requested, speed_relevance: spec.speed_relevance || 'none' };
          ['solution', 'solution_new', 'strategy', 'misconception', 'first_answer', 'right_answer'].forEach(function (k) { if (d[k] != null) out[k] = d[k]; });
          if (T.step === st) T.step = null;
          return emit('step_end', out, tsIso);
        },
        attempts: function () { return st.attempts.slice(); }
      };
      return h;
    }

    // ---------- the rest of the 6 blocks + adaptivity ----------
    function routeAssigned(d) { return emit('route_assigned', d); }
    function levelChange(from, to, rule, extra) { var d = { from: from, to: to, rule: rule }; for (var k in (extra || {})) d[k] = extra[k]; return emit('level_change', d); }
    function choice(d) { return emit('choice', d); }                 // {choice_id, kind: context|design|explore, offered:[], chosen, item_id?}
    function media(clipId, action, extra) { var d = { clip_id: clipId, action: action }; for (var k in (extra || {})) d[k] = extra[k]; if (action === 'replay') pauseStart(); return emit('media', d); }
    function mediaEnd() { pauseEnd(); }
    function brainDelta(d) { return emit('brain_delta', d); }
    var lastInter = 0;
    function interaction(d) { var t = clock(); if (t - lastInter < 250) return null; lastInter = t; return emit('interaction', d); }   // throttled <= 4/s

    // ---------- games: same envelope, Game Stats layer only (never mastery) ----------
    var game = {
      round: null, rounds: 0, completed: 0, maxLevel: 1, score: 0,
      roundStart: function (roundId, level, extra) { game.round = { id: roundId, level: level, t: clock(), p: pausedTotal(), retries: 0 }; game.maxLevel = Math.max(game.maxLevel, level || 1); var d = { item_id: roundId, round_id: roundId, level: level }; for (var k in (extra || {})) d[k] = extra[k]; return emit('item_start', d); },
      retry: function () { if (game.round) game.round.retries++; },
      roundEnd: function (outcome, score, extra) {
        var r = game.round; if (!r) return null; game.round = null; game.rounds++; if (outcome === 'completed') game.completed++; game.score += score || 0;
        var d = { item_id: r.id, round_id: r.id, level: r.level, outcome: outcome, score: score || 0, active_ms: Math.round(clock() - r.t - (pausedTotal() - r.p)), retries: r.retries };
        for (var k in (extra || {})) d[k] = extra[k];
        return emit('item_end', d);
      },
      end: function (completed, extra) {
        var d = { completed: !!completed, score: game.score, rounds_played: game.rounds, rounds_completed: game.completed, max_level: game.maxLevel, t_active_ms: Math.round(clock() - t0 - pausedTotal()) };
        for (var k in (extra || {})) d[k] = extra[k];
        if (T.ended) return null; T.ended = true; var ev = emit('session_end', d); flush(true); return ev;
      }
    };

    // ---------- quizzes (content_type quiz, 2026-11-06): quiz evidence for the combined model + the quiz-only analysis ----------
    // T.quiz.start({quiz_kind: 'student_mcq', level: 2, n_items: 10}); T.quiz.shown(qid, 1, {level: 2, option_order: [...]});
    // T.quiz.answer({question_id, level, chosen_option, correct, first_option?, changed_answer?, n_changes?, hint_viewed?, skills?, option_mistakes?});
    // T.quiz.explanation(qid) after the answer; T.quiz.end(true, {passed, next_level}). time_ms = shown -> answer with paused time removed.
    // Ladder (2026-11-11): T.quiz.levelChange(change) -> quiz_level_change; T.quiz.timeout(qid, {level}) -> quiz_answer {timed_out: true}.
    var quiz = {
      shownAt: {}, answered: 0, correct: 0, expl: {},
      open: false, seg: null,
      start: function (extra) {
        var d = { launch: T.ident.launch, entry: T.ident.entry, quiz_kind: 'student_mcq', kit_version: KIT }; for (var k in (extra || {})) d[k] = extra[k];
        quiz.open = true; quiz.answered = 0; quiz.correct = 0; quiz.t0 = clock(); quiz.p0 = pausedTotal();
        quiz.seg = (d.game != null || d.game_segment != null) ? { game: d.game != null ? d.game : undefined, game_segment: d.game_segment != null ? d.game_segment : undefined } : null;
        var ev = emit('quiz_session_start', d); started(); return ev;
      },
      shown: function (questionId, position, extra) { quiz.shownAt[questionId] = { t: clock(), p: pausedTotal() }; var d = { question_id: questionId, position: position }; for (var k in (extra || {})) d[k] = extra[k]; return emit('quiz_item_shown', d); },
      answer: function (d) {
        d = d || {}; var s = quiz.shownAt[d.question_id];
        if (d.time_ms == null && s) d.time_ms = Math.round(clock() - s.t - (pausedTotal() - s.p));
        if (d.chosen_option == null) d.skipped = true; else { quiz.answered++; if (d.correct) quiz.correct++; }
        if (d.changed_answer == null) d.changed_answer = !!(d.first_option != null && d.chosen_option != null && d.first_option !== d.chosen_option);
        if (d.hint_viewed == null) d.hint_viewed = false;
        if (d.explanation_viewed == null) d.explanation_viewed = false;
        return emit('quiz_answer', d);
      },
      explanation: function (questionId) { quiz.expl[questionId] = 1; return emit('interaction', { action: 'explanation_viewed', target: questionId }); },
      // MCQ quiz ladder (2026-11-11, schema 2.3.0; zq-quiz-ladder.js). T.quiz.start(QL.startFields(st)) carries attempt_no, start_level,
      // start_reason, ladder_version, cfg_hash; after each QL.answer with r.change: T.quiz.levelChange(r.change); at the 12-minute
      // time-out: T.quiz.timeout(qidOnScreen, {level}); at the end: T.quiz.end(true, QL.endFields(QL.end(st))).
      levelChange: function (ch, extra) {
        ch = ch || {}; var d = { from: ch.from, to: ch.to, reason: ch.reason, position: ch.position != null ? ch.position : null, question_id: ch.question_id != null ? ch.question_id : null };
        for (var k in (extra || {})) d[k] = extra[k]; return emit('quiz_level_change', d);
      },
      timeout: function (questionId, extra) {
        if (questionId == null) return null;
        var d = { question_id: questionId, chosen_option: null, correct: false, skipped: true, timed_out: true };
        for (var k in (extra || {})) d[k] = extra[k]; return quiz.answer(d);
      },
      end: function (completed, extra, opts) {
        if (opts && opts.segment) return quiz.segmentEnd(completed, extra);
        var d = { completed: !!completed, n_answered: quiz.answered, n_correct: quiz.correct, score_pct: quiz.answered ? Math.round(1000 * quiz.correct / quiz.answered) / 10 : null,
          t_active_ms: Math.round(clock() - t0 - pausedTotal()) };
        for (var k in (extra || {})) d[k] = extra[k];
        if (T.ended) return null; T.ended = true; quiz.open = false; var ev = emit('quiz_session_end', d); flush(true); return ev;
      },
      /* kit 1.2.2: end ONE quiz segment of a game (the session goes on; the next T.quiz.start() opens the next segment) */
      segmentEnd: function (completed, extra) {
        if (!quiz.open || T.ended) return null;
        var d = { completed: !!completed, n_answered: quiz.answered, n_correct: quiz.correct, score_pct: quiz.answered ? Math.round(1000 * quiz.correct / quiz.answered) / 10 : null,
          t_active_ms: Math.max(0, Math.round(clock() - (quiz.t0 != null ? quiz.t0 : t0) - (pausedTotal() - (quiz.p0 || 0)))) };
        if (quiz.seg) { if (quiz.seg.game !== undefined) d.game = quiz.seg.game; if (quiz.seg.game_segment !== undefined) d.game_segment = quiz.seg.game_segment; }
        for (var k in (extra || {})) d[k] = extra[k];
        quiz.open = false; var ev = emit('quiz_session_end', d); flush(); return ev;
      }
    };
    // ---------- videos (content_type video): context only, never mastery ----------
    // T.video.play(pos, {scene_id}); T.video.pause(pos, watched_s); T.video.seek(from, to); T.video.complete(pos, watched_s, duration_s)
    function vid(type, d, extra) { d.video_id = d.video_id || T.content.content_id; for (var k in (extra || {})) d[k] = extra[k]; return emit(type, d); }
    var video = {
      play: function (pos, extra) { return vid('video_play', { position_s: pos }, extra); },
      pause: function (pos, watched, extra) { return vid('video_pause', { position_s: pos, watched_s: watched }, extra); },
      seek: function (from, to, extra) { return vid('video_seek', { from_s: from, to_s: to }, extra); },
      complete: function (pos, watched, duration, extra) { return vid('video_complete', { position_s: pos, watched_s: watched, duration_s: duration }, extra); }
    };

    function summary() {
      var steps = T.events.filter(function (e) { return e.type === 'step_end'; });
      return { session_id: T.session_id, student_id: T.ident.student_id, events: T.events.length, steps: steps.length,
        first_try: steps.filter(function (e) { return e.data.code === 'FIRST_TRY' && e.data.ev_score >= 1; }).length,
        reward_total: T.counts.reward, max: T.counts.max, route: (T.events.filter(function (e) { return e.type === 'route_assigned'; })[0] || { data: {} }).data.route || null };
    }

    var api = { session_id: T.session_id, ident: ident, emit: emit, sessionStart: sessionStart, sessionEnd: sessionEnd, itemStart: itemStart, itemEnd: itemEnd,
      step: step, routeAssigned: routeAssigned, levelChange: levelChange, choice: choice, media: media, mediaEnd: mediaEnd, brainDelta: brainDelta,
      interaction: interaction, game: game, quiz: quiz, video: video, pause: pauseStart, resume: function (chapterId) { if (typeof chapterId === 'string') return resumeModel(chapterId); return pauseEnd(); }, unpause: pauseEnd, resumeModel: resumeModel,
      attachRows: function (R) { T.rows = R || null; return api; }, input: input, flush: flush, summary: summary, deadLetters: deadLetters, requeueDead: function () { return requeueDead(false); },
      getEvents: function () { return T.events.slice(); }, onEvent: function (fn) { T.listeners.push(fn); } };
    if (typeof window !== 'undefined') window.ZQ = { getEvents: api.getEvents, getSummary: summary, onEvent: api.onEvent, session_id: T.session_id, getDeadLetters: deadLetters };
    return api;
  }
  return { init: init, uuid: uuid, VERSION: VERSION, KIT_VERSION: KIT };
});

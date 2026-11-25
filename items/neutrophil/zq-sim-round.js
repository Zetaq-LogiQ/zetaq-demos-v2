/* ZetaQ SIM ROUND adapter 1.0 (2026-11-13) - a STANDALONE sim (not a lesson sim) sends the SAME output as a round game.
   ZETAQ_ONE_STANDARD section 10. Contract 1.0 "round game" shape only: nothing new, nothing renamed. Needs zq-telemetry.js (kit 1.2.x).

   A sim = a few TASKS (3-6). Each task is one game round:
     item_start {item_id = round_id = <content_id>:<task slug>, level}
     item_end   {item_id, round_id, level, outcome completed|failed|quit, score = stars/3, active_ms, retries,
                 stars 1-3, time_s, hints_used, completed}
   What the child does inside a task -> interaction {action, target, value} (e.g. set / voltage / 3).
   End of the sim -> session_end {completed, score, rounds_played, rounds_completed, max_level, t_active_ms, stars}.
   The kit adds the rest by itself: session_start (launch assigned|voluntary from the host), heartbeat, focus_change, idle.

   USE
     var S = ZQSim.start({ content: { board:'CBSE', class:7, subject:'SCI', chapter_id:'CB-C7-SCI-03', chapter:'...',
                                      content_id:'CB-C7-SCI-03-GAME-CIRCUITLAB', content_version:'1.0' },
                           tasks: [{ id:'light_bulb', level:1 }, { id:'two_cells', level:2 }, ...] });
     S.task('light_bulb');                 // start a task (ends an open one as quit)
     S.act('toggle', 'switch', true);      // anything the child does (action / target / value)
     S.retry(); S.hint();                  // a retry / a hint inside the task
     S.done(3);                            // task solved: stars 1-3 (how well: 3 = first try, no hint)
     S.fail();                             // task given up / wrong end state
     S.end();                              // the child leaves the sim (also sent on page close by the kit)
   Rules enforced here (throws in the console, never sends a bad event): task ids from the declared list only, slug
   [a-z0-9_], stars integer 1-3, level integer 1-5, content_type always 'game', content_id must end with -GAME-<NAME>. */
(function (root) {
  'use strict';
  var VERSION = '1.0', SLUG = /^[a-z0-9_]{1,40}$/, CID = /^CB-C\d+-(MATH|SCI|SS|ENG|HIN|EVS)-\d{2}-GAME-[A-Z0-9]+$/;
  function fail(msg) { var e = new Error('ZQSim: ' + msg); if (root.console) console.error(e.message); throw e; }

  function start(opts) {
    opts = opts || {};
    var c = Object.assign({}, opts.content || {}, { content_type: 'game' });
    if (!CID.test(c.content_id || '')) fail('content_id must be <chapter_id>-GAME-<NAME>, got ' + c.content_id);
    if (c.content_id.indexOf(c.chapter_id + '-') !== 0) fail('content_id ' + c.content_id + ' is not in chapter ' + c.chapter_id);
    var tasks = {}, order = [];
    (opts.tasks || []).forEach(function (t) {
      if (!SLUG.test(t.id || '')) fail('task id must be a slug [a-z0-9_]: ' + t.id);
      var lv = t.level == null ? 1 : t.level; if (!(lv === (lv | 0) && lv >= 1 && lv <= 5)) fail('task level must be 1-5: ' + t.id);
      if (tasks[t.id]) fail('task id twice: ' + t.id);
      tasks[t.id] = { id: t.id, level: lv }; order.push(t.id);
    });
    if (order.length < 1) fail('a sim needs at least one task (3-6 recommended)');
    var T = root.ZQTelemetry.init(Object.assign({}, opts.telemetry || {}, { content: c }));
    T.sessionStart({ session_kind: 'game' });   // same as the True/False road
    var cur = null, hints = 0, t0 = 0, solved = {}, starsAll = [];
    function now() { return (root.performance && performance.now) ? performance.now() : Date.now(); }
    function close(outcome, stars) {
      if (!cur) return null;
      var d = { time_s: Math.round((now() - t0) / 100) / 10, hints_used: hints, completed: outcome === 'completed' };
      if (stars != null) d.stars = stars;
      var ev = T.game.roundEnd(outcome, stars != null ? Math.round(stars / 3 * 10000) / 10000 : 0, d);
      if (outcome === 'completed') { solved[cur.id] = true; starsAll.push(stars); }
      cur = null; hints = 0; return ev;
    }
    var api = {
      VERSION: VERSION, T: T,
      task: function (id) {
        if (!tasks[id]) fail('unknown task ' + id + ' (declare it in tasks)');
        if (cur) close('quit');
        cur = tasks[id]; hints = 0; t0 = now();
        return T.game.roundStart(c.content_id + ':' + id, cur.level);
      },
      act: function (action, target, value) {
        if (typeof action !== 'string' || !action) fail('act(action, target, value): action is a non-empty string');
        return T.interaction({ action: action, target: target === undefined ? null : target, value: value === undefined ? null : value });   // kit throttles to 4/s
      },
      retry: function () { if (cur) T.game.retry(); },
      hint: function () { if (cur) hints++; },
      done: function (stars) {
        if (!cur) fail('done() without a task');
        if (!(stars === (stars | 0) && stars >= 1 && stars <= 3)) fail('stars must be 1, 2 or 3');
        return close('completed', stars);
      },
      fail: function () { if (!cur) fail('fail() without a task'); return close('failed'); },
      end: function () {
        if (cur) close('quit');
        var all = order.every(function (id) { return solved[id]; });
        var extra = starsAll.length ? { stars: Math.round(starsAll.reduce(function (a, b) { return a + b; }, 0) / starsAll.length) } : {};
        return T.game.end(all, extra);
      },
      state: function () { return { task: cur && cur.id, solved: Object.keys(solved), tasks: order.slice() }; }
    };
    return api;
  }
  root.ZQSim = { start: start, VERSION: VERSION };
})(typeof window !== 'undefined' ? window : this);

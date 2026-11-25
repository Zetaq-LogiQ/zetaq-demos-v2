/* Electromagnet Bench - CB-C8-SCI-04-GAME-ELECTROMAGNET (ONE STANDARD s10, sim_round 1.0). Class 8 Science ch04
   "Electricity: Magnetic and Heating Effects", Activities 4.1-4.4 + "Think like a scientist". Units: 1 world unit = 1 cm.
   Geography of the bench: north = -z (into the screen), east = +x. Earth's horizontal field = 1 unit along -z.
   MODEL (simple, monotonic, physically plausible)
   - Current: I = n E / (n r + R_ext + R_coil), E = 1.5 V and r = 0.3 ohm per cell, R_ext = 1.5 ohm (switch, contacts, leads),
     R_coil = 0.0035 ohm per turn (wire station: R_coil = 0). More cells -> larger current (book).
   - Wire station: field at the needle (wire 1 cm above it) = 0.45 I (Earth units) along dl x r_hat (Biot-Savart direction, computed
     from the real wire path); needle points along Earth + wire field. Reverse the cells -> the deflection reverses.
   - Coil: ampere-turns NI. Coil alone (paper tube) or aluminium rod (not a magnetic material): field at the end compasses
     = 0.004 NI (a few degrees to about 30), too weak to lift clips. Iron nail core: field = 12 tanh(NI/150), clips lifted = floor(30 tanh(NI/150)).
     Both grow with more turns and with more cells (book: strength depends on the current and the number of turns).
   - Poles: the magnetic moment direction is computed from the drawn winding (sum of r x dl along the helix in the current
     direction), so the end where the field leaves = North. Compasses = dipole field of the coil + Earth's field, damped needle.
   DATA: only window.__S (the adapter): task / act / hint / retry / done / fail / end. */
(function () {
  'use strict';
  var T3 = window.THREE, S = window.__S, TASKS = window.__TASKS;
  var V3 = function (x, y, z) { return new T3.Vector3(x || 0, y || 0, z || 0); };
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var $ = function (id) { return document.getElementById(id); };
  var DEG = 180 / Math.PI;
  var X0 = 75;                       // electromagnet station centre (x); the wire station is at x = 0
  var H_UP = 16, H_DOWN = 2.05;      // coil axis height: resting (level with the compasses) / lowered onto the clips
  var TUBE_R = .45, TUBE_L = 13, NAIL_L = 16, PITCH = .12, WIRE_R = .056, CMP_X = 11.6;
  var CORES = [{ id: 'none', name: 'No core' }, { id: 'iron', name: 'Iron nail' }, { id: 'alu', name: 'Aluminium rod' }];
  var CORE_NAME = { none: 'no core (paper tube only)', iron: 'iron nail', alu: 'aluminium rod' };

  // ------------------------------------------------------------------ state
  var st = { station: 'wire', sw: { wire: false, em: false }, cells: 1, rev: false, turns: 50, core: 'iron', down: false };
  var started = false, ended = false;
  function current(station) {
    var n = st.cells, rc = station === 'em' ? .0035 * st.turns : 0;
    return n * 1.5 / (n * .3 + 1.5 + rc);
  }
  function on(station) { return st.sw[station || st.station]; }
  function NI() { return st.turns * current('em'); }
  function clipsFor() { return st.core === 'iron' ? Math.floor(30 * Math.tanh(NI() / 150)) : 0; }
  function coilField() { return st.core === 'iron' ? 12 * Math.tanh(NI() / 150) : .004 * NI(); }

  // ------------------------------------------------------------------ renderer / scene
  var cv = $('cv');
  var renderer = new T3.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = T3.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; renderer.outputColorSpace = T3.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T3.PCFSoftShadowMap;
  var scene = new T3.Scene();
  var camera = new T3.PerspectiveCamera(36, 1, .5, 900);
  function canvasTex(w, h, draw, rep) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    var t = new T3.CanvasTexture(c); t.colorSpace = T3.SRGBColorSpace; t.anisotropy = 8;
    if (rep) { t.wrapS = t.wrapT = T3.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t;
  }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  scene.background = canvasTex(16, 256, function (g, w, h) { var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2b3a52'); gr.addColorStop(1, '#566a86'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  scene.fog = new T3.Fog('#4a5c76', 220, 520);
  (function env() {   // soft studio environment (cool sky / neutral ground), as the ch04 video kit
    var es = new T3.Scene();
    es.add(new T3.Mesh(new T3.SphereGeometry(10, 32, 16), new T3.MeshBasicMaterial({ side: T3.BackSide, map: canvasTex(16, 256, function (g, w, h) { var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.45, '#cfd9e6'); gr.addColorStop(1, '#55657c'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }) })));
    var box = new T3.Mesh(new T3.BoxGeometry(3, .2, 3), new T3.MeshBasicMaterial({ color: 0xffffff })); box.position.set(0, 6, 0); es.add(box);
    var pm = new T3.PMREMGenerator(renderer); scene.environment = pm.fromScene(es, .04).texture; pm.dispose(); scene.environmentIntensity = .75;
  })();
  scene.add(new T3.HemisphereLight(0xe6eefc, 0x4a5262, .85));
  var key = new T3.DirectionalLight(0xfffaf2, 1.9); key.position.set(30, 80, 50); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); var sc = key.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 50; sc.bottom = -50; sc.near = 10; sc.far = 220;
  key.shadow.bias = -.0004; key.shadow.normalBias = .03; scene.add(key);
  var keyT = new T3.Object3D(); scene.add(keyT); key.target = keyT;
  var rim = new T3.DirectionalLight(0xb9d4ff, .7); rim.position.set(-60, 40, -60); scene.add(rim);

  var M = {
    std: function (c, o) { var p = { color: c, roughness: .55, metalness: 0 }; for (var k in o) p[k] = o[k]; return new T3.MeshStandardMaterial(p); },
    metal: function (c, r) { return new T3.MeshStandardMaterial({ color: c, roughness: r == null ? .32 : r, metalness: 1 }); },
    plastic: function (c, r) { return new T3.MeshStandardMaterial({ color: c, roughness: r == null ? .38 : r, metalness: 0 }); }
  };
  function mesh(geo, mat, x, y, z, parent) { var m = new T3.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; (parent || scene).add(m); return m; }
  function term(parent, x, y, z) { var o = new T3.Object3D(); o.position.set(x, y, z); parent.add(o); return o; }
  function wpos(o) { o.updateWorldMatrix(true, false); return o.getWorldPosition(V3()); }

  // ------------------------------------------------------------------ bench + room (rich texture, cool palette, no coplanar faces)
  (function room() {
    var r = rng(5);
    var topTex = canvasTex(1024, 1024, function (g, w, h) {
      g.fillStyle = '#4b5f77'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 90; i++) { var x = r() * w, y = r() * h, rad = 40 + r() * 220, d = (r() - .5) * 30, gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, d > 0 ? 'rgba(255,255,255,' + (d / 120) + ')' : 'rgba(10,20,35,' + (-d / 90) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        for (var ox = -w; ox <= w; ox += w) for (var oy = -h; oy <= h; oy += h) { g.save(); g.translate(ox, oy); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); } }
      for (var j = 0; j < 14; j++) { var yy = r() * h; g.strokeStyle = 'rgba(' + (r() < .5 ? '255,255,255' : '0,0,0') + ',' + (.03 + r() * .05) + ')'; g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(0, yy); for (var xx = 0; xx <= w; xx += 48) g.lineTo(xx, yy + Math.sin(xx / 120 + j) * 5); g.stroke(); }
      for (var k = 0; k < 14000; k++) { g.fillStyle = 'rgba(' + (r() < .5 ? '255,255,255' : '0,0,0') + ',' + (.03 + r() * .06) + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    }, [5, 2]);
    mesh(new T3.BoxGeometry(240, 4, 90), M.std(0xffffff, { map: topTex, roughness: .62 }), 37, -2, 0).castShadow = false;
    mesh(new T3.BoxGeometry(240, 4.2, 1.6), M.std(0x2a3445, { roughness: .5 }), 37, -2, 45.6);
    var wt = canvasTex(1024, 512, function (c, w, h) {
      c.fillStyle = '#8fa3b8'; c.fillRect(0, 0, w, h); var q = rng(9);
      for (var y = 0; y < h; y += 64) for (var x = 0; x < w; x += 64) { c.fillStyle = 'rgba(' + (q() < .5 ? '255,255,255' : '20,30,50') + ',' + (.03 + q() * .05) + ')'; c.fillRect(x + 2, y + 2, 60, 60); }
      c.fillStyle = 'rgba(47,181,214,.55)'; c.fillRect(0, h * .62, w, 14); c.fillStyle = 'rgba(122,92,214,.35)'; c.fillRect(0, h * .62 + 18, w, 6);
    }, [4, 1]);
    var wall = mesh(new T3.PlaneGeometry(420, 160), M.std(0xffffff, { map: wt, roughness: .85 }), 37, 60, -46); wall.castShadow = false;
    var shelf = mesh(new T3.BoxGeometry(70, 1.6, 9), M.std(0xdfe5ec), -10, 34, -40.5);
    var cols = [0x2fb5d6, 0x7a5cd6, 0x2fae66, 0xe0508a, 0xf2c230, 0x3a6fd8];
    for (var i = 0; i < 9; i++) mesh(new T3.BoxGeometry(5 + (i % 3) * 1.6, 7 + (i % 2) * 4, 6), M.std(cols[i % 6], { roughness: .6 }), -38 + i * 7, 38.5 + (i % 2) * 2, -40.5);
    var shelf2 = mesh(new T3.BoxGeometry(60, 1.6, 9), M.std(0xdfe5ec), 110, 30, -40.5);
    for (var j = 0; j < 7; j++) mesh(new T3.CylinderGeometry(2.2, 2.2, 6 + (j % 3) * 2, 24), M.std(cols[(j + 2) % 6], { roughness: .5 }), 86 + j * 8, 34 + (j % 3), -40.5);
    // a lab notebook + pencil on the bench (props)
    var nb = mesh(new T3.BoxGeometry(12, .5, 16), M.std(0x2f6fd0, { roughness: .7 }), 38, .27, -14); nb.rotation.y = .25;
    var pg = mesh(new T3.BoxGeometry(11, .12, 15), M.std(0xf4f6f8, { roughness: .9 }), 38, .58, -14); pg.rotation.y = .25;
    var pen = mesh(new T3.CylinderGeometry(.35, .35, 14, 6), M.std(0xf2c230), 41, .95, -13); pen.rotation.z = Math.PI / 2; pen.rotation.y = .9;
  })();

  // ------------------------------------------------------------------ props (geometry ideas from the ch04 video kit props.js)
  function cellMesh(L, r) {
    var g = new T3.Group();
    var can = mesh(new T3.CylinderGeometry(r, r, L * .82, 40), M.std(0x2c6fd6, { roughness: .35, metalness: .3 }), 0, 0, 0, g); can.rotation.z = Math.PI / 2;
    var bnd = mesh(new T3.CylinderGeometry(r * 1.006, r * 1.006, L * .2, 40), M.std(0xe9edf2, { roughness: .35, metalness: .3 }), L * .26, 0, 0, g); bnd.rotation.z = Math.PI / 2;
    var neg = mesh(new T3.CylinderGeometry(r * .96, r * .96, L * .04, 40), M.metal(0xc8ced6, .25), -L * .43, 0, 0, g); neg.rotation.z = Math.PI / 2;
    var cap = mesh(new T3.CylinderGeometry(r * .96, r * .96, L * .04, 40), M.metal(0xc8ced6, .25), L * .43, 0, 0, g); cap.rotation.z = Math.PI / 2;
    var nub = mesh(new T3.CylinderGeometry(r * .32, r * .36, L * .06, 24), M.metal(0xd6dbe2, .2), L * .475, 0, 0, g); nub.rotation.z = Math.PI / 2;
    [['+', L * .3], ['−', -L * .3]].forEach(function (q) {
      var tx = canvasTex(128, 128, function (c) { c.fillStyle = '#fff'; c.font = 'bold 110px Segoe UI, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(q[0], 64, 70); });
      var p = new T3.Mesh(new T3.PlaneGeometry(r * 1.1, r * 1.1), new T3.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false })); p.position.set(q[1], r * 1.03, 0); p.rotation.x = -Math.PI / 2; g.add(p);
    });
    return g;
  }
  // cell holder: up to 4 cells in series; terminal T1 at -x end, T2 at +x end. Not reversed: + at T2.
  function makeHolder(parent) {
    var L = 5, r = .72, g = new T3.Group(); parent.add(g);
    var trayM = M.plastic(0x2a2f38, .5), tabM = M.metal(0xc9cfd6, .3);
    var parts = [], cells = [];
    g.T1 = term(g, 0, 0, 0); g.T2 = term(g, 0, 0, 0);
    g.build = function (n, rev) {
      parts.forEach(function (p) { g.remove(p); }); parts = []; cells = [];
      var len = n * L + 1.4;
      var add = function (m) { parts.push(m); return m; };
      add(mesh(new T3.BoxGeometry(len, .3, r * 2.5), trayM, 0, -r - .05, 0, g));
      [-1, 1].forEach(function (s) { add(mesh(new T3.BoxGeometry(len, r * 1.3, .2), trayM, 0, -r * .4, s * r * 1.22, g)); });
      for (var i = 0; i < n; i++) { var c = cellMesh(L, r); c.position.x = -len / 2 + .7 + L * (i + .5); if (rev) c.rotation.y = Math.PI; g.add(c); add(c); cells.push(c); }
      [-1, 1].forEach(function (s) {
        add(mesh(new T3.BoxGeometry(.18, r * 2.6, r * 1.4), tabM, s * (len / 2 - .05), r * .2, 0, g));
        add(mesh(new T3.CylinderGeometry(.24, .24, .3, 16), M.metal(0xb7bec7, .25), s * (len / 2 + .12), r * 1.45, 0, g));
      });
      g.T1.position.set(-(len / 2 + .12), r * 1.5, 0); g.T2.position.set(len / 2 + .12, r * 1.5, 0);
      g.position.y = r + .36;
    };
    return g;
  }
  // drawing-pin + safety-pin switch on cardboard. set(k): 0 open, 1 closed. terminals a (pivot pin), b
  function makeSwitch(parent) {
    var s = 6, g = new T3.Group(); parent.add(g);
    mesh(new T3.BoxGeometry(s, .3, s * .7), M.std(0xc9a77c, { roughness: .9 }), 0, .17, 0, g);
    var headM = M.plastic(0xd94040, .35), pinM = M.metal(0xd8dde4, .2);
    mesh(new T3.CylinderGeometry(.5, .5, .2, 24), headM, -s * .3, .42, 0, g); mesh(new T3.CylinderGeometry(.5, .5, .2, 24), headM, s * .3, .42, 0, g);
    var piv = new T3.Group(); piv.position.set(-s * .3, .6, 0); g.add(piv);
    mesh(new T3.BoxGeometry(s * .66, .12, .3), pinM, s * .33, 0, 0, piv);
    var loop = mesh(new T3.TorusGeometry(.3, .07, 8, 20), pinM, 0, 0, 0, piv); loop.rotation.x = Math.PI / 2;
    g.set = function (k) { piv.rotation.y = .75 * (1 - k); piv.position.y = .6 + (1 - k) * .06; };
    g.k = 0; g.set(0);
    g.a = term(g, -s * .3, .5, 0); g.b = term(g, s * .3, .5, 0);
    return g;
  }
  // magnetic compass (red = north end of the needle). needle angle: 0 = north (-z), + = towards east (+x)
  var dialTex = canvasTex(512, 512, function (g, w) {
    var c = w / 2; g.fillStyle = '#f7f8f6'; g.fillRect(0, 0, w, w); g.strokeStyle = '#20242c'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (var d = 0; d < 360; d += 10) { var a = d * Math.PI / 180, r0 = d % 30 === 0 ? c * .8 : c * .86; g.lineWidth = d % 30 === 0 ? 4 : 2; g.beginPath(); g.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0); g.lineTo(c + Math.sin(a) * c * .93, c - Math.cos(a) * c * .93); g.stroke(); }
    [['N', 0, '#c62a24'], ['E', 90, '#20242c'], ['S', 180, '#20242c'], ['W', 270, '#20242c']].forEach(function (q) { var a = q[1] * Math.PI / 180; g.save(); g.translate(c + Math.sin(a) * c * .64, c - Math.cos(a) * c * .64); g.rotate(a); g.fillStyle = q[2]; g.font = 'bold 64px Segoe UI, sans-serif'; g.fillText(q[0], 0, 0); g.restore(); });
  });
  function makeCompass(parent, r) {
    var g = new T3.Group(); parent.add(g);
    mesh(new T3.CylinderGeometry(r * .97, r, 1, 48), M.metal(0x8f9aa8, .35), 0, .5, 0, g);
    var ring = mesh(new T3.TorusGeometry(r * .975, .2, 10, 48), M.metal(0xb8c1cc, .25), 0, 1.35, 0, g); ring.rotation.x = Math.PI / 2;
    var dial = new T3.Mesh(new T3.CircleGeometry(r * .95, 48), new T3.MeshStandardMaterial({ map: dialTex, roughness: .7 })); dial.rotation.x = -Math.PI / 2; dial.position.y = 1.02; dial.receiveShadow = true; g.add(dial);
    var n = new T3.Group(); n.position.y = 1.3; g.add(n);
    var half = function (len, col) { var s = new T3.Shape(); s.moveTo(-r * .09, 0); s.lineTo(0, len); s.lineTo(r * .09, 0); s.lineTo(-r * .09, 0);
      var m = new T3.Mesh(new T3.ExtrudeGeometry(s, { depth: .12, bevelEnabled: false }), M.std(col, { roughness: .4 })); m.castShadow = true; m.rotation.x = -Math.PI / 2; m.position.y = -.06; return m; };
    n.add(half(r * .8, 0xd22b25)); var ss = half(r * .8, 0x2f5fb3); ss.rotation.z = Math.PI; n.add(ss);   // shape tip +y -> -z (north) after the -90 deg x turn
    mesh(new T3.CylinderGeometry(.2, .2, .3, 16), M.metal(0x8d96a3), 0, 0, 0, n);
    var gl = new T3.Mesh(new T3.CircleGeometry(r * .96, 48), new T3.MeshPhysicalMaterial({ color: 0xffffff, roughness: .05, transparent: true, opacity: .12, clearcoat: 1, depthWrite: false }));
    gl.rotation.x = -Math.PI / 2; gl.position.y = 1.55; g.add(gl);
    g.needle = n; g.ang = 0; g.vel = 0; g.set = function (a) { n.rotation.y = -a; };
    return g;
  }
  function textSprite(txt, col, w) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 128; var g = c.getContext('2d');
    g.fillStyle = 'rgba(16,24,38,.88)'; g.beginPath(); g.roundRect(6, 10, 244, 108, 50); g.fill(); g.lineWidth = 8; g.strokeStyle = col; g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 64px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 128, 68);
    var t = new T3.CanvasTexture(c); t.colorSpace = T3.SRGBColorSpace;
    var sp = new T3.Sprite(new T3.SpriteMaterial({ map: t, depthWrite: false, depthTest: false })); sp.scale.set(w || 3.2, (w || 3.2) / 2, 1); sp.renderOrder = 50; return sp;
  }

  // ------------------------------------------------------------------ flexible wires (ends exactly on terminals) + current dots
  var WIRES = [];
  function makeWire(ptsFn, color, opt) {
    opt = opt || {};
    var w = { fn: ptsFn, mat: M.std(color, { roughness: .4 }), r: opt.r || .14, tube: null, tips: [], key: '', curve: null, dots: null, dir: 1, len: 1 };
    var cu = M.metal(0xc8743f, .3);
    w.update = function () {
      var p = w.fn(), k = p.map(function (v) { return v.x.toFixed(2) + ',' + v.y.toFixed(2) + ',' + v.z.toFixed(2); }).join('|');
      if (k === w.key) return; w.key = k;
      if (w.tube) { scene.remove(w.tube); w.tube.geometry.dispose(); }
      w.tips.forEach(function (t) { scene.remove(t); }); w.tips = [];
      w.curve = new T3.CatmullRomCurve3(p, false, 'centripetal'); w.len = w.curve.getLength();
      w.tube = mesh(new T3.TubeGeometry(w.curve, Math.max(48, Math.round(w.len * 2.2)), w.r, 10, false), w.mat);
      [[0, 1], [1, -1]].forEach(function (q) {
        var tan = w.curve.getTangentAt(q[0]).multiplyScalar(q[1]), end = w.curve.getPointAt(q[0]);
        var t = mesh(new T3.CylinderGeometry(w.r * .55, w.r * .55, .5, 10), cu); t.position.copy(end).addScaledVector(tan, .18); t.quaternion.setFromUnitVectors(V3(0, 1, 0), tan.normalize()); w.tips.push(t);
      });
    };
    var n = Math.max(6, opt.dots || 12);
    w.dots = new T3.InstancedMesh(new T3.SphereGeometry(opt.dotR || .2, 10, 8), new T3.MeshBasicMaterial({ color: 0x7fe3ff, toneMapped: false }), n);
    w.dots.frustumCulled = false; w.dots.visible = false; w.dots.renderOrder = 5; scene.add(w.dots); w.nd = n;
    WIRES.push(w); return w;
  }
  var m4 = new T3.Matrix4();
  function dotsOn(w, curve, flow, t, speedCm) {
    if (!flow) { w.dots.visible = false; return; }
    w.dots.visible = true; var len = curve.getLength(), sp = (speedCm || 4) / len;
    for (var i = 0; i < w.nd; i++) { var u = ((i / w.nd + t * sp * flow) % 1 + 1) % 1; m4.makeTranslation(curve.getPointAt(u)); w.dots.setMatrixAt(i, m4); }
    w.dots.instanceMatrix.needsUpdate = true;
  }

  // ================================================================== STATION A: wire + compass (Activity 4.1)
  var A = new T3.Group(); scene.add(A);
  mesh(new T3.BoxGeometry(18, .4, 24), M.std(0xc9a77c, { roughness: .92 }), 0, .22, 0, A);
  var nailM = M.metal(0x7d858f, .38);
  [-8, 8].forEach(function (z) {
    mesh(new T3.CylinderGeometry(.18, .18, 3.4, 16), nailM, 0, 2.1, z, A);
    mesh(new T3.CylinderGeometry(.45, .45, .16, 24), nailM, 0, 3.86, z, A);
  });
  var cmpA = makeCompass(A, 3.1); cmpA.position.set(0, .42, 0);
  var holderA = makeHolder(A); holderA.position.set(-13, 0, 17.5);
  var swA = makeSwitch(A); swA.position.set(13, 0, 16);
  var WY = 2.9;   // stretched wire height (above the compass glass at 1.97)
  // loop order: T2 -> north nail -> stretched wire (north -> south) -> switch a ; switch b -> T1
  var wA1 = makeWire(function () {
    var t2 = wpos(holderA.T2);
    return [t2, V3(t2.x + 1.3, t2.y + .7, t2.z - .4), V3(t2.x + 1.6, 1.0, t2.z - 3.2), V3(-11, 1.3, 9), V3(-10.5, 1.8, -6), V3(-6, 2.3, -11), V3(-1.6, WY, -10.2), V3(-.35, WY, -8.35),
      V3(0, WY, -7.6), V3(0, WY, -4), V3(0, WY, 0), V3(0, WY, 4), V3(0, WY, 7.6), V3(.35, WY, 8.35), V3(1.6, WY, 10.2), V3(5.5, 1.6, 13.6),
      (function () { var a = wpos(swA.a); return V3(a.x - 1.6, a.y + .9, a.z + .2); })(), wpos(swA.a)];
  }, 0xd33a3a, { dots: 26 });
  var wA2 = makeWire(function () {
    var b = wpos(swA.b), t1 = wpos(holderA.T1);
    return [b, V3(b.x + 1.6, b.y + .6, b.z + .6), V3(b.x + 2.6, .5, b.z + 4), V3(2, .4, 22.5), V3(t1.x + 2, .4, 22.5), V3(t1.x - 2.4, .6, t1.z + 2.2), V3(t1.x - 1.2, t1.y + .5, t1.z + .4), t1];
  }, 0x23262c, { dots: 18 });
  var lblN = textSprite('N  north', '#dc3b3b', 4.6); lblN.position.set(0, 1.2, -16.5); A.add(lblN);

  // ================================================================== STATION B: electromagnet (Activities 4.2-4.4)
  var B = new T3.Group(); B.position.x = X0; scene.add(B);
  // retort stand
  var steel = M.metal(0xaab4c0, .3), standM = M.std(0x3a4a5e, { roughness: .45, metalness: .4 });
  mesh(new T3.BoxGeometry(16, 1, 11), standM, 0, .5, -12, B);
  mesh(new T3.CylinderGeometry(.55, .55, 30, 20), steel, 0, 15.9, -12, B);
  var rig = new T3.Group(); rig.position.y = H_UP; B.add(rig);   // everything that moves up/down with the coil (axis at rig origin)
  mesh(new T3.BoxGeometry(2.2, 2.2, 2.2), M.std(0x2b3646, { metalness: .5, roughness: .4 }), 0, 3, -12, rig);       // boss head on the rod
  mesh(new T3.CylinderGeometry(.35, .35, 12, 14), steel, 0, 3, -6, rig).rotation.x = Math.PI / 2;                  // arm toward the coil
  mesh(new T3.CylinderGeometry(.3, .3, 13.4, 14), steel, 0, 3, 0, rig).rotation.z = Math.PI / 2;                  // cross bar
  [-1, 1].forEach(function (s) {
    mesh(new T3.BoxGeometry(.3, 2.3, .5), M.plastic(0x2f9e8a, .5), s * 6.25, 1.75, 0, rig);                   // hanger straps
    var band = mesh(new T3.TorusGeometry(TUBE_R + .14, .14, 8, 28), M.plastic(0x2f9e8a, .5), s * 6.25, 0, 0, rig); band.rotation.y = Math.PI / 2;
  });
  // paper tube (chart paper cylinder), open ends
  var tube = mesh(new T3.CylinderGeometry(TUBE_R, TUBE_R, TUBE_L, 40, 1, true), M.std(0xbfe3ea, { roughness: .85, side: T3.DoubleSide }), 0, 0, 0, rig); tube.rotation.z = Math.PI / 2;
  // cores
  var coreG = {};
  (function () {
    var iron = new T3.Group(), m = M.metal(0x6f7780, .42);
    mesh(new T3.CylinderGeometry(.34, .34, NAIL_L * .92, 24), m, 0, 0, 0, iron).rotation.z = Math.PI / 2;
    mesh(new T3.ConeGeometry(.34, NAIL_L * .08, 24), m, NAIL_L * .5 - NAIL_L * .04, 0, 0, iron).rotation.z = -Math.PI / 2;
    mesh(new T3.CylinderGeometry(.85, .85, .3, 32), m, -NAIL_L * .46 - .15, 0, 0, iron).rotation.z = Math.PI / 2;
    var alu = new T3.Group();
    mesh(new T3.CylinderGeometry(.36, .36, NAIL_L, 24), M.metal(0xd6dde6, .22), 0, 0, 0, alu).rotation.z = Math.PI / 2;
    coreG.iron = iron; coreG.alu = alu; rig.add(iron); rig.add(alu);
  })();
  var coreSlide = { iron: 0, alu: 0 };   // slide-in offset (cm) of the chosen core; the other core is put away
  // the winding: helix around the tube, centred, pitch 0.12 cm; leads go up from both ends
  var coilMesh = null, coilCurve = null, coilMoment = V3(), coilEndA = term(rig, 0, 0, 0), coilEndB = term(rig, 0, 0, 0);
  var coilMat = M.std(0x2f6fd0, { roughness: .35, metalness: .1 });
  var coilDots = new T3.InstancedMesh(new T3.SphereGeometry(.09, 8, 6), new T3.MeshBasicMaterial({ color: 0x9ff0ff, toneMapped: false }), 90);
  coilDots.frustumCulled = false; coilDots.visible = false; coilDots.renderOrder = 6; rig.add(coilDots);
  function buildCoil() {
    if (coilMesh) { rig.remove(coilMesh); coilMesh.geometry.dispose(); }
    var N = st.turns, len = N * PITCH, R = TUBE_R + WIRE_R + .01, pts = [], K = 24;
    for (var i = 0; i <= N * K; i++) { var u = i / (N * K), a = u * N * Math.PI * 2; pts.push(V3(-len / 2 + u * len, Math.sin(a) * R, Math.cos(a) * R)); }
    // moment of the winding for current travelling from end A (x = -len/2) to end B: m = 1/2 sum r x dl
    var mm = V3(), d = V3(), c = V3();
    for (var j = 1; j < pts.length; j++) { d.subVectors(pts[j], pts[j - 1]); c.crossVectors(pts[j - 1], d); mm.add(c); }
    coilMoment.copy(mm.multiplyScalar(.5)).normalize();
    // leads (part of the same wire): from each end, up and outward to the terminal points used by the bench wires
    var a0 = pts[0], a1 = pts[pts.length - 1];
    var leadA = [V3(a0.x - .5, a0.y + .35, a0.z + .2), V3(a0.x - .9, R + .9, .7)];
    var leadB = [V3(a1.x + .5, a1.y + .35, a1.z + .2), V3(a1.x + .9, R + .9, .7)];
    var all = [leadA[1], leadA[0]].concat(pts, leadB);
    coilCurve = new T3.CatmullRomCurve3(pts);
    var full = new T3.CatmullRomCurve3(all);
    coilMesh = mesh(new T3.TubeGeometry(full, N * K + 40, WIRE_R, 7, false), coilMat, 0, 0, 0, rig);
    coilEndA.position.copy(leadA[1]); coilEndB.position.copy(leadB[1]);
  }
  buildCoil();
  var tagA = textSprite('A', '#ffd25a', 2.6), tagB = textSprite('B', '#ffd25a', 2.6);
  tagA.position.set(-TUBE_L / 2 - .3, 2.2, 1.2); tagB.position.set(TUBE_L / 2 + .3, 2.2, 1.2); rig.add(tagA); rig.add(tagB);
  // compasses on wooden block stacks at both ends (needle level with the coil axis when it rests up)
  var blockM = [M.std(0xe8dcc4, { roughness: .85 }), M.std(0xdccfb4, { roughness: .85 })];
  var cmpB = {};
  [-1, 1].forEach(function (s) {
    var hh = H_UP - 1.3 - .02, n = 4, each = hh / n;
    for (var i = 0; i < n; i++) { var b = mesh(new T3.BoxGeometry(6.4 - (i % 2) * .3, each - .04, 6.4 - (i % 2) * .3), blockM[i % 2], s * CMP_X, each * (i + .5), 0, B); b.rotation.y = (i % 2 ? .06 : -.04) * s; }
    var c = makeCompass(B, 2.6); c.position.set(s * CMP_X, hh + .02, 0); cmpB[s < 0 ? 'A' : 'B'] = c;
  });
  // dish of iron paper clips under the coil (blue plastic tray, not glass)
  var dish = new T3.Group(); B.add(dish);
  (function () {
    var pts = [V3(0, 0), V3(7.4, 0), V3(7.8, .2), V3(8.1, 1.3), V3(8.4, 1.45), V3(8.45, 1.3), V3(8.05, .1), V3(7.5, -.1), V3(0, -.1)].map(function (v) { return new T3.Vector2(v.x, v.y); });
    var d = new T3.Mesh(new T3.LatheGeometry(pts, 64), M.plastic(0x2a7fb8, .35)); d.position.y = .12; d.castShadow = d.receiveShadow = true; dish.add(d);
  })();
  var clipGeo = (function () {
    var L = 3, s = L / .42, p = [[.1, -.022], [.37, -.022], [.41, .006], [.38, .036], [.05, .036], [.012, 0], [.05, -.05], [.4, -.05], [.42, -.06]]
      .map(function (q) { return V3(q[0] * s - L / 2, q[1] * 2 * s, 0); });
    return new T3.TubeGeometry(new T3.CatmullRomCurve3(p), 64, .055, 6, false);
  })();
  var clipM = M.metal(0xaab4bf, .3);
  var CLIPS = [], NCLIP = 44, cr = rng(21);
  function heapPos(r) { var a = r() * Math.PI * 2, d = Math.sqrt(r()) * 6.2; return { x: Math.cos(a) * d * 1.05, z: Math.sin(a) * d * .8, ry: r() * Math.PI * 2, rx: (r() - .5) * .5, rz: (r() - .5) * .5 }; }
  for (var ci = 0; ci < NCLIP; ci++) {
    var m = new T3.Mesh(clipGeo, clipM); m.castShadow = true; B.add(m);
    var hp = heapPos(cr); hp.y = .32 + (ci % 4) * .1 + cr() * .08;
    m.position.set(hp.x, hp.y, hp.z); m.rotation.set(Math.PI / 2 + hp.rx, hp.ry, hp.rz);
    CLIPS.push({ m: m, home: hp, state: 'heap', slot: null, t: 0, vy: 0, from: null });
  }
  var lr = rng(77);
  function slotPos(k) {   // hanging places near the two nail ends (alternate A / B), rows of 4, chains below
    var e = k % 2 ? 1 : -1, j = Math.floor(k / 2), row = Math.floor(j / 4), col = j % 4;
    var x = e * (NAIL_L / 2 - .4 - col * .5), z = (col % 2 ? .25 : -.25) + (row % 2 ? .12 : 0);
    return { x: x, y: -.34 - 1.5 - row * 3.05, z: z, rz: (col - 1.5) * .06 + (row % 2 ? .05 : -.05), e: e };
  }
  var lblN2 = textSprite('N  north', '#dc3b3b', 4.6); lblN2.position.set(-18.5, 1.3, -7); B.add(lblN2);
  var holderB = makeHolder(B); holderB.position.set(-5.5, 0, 13);
  var swB = makeSwitch(B); swB.position.set(10.5, 0, 12.5);
  // loop order: T2 -> coil end A -> winding -> coil end B -> switch a ; switch b -> T1
  var wB1 = makeWire(function () {
    var t2 = wpos(holderB.T2), a = wpos(coilEndA), h = rig.position.y;
    return [t2, V3(t2.x + 1.3, t2.y + .8, t2.z - .6), V3(X0 - 10.5, Math.max(1.2, h * .35), 8), V3(X0 - 9.4, h + 1.6, 4.6), V3(a.x - .6, a.y + .6, a.z + .9), a];
  }, 0xd33a3a, { dots: 20 });
  var wB2 = makeWire(function () {
    var b = wpos(coilEndB), h = rig.position.y, sa = wpos(swB.a);
    return [b, V3(b.x + .6, b.y + .6, b.z + .9), V3(X0 + 9.4, h + 1.6, 4.6), V3(X0 + 9.5, Math.max(1.2, h * .35), 9), V3(sa.x - 1.4, sa.y + .9, sa.z), sa];
  }, 0x23262c, { dots: 20 });
  var wB3 = makeWire(function () {
    var b = wpos(swB.b), t1 = wpos(holderB.T1);
    return [b, V3(b.x + 1.5, b.y + .6, b.z + .6), V3(b.x + 2.6, .5, b.z + 4), V3(X0, .4, 17.5), V3(t1.x - 2.2, .5, t1.z + 2.6), V3(t1.x - 1.2, t1.y + .5, t1.z + .4), t1];
  }, 0x23262c, { dots: 18 });

  function rebuildHolders() { holderA.build(st.cells, st.rev); holderB.build(st.cells, st.rev); }
  rebuildHolders();

  // ------------------------------------------------------------------ physics of the needles
  var EARTH = V3(0, 0, -1);
  // wire station: field under the stretched wire (direction from Biot-Savart, magnitude 0.45 I)
  function wireField() {
    if (!on('wire')) return V3();
    var flow = st.rev ? -1 : 1;                         // +1: conventional current along the loop order (north -> south over the needle)
    var dl = V3(0, 0, 1).multiplyScalar(flow), rhat = V3(0, -1, 0);   // the needle is below the wire
    return dl.cross(rhat).normalize().multiplyScalar(.45 * current('wire'));
  }
  function emMoment() {   // unit moment of the coil (world), 0 when no current
    if (!on('em')) return null;
    return coilMoment.clone().multiplyScalar(st.rev ? -1 : 1);   // not reversed: current enters at end A
  }
  function dipoleAt(p) {
    var mh = emMoment(); if (!mh) return V3();
    var c = V3(X0, rig.position.y, 0), r = p.clone().sub(c), d = r.length(); r.normalize();
    var Mm = coilField() * Math.pow(CMP_X, 3) / 2;    // calibrated: on the axis at the resting compasses the field = coilField()
    return r.multiplyScalar(3 * mh.dot(r)).sub(mh).multiplyScalar(Mm / Math.pow(d, 3));
  }
  function cmpWorld(c) { return wpos(c.needle); }
  function targetAngle(Bf) { var b = Bf.clone().add(EARTH); return { a: Math.atan2(b.x, -b.z), mag: Math.hypot(b.x, b.z) }; }
  function stepNeedle(c, Bf, dt) {
    var T = targetAngle(Bf), diff = Math.atan2(Math.sin(T.a - c.ang), Math.cos(T.a - c.ang));
    c.vel += (26 * T.mag * Math.sin(diff) - 3.2 * c.vel) * dt; c.ang += c.vel * dt; c.set(c.ang);
  }
  function cmpFieldA() { return wireField(); }
  function cmpFieldEm(which) { return dipoleAt(cmpWorld(cmpB[which])); }
  function eqAngle(Bf) { return targetAngle(Bf).a; }

  // ------------------------------------------------------------------ camera (orbit, pinch / wheel zoom)
  var cam = { yaw: 0, pitch: 0, zoom: 1, tgt: V3(0, 4, 2), dist: 60, cur: null };
  function frameGoal() {
    var por = camera.aspect < .8;
    if (st.station === 'wire') return por ? { c: V3(-1, 2, 5), w: 40, h: 30, yaw: -.1, pitch: .95 } : { c: V3(-1, 3, 5), w: 50, h: 30, yaw: -.18, pitch: .7 };
    return { c: V3(X0, 8.5, 3.5), w: 36, h: 28, yaw: -.22, pitch: por ? .42 : .5 };
  }
  function placeCamera(snap) {
    var G = frameGoal(), asp = camera.aspect, tf = Math.tan(camera.fov * Math.PI / 360);
    var need = Math.max(G.h / 2 / tf, G.w / 2 / (tf * asp)) * 1.05 + 6;
    var yaw = G.yaw + cam.yaw, pitch = clamp(G.pitch + cam.pitch, .08, 1.3), dist = need * cam.zoom, k = snap ? 1 : .07;
    cam.tgt.lerp(G.c, k); cam.dist += (dist - cam.dist) * k;
    if (!cam.cur) cam.cur = { yaw: yaw, pitch: pitch };
    cam.cur.yaw += (yaw - cam.cur.yaw) * (snap ? 1 : .1); cam.cur.pitch += (pitch - cam.cur.pitch) * (snap ? 1 : .1);
    var cp = Math.cos(cam.cur.pitch);
    camera.position.set(cam.tgt.x + Math.sin(cam.cur.yaw) * cp * cam.dist, cam.tgt.y + Math.sin(cam.cur.pitch) * cam.dist, cam.tgt.z + Math.cos(cam.cur.yaw) * cp * cam.dist);
    camera.lookAt(cam.tgt); key.position.set(cam.tgt.x + 30, 80, 50); keyT.position.copy(cam.tgt);
  }
  function resize() {
    var r = $('stage').getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height);
    camera.fov = camera.aspect < .8 ? 44 : 36; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  var drag = null, pts = {};
  function pinchD() { var v = Object.keys(pts).map(function (k) { return pts[k]; }); return v.length < 2 ? 1 : Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); }
  cv.addEventListener('pointerdown', function (e) {
    cv.setPointerCapture(e.pointerId); pts[e.pointerId] = [e.clientX, e.clientY];
    if (Object.keys(pts).length > 1) { drag = { pinch: true, d0: pinchD(), z0: cam.zoom }; return; }
    drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, moved: false };
  });
  cv.addEventListener('pointermove', function (e) {
    if (pts[e.pointerId]) pts[e.pointerId] = [e.clientX, e.clientY];
    if (!drag) return;
    if (drag.pinch) { cam.zoom = clamp(drag.z0 * drag.d0 / Math.max(20, pinchD()), .5, 1.6); return; }
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
    cam.yaw = clamp(drag.yaw - (e.clientX - drag.x) * .005, -.9, .9); cam.pitch = clamp(drag.pitch + (e.clientY - drag.y) * .004, -.3, .6);
  });
  function endPtr(e) { delete pts[e.pointerId]; if (drag && drag.moved) S.act('look', 'camera', Math.round(cam.yaw * 100) / 100); drag = null; }
  cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('wheel', function (e) { e.preventDefault(); cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 1.08 : .93), .5, 1.6); }, { passive: false });

  // ------------------------------------------------------------------ controls
  function seg(id, items, get, set) {
    var box = $(id); items.forEach(function (it) { var b = document.createElement('button'); b.textContent = it[1]; b.setAttribute('data-v', it[0]); b.onclick = function () { set(it[0], true); }; box.appendChild(b); });
    return function () { Array.prototype.forEach.call(box.children, function (b) { b.classList.toggle('on', String(get()) === b.getAttribute('data-v')); }); };
  }
  var syncCells = seg('segCells', [[1, '1 cell'], [2, '2 cells'], [3, '3 cells'], [4, '4 cells']], function () { return st.cells; }, setCells);
  var syncTurns = seg('segTurns', [[25, '25'], [50, '50'], [75, '75'], [100, '100']], function () { return st.turns; }, setTurns);
  var syncCore = seg('segCore', CORES.map(function (c) { return [c.id, c.name]; }), function () { return st.core; }, setCore);
  function syncUI() {
    syncCells(); syncTurns(); syncCore();
    var em = st.station === 'em';
    $('tabWire').classList.toggle('on', !em); $('tabEm').classList.toggle('on', em);
    $('emUI').classList.toggle('hide', !em); $('bLift').classList.toggle('hide', !em); $('clipBadge').classList.toggle('hide', !em);
    $('bSwitch').classList.toggle('on', on()); $('bSwitch').textContent = on() ? 'Switch ON' : 'Switch OFF';
    $('bLift').textContent = st.down ? 'Lift the coil' : 'Lower to the clips'; $('bLift').classList.toggle('down', st.down);
  }
  var onSince = 0, warned = false;
  function setStation(s, log) { if (st.station === s) return; st.station = s; cam.yaw = 0; cam.pitch = 0; if (log) S.act('station', s === 'wire' ? 'wire_compass' : 'electromagnet', true); syncUI(); }
  function setSwitch(v, log) { st.sw[st.station] = !!v; if (v) onSince = performance.now(); if (log) S.act('toggle', st.station === 'wire' ? 'switch_wire' : 'switch_coil', !!v); syncUI(); }
  function setCells(n, log) { n = +n; if (st.cells === n) return; st.cells = n; rebuildHolders(); if (log) S.act('set', 'cells', n); syncUI(); }
  function setRev(v, log) { st.rev = !!v; rebuildHolders(); if (log) S.act('reverse', 'cells', st.rev); syncUI(); }
  function setTurns(n, log) { n = +n; if (st.turns === n) return; st.turns = n; buildCoil(); if (log) S.act('set', 'turns', n); syncUI(); }
  function setCore(c, log) { if (st.core === c) return; st.core = c; if (coreSlide[c] != null) coreSlide[c] = 1.2; if (log) S.act('choose', 'core_' + c, true); syncUI(); }
  function setDown(v, log) { st.down = !!v; if (log) S.act('lower', 'coil', st.down); syncUI(); }
  $('tabWire').onclick = function () { setStation('wire', true); };
  $('tabEm').onclick = function () { setStation('em', true); };
  $('bSwitch').onclick = function () { setSwitch(!on(), true); };
  $('bReverse').onclick = function () { setRev(!st.rev, true); toast(st.rev ? 'Cells turned round: the current now flows the other way.' : 'Cells back the first way round.', false, 2600); };
  $('bLift').onclick = function () { setDown(!st.down, true); };

  // ------------------------------------------------------------------ toast + readout
  var toastT = 0;
  function toast(msg, bad, ms) { var t = $('toast'); t.innerHTML = msg; t.classList.toggle('bad', !!bad); t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(function () { t.style.opacity = 0; }, ms || 3200); }
  function dirWord(a) { var d = Math.round(Math.abs(a) * DEG); return d < 2 ? 'points north' : 'turned ' + d + '&deg; towards ' + (a > 0 ? 'east' : 'west'); }
  function readout() {
    var h = 'Switch: ' + (on() ? '<span class="on">ON</span> (current flows)' : '<span class="off">OFF</span>') + '<br>' + st.cells + (st.cells > 1 ? ' cells' : ' cell') + (st.rev ? ', turned round' : '');
    if (st.station === 'wire') h += '<br>Needle: <b>' + dirWord(cmpA.ang) + '</b>';
    else h += ' &middot; ' + st.turns + ' turns<br>Core: <b>' + CORE_NAME[st.core].replace(' (paper tube only)', '') + '</b>';
    $('readout').innerHTML = h; $('clipN').textContent = heldCount();
  }

  // ------------------------------------------------------------------ clips
  function heldCount() { var n = 0; CLIPS.forEach(function (c) { if (c.state === 'held' || c.state === 'jump') n++; }); return n; }
  function nearDish() { return rig.position.y < H_DOWN + .35; }
  function updateClips(dt) {
    var want = on('em') ? clipsFor() : 0, held = CLIPS.filter(function (c) { return c.state === 'held' || c.state === 'jump'; });
    if (held.length > want) {   // too weak now (or switched off): the extra clips fall, last ones first
      held.slice(want).forEach(function (c) { var p = c.m.getWorldPosition(V3()); B.worldToLocal(p); rig.remove(c.m); B.add(c.m); c.m.position.copy(p); c.state = 'fall'; c.vy = 0; c.home = heapPos(lr); c.home.y = .32 + lr() * .45; });
    } else if (held.length < want && nearDish()) {   // touching the heap with current: clips jump to the nail ends
      var free = CLIPS.filter(function (c) { return c.state === 'heap'; });
      var used = {}; held.forEach(function (c) { used[c.slot] = 1; });
      var need = want - held.length;
      for (var k = 0, s = 0; k < need && free.length; s++) {
        if (used[s]) continue;
        var sp = slotPos(s);
        free.sort(function (a, b) { return Math.abs(a.m.position.x - sp.x) - Math.abs(b.m.position.x - sp.x); });
        var c = free.shift(), p = c.m.getWorldPosition(V3()); rig.worldToLocal(p); B.remove(c.m); rig.add(c.m); c.m.position.copy(p);
        c.from = { p: p.clone(), q: c.m.quaternion.clone() }; c.slot = s; c.state = 'jump'; c.t = 0; k++;
      }
    }
    CLIPS.forEach(function (c) {
      if (c.state === 'jump' || c.state === 'held') {
        var sp = slotPos(c.slot), floor = .45 - rig.position.y + (c.slot % 7) * .07; if (sp.y < floor) sp.y = floor;   // resting on the heap while the coil is down
        var tq = new T3.Quaternion().setFromEuler(new T3.Euler(0, 0, Math.PI / 2 + sp.rz));
        if (c.state === 'jump') { c.t = Math.min(1, c.t + dt * 3.2); var k = c.t * c.t * (3 - 2 * c.t); c.m.position.lerpVectors(c.from.p, V3(sp.x, sp.y, sp.z), k); c.m.quaternion.slerpQuaternions(c.from.q, tq, k); if (c.t >= 1) c.state = 'held'; }
        else { c.m.position.set(sp.x, sp.y, sp.z); c.m.quaternion.copy(tq); }
      } else if (c.state === 'fall') {
        c.vy -= 980 * dt * .12; c.m.position.y += c.vy * dt; c.m.position.x += (c.home.x - c.m.position.x) * Math.min(1, dt * 3); c.m.position.z += (c.home.z - c.m.position.z) * Math.min(1, dt * 3);
        c.m.rotation.x += dt * 4;
        if (c.m.position.y <= c.home.y) { c.m.position.set(c.home.x, c.home.y, c.home.z); c.m.rotation.set(Math.PI / 2 + c.home.rx, c.home.ry, c.home.rz); c.state = 'heap'; }
      }
    });
  }

  // ------------------------------------------------------------------ tasks
  var cur = null, results = {}, notebook = [], table = [];
  function nbShow() { $('nbPane').innerHTML = '<h4>Notebook</h4>' + (notebook.length ? notebook.slice(-6).reverse().map(function (n) { return '<div>' + n + '</div>'; }).join('') : '<p style="margin:0;color:var(--mut)">Press Record to note what you see.</p>'); }
  var HINTS = {
    wire_deflect: ['Open the Wire + compass bench. Press the switch so it says ON, watch the needle, then press Record. Then switch OFF and Record again.', 'Show me: the switch is set for the next step. Press Record.'],
    wire_reverse: ['Wire + compass: switch ON and Record. Then press "Reverse the cells" (the switch stays ON) and Record again.', 'Show me: the circuit is set for the next step. Press Record.'],
    coil_core: ['Electromagnet: choose No core, switch ON and Record. Then choose Iron nail without changing the turns or the cells, and Record again.', 'Show me: the coil is set for the next step. Press Record.'],
    lift_clips: ['Choose the Iron nail. Press "Lower to the clips", switch ON, then press "Lift the coil" and Record. Then switch OFF and Record.', 'Show me: the coil is set for the next step. Press Record.'],
    stronger: ['Iron nail, switch ON. Lower and lift to pick clips, Record. Change ONLY the turns, pick again, Record. Then change ONLY the cells, pick again, Record.', 'Show me: the next setting is ready and the clips are picked. Press Record.'],
    find_poles: ['Electromagnet resting up between the two compasses: switch ON and Record. Then press "Reverse the cells" and Record again.', 'Show me: the circuit is set for the next step. Press Record.']
  };
  function taskById(id) { for (var i = 0; i < TASKS.length; i++) if (TASKS[i].id === id) return TASKS[i]; }
  function starsStr(n) { return n ? '&#9733;&#9733;&#9733;'.slice(0, n * 7) + '<span style="opacity:.3">' + '&#9733;&#9733;&#9733;'.slice(0, (3 - n) * 7) + '</span>' : ''; }
  function renderTask() {
    var t = cur && taskById(cur.id);
    if (!t) { $('taskTxt').innerHTML = ended ? 'Lab closed. Well done!' : '<small>No task open</small>Tap &#9776; to pick a task'; $('bHint').disabled = true; $('bHint').style.opacity = .4; return; }
    var prog = '';
    if (cur.id === 'stronger') prog = ' (turns ' + (cur.turnsOK ? '&#10003;' : '&ndash;') + ', cells ' + (cur.cellsOK ? '&#10003;' : '&ndash;') + ')';
    else prog = cur.step ? ' (step 2 of 2)' : ' (step 1 of 2)';
    $('taskTxt').innerHTML = '<small>Task' + prog + ' &middot; tap to read</small><b>' + t.title + '</b>';
    $('bHint').disabled = cur.hintLvl >= 2; $('bHint').style.opacity = cur.hintLvl >= 2 ? .4 : 1; $('bHint').textContent = cur.hintLvl >= 1 ? 'Show me' : 'Hint';
  }
  function startTask(id) {
    if (ended || results[id]) return;
    cur = { id: id, wrong: 0, hints: 0, hintLvl: 0, step: 0, rec: null, rows: [], turnsOK: false, cellsOK: false };
    S.task(id); closeSheet();
    setStation(id === 'wire_deflect' || id === 'wire_reverse' ? 'wire' : 'em', false);
    renderTask(); toast(taskById(id).title + ': ' + taskById(id).text, false, 5000);
  }
  $('taskTxt').onclick = function () { var t = cur && taskById(cur.id); if (t) toast(t.text, false, 5000); };
  function wrongTry(msg) { cur.wrong++; S.retry(); toast(msg, true, 4800); renderTask(); }
  function finishTask(note) {
    var help = cur.wrong + cur.hints, stars = help === 0 ? 3 : help === 1 ? 2 : 1, id = cur.id;
    S.done(stars); results[id] = stars; cur = null; renderTask();
    toast((note ? note + '<br>' : '') + 'Task done ' + starsStr(stars), false, 4200);
    var left = TASKS.filter(function (t) { return !results[t.id]; });
    if (!left.length) setTimeout(function () { if (!ended) { ended = true; S.end(); } toast('All 6 tasks done! You can keep exploring the bench.', false, 6000); renderTask(); }, 1800);
    else setTimeout(function () { if (!cur && !ended) openTasks(); }, 3000);
  }
  $('bHint').onclick = function () {
    if (!cur || cur.hintLvl >= 2) return;
    cur.hintLvl++; cur.hints++; S.hint(); S.act('hint', cur.id, cur.hintLvl);
    toast(HINTS[cur.id][cur.hintLvl - 1], false, 6500);
    if (cur.hintLvl === 2) showMe();
    renderTask();
  };
  function pickNow() { setDown(true); var y = rig.position.y; rig.position.y = H_DOWN; updateClips(0); rig.position.y = y; setDown(false); }
  function showMe() {
    var id = cur.id;
    if (id === 'wire_deflect') { setStation('wire'); setSwitch(!cur.step); }
    if (id === 'wire_reverse') { setStation('wire'); setSwitch(true); if (cur.step) setRev(cur.rec.rev ? false : true); }
    if (id === 'coil_core') { setStation('em'); setDown(false); setSwitch(true); setCore(cur.step ? (cur.rec.core === 'iron' ? 'none' : 'iron') : 'none'); if (cur.step) { setTurns(cur.rec.turns); setCells(cur.rec.cells); } }
    if (id === 'lift_clips') { setStation('em'); setCore('iron'); if (!cur.step) { setSwitch(true); pickNow(); } else { setSwitch(false); setDown(false); } }
    if (id === 'stronger') {
      setStation('em'); setCore('iron'); setSwitch(true);
      var r0 = cur.rows[cur.rows.length - 1];
      if (r0) { if (!cur.turnsOK) setTurns(r0.turns === 100 ? 50 : 100); else if (!cur.cellsOK) setCells(r0.cells === 3 ? 1 : 3); }
      pickNow();
    }
    if (id === 'find_poles') { setStation('em'); setDown(false); setSwitch(true); if (cur.step) setRev(cur.rec.rev ? false : true); }
  }

  // ------------------------------------------------------------------ Record (the lab notebook)
  function emObs() {   // equilibrium readings of the coil bench
    var a = eqAngle(cmpFieldEm('A')), b = eqAngle(cmpFieldEm('B'));
    // compass at end A lies on the -x side of end A: north tip leaning to +x = north pole of the compass pulled towards A -> A is South
    var poleA = !on('em') || Math.abs(a) < .03 ? null : (Math.sin(a) > 0 ? 'S' : 'N');
    var poleB = !on('em') || Math.abs(b) < .03 ? null : (Math.sin(b) < 0 ? 'S' : 'N');
    return { a: a, b: b, poleA: poleA, poleB: poleB, clips: heldCount() };
  }
  function poleWords(p, end) { if (!p) return 'the needle hardly turns at end ' + end; return p === 'S' ? 'the north pole of the compass is attracted towards end ' + end + ', so end ' + end + ' is the south pole' : 'the north pole of the compass is pushed away from end ' + end + ' (its south pole is attracted), so end ' + end + ' is the north pole'; }
  $('bRecord').onclick = function () {
    if (!started) return;
    var note = '', id = cur && cur.id;
    if (st.station === 'wire') {
      var a = eqAngle(cmpFieldA()), deg = Math.round(Math.abs(a) * DEG), side = a > 0 ? 'east' : 'west';
      note = on('wire') ? 'Wire + compass, switch ON (' + st.cells + (st.cells > 1 ? ' cells' : ' cell') + (st.rev ? ', turned round' : '') + '): current flows and the needle deflects about ' + deg + '&deg; towards the ' + side + '.'
        : 'Wire + compass, switch OFF: no current, the needle returns to its original direction (north).';
      notebook.push(note); nbShow(); S.act('record', on('wire') ? 'wire_on' : 'wire_off', on('wire') ? (a > 0 ? deg : -deg) : 0);
      if (id === 'wire_deflect') {
        if (!cur.step) { if (!on('wire')) return wrongTry('The switch is OFF, so no current flows and the needle just points north. Switch ON first, then Record.'); cur.step = 1; renderTask(); toast(note + '<br>Now switch OFF and Record again.', false, 5200); return; }
        if (on('wire')) { toast('Still ON. Now switch OFF, watch the needle, and Record.', false, 4200); return; }
        return finishTask(note);
      }
      if (id === 'wire_reverse') {
        if (!on('wire')) return wrongTry('The switch is OFF, so there is no deflection to compare. Switch ON, then Record.');
        if (!cur.step) { cur.step = 1; cur.rec = { rev: st.rev, sign: a > 0 }; renderTask(); toast(note + '<br>Now reverse the cells and Record again.', false, 5200); return; }
        if (st.rev === cur.rec.rev) return wrongTry('This is the same direction as before. Press "Reverse the cells" so the current flows the other way, then Record.');
        return finishTask(note + ' The deflection is reversed.');
      }
      if (id) toast(note + '<br>This task uses the Electromagnet bench.', false, 4600); else toast(note, false, 4600);
      return;
    }
    // electromagnet bench
    var o = emObs(), da = Math.round(Math.abs(o.a) * DEG), db = Math.round(Math.abs(o.b) * DEG);
    var setup = st.turns + ' turns, ' + st.cells + (st.cells > 1 ? ' cells' : ' cell') + ', ' + CORE_NAME[st.core];
    if (!on('em')) note = 'Coil (' + setup + '), switch OFF: no current. Both needles point north' + (o.clips ? '' : '; the coil holds no clips') + '.';
    else if (st.down || !(rig.position.y > H_UP - .5)) note = 'Coil (' + setup + '), switch ON, coil down at the clips.';
    else note = 'Coil (' + setup + '), switch ON: compass at end A turned ' + da + '&deg;, at end B ' + db + '&deg;. Clips held: ' + o.clips + '.';
    var up = !st.down && rig.position.y > H_UP - .5;
    notebook.push(note); nbShow(); S.act('record', 'coil', on('em') ? o.clips : -1);
    if (id === 'wire_deflect' || id === 'wire_reverse') { toast(note + '<br>This task uses the Wire + compass bench.', false, 4600); return; }
    if (id === 'coil_core') {
      if (!on('em')) return wrongTry('The switch is OFF: the coil is not a magnet now and the needles point north. Switch ON, then Record.');
      if (!up) { toast('Lift the coil back up between the compasses, then Record.', false, 4200); return; }
      if (st.core === 'alu') { toast(note + '<br>Aluminium rod: about the same as no core. Aluminium is not a magnetic material. This task needs no core and the iron nail.', false, 6000); return; }
      if (!cur.step) { cur.step = 1; cur.rec = { core: st.core, turns: st.turns, cells: st.cells, deg: da }; renderTask(); toast(note + '<br>Now ' + (st.core === 'iron' ? 'take out the nail (No core)' : 'insert the iron nail') + ', keep the turns and cells the same, and Record.', false, 5600); return; }
      if (st.core === cur.rec.core) { toast('Same core as before. Now ' + (st.core === 'iron' ? 'choose No core' : 'insert the iron nail') + ' and Record.', false, 4200); return; }
      if (st.turns !== cur.rec.turns || st.cells !== cur.rec.cells) return wrongTry('For a fair test keep the same turns (' + cur.rec.turns + ') and cells (' + cur.rec.cells + ') as your first record; change only the core.');
      var dIron = st.core === 'iron' ? da : cur.rec.deg, dNone = st.core === 'iron' ? cur.rec.deg : da;
      return finishTask('With the iron nail the needle turned ' + dIron + '&deg;; with no core only ' + dNone + '&deg;. The iron core makes the coil a much stronger magnet.');
    }
    if (id === 'lift_clips') {
      if (!cur.step) {
        if (st.core !== 'iron') return wrongTry('With ' + CORE_NAME[st.core] + ' the coil is too weak to lift clips here. Choose the iron nail.');
        if (!up) { toast('Now lift the coil (press "Lift the coil"), then Record.', false, 4200); return; }
        if (!on('em')) return wrongTry('The switch is OFF, so the nail is not a magnet and holds no clips. Lower it to the clips with the switch ON, then lift.');
        if (!o.clips) return wrongTry('No clips yet. Lower the coil to the clips with the switch ON, then lift it and Record.');
        cur.step = 1; renderTask(); toast(note + '<br>Now switch OFF and watch the clips. Then Record.', false, 5200); return;
      }
      if (on('em')) { toast('Still ON. Now switch OFF, watch the clips, and Record.', false, 4200); return; }
      if (o.clips) { toast('Wait for the clips to fall, then Record.', false, 3000); return; }
      return finishTask('Switch OFF: the current stops, the nail loses its magnetism and the clips fall off.');
    }
    if (id === 'stronger') {
      if (!on('em')) return wrongTry('The switch is OFF: no current, no magnet. Switch ON, lower the coil to the clips, lift and Record.');
      if (st.core !== 'iron') return wrongTry('This task uses the iron nail core. Choose the iron nail.');
      if (!up) { toast('Lift the coil, then Record.', false, 3600); return; }
      if (!o.clips) { toast('No clips held yet. Lower the coil to the clips, lift it, then Record.', false, 4200); return; }
      if (o.clips < clipsFor()) { toast('These clips were picked with a weaker setting. Lower the coil to the clips again, lift, then Record.', false, 5200); return; }
      if (cur.rows.some(function (r) { return r.turns === st.turns && r.cells === st.cells; })) return wrongTry('You already have ' + st.turns + ' turns with ' + st.cells + (st.cells > 1 ? ' cells' : ' cell') + ' in your table. Change the turns OR the cells, pick the clips again, and Record.');
      var row = { turns: st.turns, cells: st.cells, clips: o.clips }; cur.rows.push(row); table.push(row);
      cur.rows.forEach(function (r) {
        if (r === row) return;
        if (r.cells === row.cells && r.turns !== row.turns) cur.turnsOK = true;
        if (r.turns === row.turns && r.cells !== row.cells) cur.cellsOK = true;
      });
      renderTask();
      if (cur.turnsOK && cur.cellsOK) return finishTask('More turns lift more clips, and more cells (a larger current) lift more clips: both make the electromagnet stronger.');
      toast(note + '<br>' + (cur.rows.length === 1 ? 'Now change only the turns (or only the cells), pick clips again, and Record.' : !cur.turnsOK ? 'Now change only the turns (keep ' + row.cells + (row.cells > 1 ? ' cells' : ' cell') + '), pick again, Record.' : 'Now change only the cells (keep ' + row.turns + ' turns), pick again, Record.'), false, 6000);
      return;
    }
    if (id === 'find_poles') {
      if (!on('em')) return wrongTry('The switch is OFF: the coil is not a magnet, so both needles point north. Switch ON, then Record.');
      if (!up) { toast('Lift the coil back up between the compasses, then Record.', false, 4200); return; }
      var pn = 'End A: ' + poleWords(o.poleA, 'A') + '. End B: ' + poleWords(o.poleB, 'B') + '.';
      if (!cur.step) { cur.step = 1; cur.rec = { rev: st.rev, poleA: o.poleA }; renderTask(); toast(pn + '<br>Now reverse the cells and Record again.', false, 7000); notebook.push(pn); nbShow(); return; }
      if (st.rev === cur.rec.rev) return wrongTry('Same current direction as before, so the same poles. Press "Reverse the cells", then Record.');
      notebook.push(pn); nbShow();
      return finishTask('Current reversed: end A is now the ' + (o.poleA === 'N' ? 'north' : 'south') + ' pole and end B the ' + (o.poleB === 'N' ? 'north' : 'south') + ' pole. The poles are reversed.');
    }
    toast(note, false, 4600);
  };

  // ------------------------------------------------------------------ sheets: tasks, cards
  function openSheet(html) { $('sheetBox').innerHTML = html; $('sheet').classList.add('on'); }
  function closeSheet() { $('sheet').classList.remove('on'); }
  $('sheet').onclick = function (e) { if (e.target === $('sheet')) closeSheet(); };
  function openTasks() {
    var h = '<h2>Tasks <span style="font-size:13px;color:var(--mut);font-weight:400">any order</span></h2>';
    TASKS.forEach(function (t) { var r = results[t.id]; h += '<button class="task' + (r ? ' done' : '') + '" data-t="' + t.id + '"><div><b>' + t.title + '</b><div style="font-size:13px;color:#b8c6d4">' + t.text + '</div></div><span class="st">' + (r ? starsStr(r) : cur && cur.id === t.id ? 'open' : '') + '</span></button>'; });
    if (table.length) h += '<h2 style="margin-top:12px">Clips table</h2><table id="tbl"><tr><th>Turns</th><th>Cells</th><th>Clips lifted</th></tr>' + table.map(function (r) { return '<tr><td>' + r.turns + '</td><td>' + r.cells + '</td><td>' + r.clips + '</td></tr>'; }).join('') + '</table>';
    if (notebook.length) h += '<h2 style="margin-top:12px">Notebook</h2>' + notebook.slice(-8).reverse().map(function (n) { return '<div class="card"><p>' + n + '</p></div>'; }).join('');
    h += '<button class="close" id="shClose">Close</button>';
    openSheet(h);
    Array.prototype.forEach.call(document.querySelectorAll('.task'), function (b) { b.onclick = function () { var id = b.getAttribute('data-t'); if (results[id]) return; if (cur && cur.id === id) { closeSheet(); return; } startTask(id); }; });
    $('shClose').onclick = closeSheet;
  }
  $('bTasks').onclick = function () { if (started) openTasks(); };
  var CARDS = [
    ['magnetic_effect', 'Magnetic effect of electric current', 'When electric current flows through a conductor (like a wire), it produces a magnetic field around it. This phenomenon is known as the magnetic effect of electric current. The magnetic field disappears when the current stops flowing.'],
    ['magnetic_field', 'Magnetic field', 'The region around a magnet or a current carrying wire where its magnetic effect can be felt, such as by the deflection of a compass needle, is said to have a magnetic field. The compass needle is a tiny magnet which deflects when a magnet is brought near it.'],
    ['oersted', 'Be a scientist: Oersted', 'Hans Christian Oersted (1777–1851) made this discovery in 1820: electricity and magnetism are linked. He was a professor at a university in Denmark. It is said that once while giving a demonstration, he noticed that whenever an electrical circuit was closed or opened, the needle of a magnetic compass, lying nearby, deflected.'],
    ['electromagnet', 'Electromagnet', 'When current is passed through the cylindrical coil, it behaves like a magnet and deflects the needle of a magnetic compass. When an iron nail is inserted in the core of the coil, the coil becomes a stronger magnet. A current carrying coil that behaves as a magnet is called an electromagnet. For practical applications, most electromagnets have an iron core to make them stronger.'],
    ['poles', 'Two poles', 'Unlike poles (North–South) attract each other. So, if north pole of the magnetic compass is attracted towards end A of the electromagnet, then end A is south pole. Just like a magnet, an electromagnet also has two poles — North and South.'],
    ['strength', 'Stronger or weaker', 'A battery with more cells gives a larger current as compared to that with a single cell. This creates a stronger magnetic field, so the deflection of the compass needle is more and the coil can attract more clips. The increase in number of turns of the coil also makes the coil a stronger magnet! The strength of an electromagnet can be changed by changing the amount of electric current flowing through the coil or the number of turns of the coil, or both. Also, its poles can be reversed by changing the direction of the current.'],
    ['lifting', 'Lifting electromagnets', 'Lifting electromagnets are strong electromagnets, that may be hung to the cranes. When the current is turned ON, the electromagnet lifts the iron/steel objects; when the current is switched OFF, magnetic field disappears, and the objects are released. They are widely used in factories and scrap yards.'],
    ['this_lab', 'About this bench', 'The numbers here come from a simple model: more cells give a larger current, and the clips lifted and the needle deflection grow with the current times the number of turns. Without an iron core (paper tube only, or an aluminium rod) this coil deflects the compasses a little but is too weak to lift clips. Aluminium is not a magnetic material. The compasses sit east and west of the coil, so the coil’s field pushes the needles sideways from north.'],
    ['safety', 'Safety first', 'Take care to not connect the wires to the cell for more than a few seconds; otherwise, the cell may weaken quickly. Use cells only, never the mains supply.']
  ];
  $('bCards').onclick = function () {
    if (!started) return;
    var h = '<h2>Cards</h2>' + CARDS.map(function (c, i) { return '<button class="cardBtn" data-c="' + i + '">' + c[1] + '</button>'; }).join('') + '<button class="close" id="shClose">Close</button>';
    openSheet(h); $('shClose').onclick = closeSheet;
    Array.prototype.forEach.call(document.querySelectorAll('.cardBtn'), function (b) {
      b.onclick = function () { var c = CARDS[+b.getAttribute('data-c')]; S.act('open_card', c[0], true); openSheet('<div class="card"><h3>' + c[1] + '</h3><p>' + c[2] + '</p></div><button class="close" id="shBack">Back to cards</button><button class="close" id="shClose">Close</button>'); $('shClose').onclick = closeSheet; $('shBack').onclick = $('bCards').onclick; };
    });
  };

  // ------------------------------------------------------------------ music (generative ambient pad, no voice)
  var music = (function () {
    var ac = null, master = null, on_ = false, timer = 0, step = 0;
    var CH = [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64], [45, 52, 57, 60]];
    var hz = function (n) { return 440 * Math.pow(2, (n - 69) / 12); };
    function pad(notes, t) {
      notes.forEach(function (n, i) {
        var o = ac.createOscillator(), g = ac.createGain(); o.type = i % 2 ? 'sine' : 'triangle'; o.frequency.value = hz(n); o.detune.value = (i - 1.5) * 4;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.045, t + 2.5); g.gain.linearRampToValueAtTime(0, t + 8.4);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 8.6);
      });
      for (var k = 0; k < 4; k++) { var p = ac.createOscillator(), pg = ac.createGain(), tt = t + .8 + k * 1.9; p.type = 'sine'; p.frequency.value = hz(notes[(k * 3) % 4] + 24);
        pg.gain.setValueAtTime(0, tt); pg.gain.linearRampToValueAtTime(.022, tt + .02); pg.gain.exponentialRampToValueAtTime(.0005, tt + 1.6); p.connect(pg); pg.connect(master); p.start(tt); p.stop(tt + 1.7); }
    }
    function tick() { if (!on_) return; pad(CH[step % 4], ac.currentTime + .05); step++; timer = setTimeout(tick, 8000); }
    return {
      start: function () { try { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; master = ac.createGain(); master.gain.value = .8; master.connect(lp); lp.connect(ac.destination); } ac.resume(); if (!on_) { on_ = true; tick(); } } catch (e) { } },
      stop: function () { on_ = false; clearTimeout(timer); },
      get on() { return on_; }
    };
  })();
  $('bMusic').onclick = function () { if (music.on) music.stop(); else music.start(); S.act('toggle', 'music', music.on); $('bMusic').style.opacity = music.on ? 1 : .5; };
  $('bExit').onclick = function () { if (!started) { started = true; $('intro').style.display = 'none'; } if (!ended) { ended = true; S.end(); } cur = null; music.stop(); renderTask(); toast('Lab closed. You can close this page.', false, 6000); };
  $('bStart').onclick = function () { $('intro').style.display = 'none'; started = true; music.start(); resize(); placeCamera(true); renderTask(); setTimeout(openTasks, 350); };

  // ------------------------------------------------------------------ loop
  var last = performance.now(), t = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
    swA.k += ((on('wire') ? 1 : 0) - swA.k) * Math.min(1, dt * 14); swA.set(swA.k);
    swB.k += ((on('em') ? 1 : 0) - swB.k) * Math.min(1, dt * 14); swB.set(swB.k);
    // coil up / down (a slow clamp slide)
    var ty = st.down ? H_DOWN : H_UP, y = rig.position.y; rig.position.y = Math.abs(ty - y) < .02 ? ty : y + clamp(ty - y, -dt * 16, dt * 16);
    // cores slide in / out of the tube
    ['iron', 'alu'].forEach(function (k) { var g = coreG[k]; g.visible = st.core === k; coreSlide[k] *= Math.max(0, 1 - dt * 6); g.position.x = coreSlide[k] * (k === 'iron' ? -1 : 1); });
    WIRES.forEach(function (w) { w.update(); });
    // current dots: + -> around the loop -> -
    var fA = on('wire') ? (st.rev ? -1 : 1) : 0, fB = on('em') ? (st.rev ? -1 : 1) : 0;
    dotsOn(wA1, wA1.curve, fA, t); dotsOn(wA2, wA2.curve, fA, t);
    dotsOn(wB1, wB1.curve, fB, t); dotsOn(wB2, wB2.curve, fB, t); dotsOn(wB3, wB3.curve, fB, t);
    if (fB && coilCurve) { coilDots.visible = true; var n = 90, sp = 1.2 / st.turns; for (var i = 0; i < n; i++) { var u = ((i / n + t * sp * fB) % 1 + 1) % 1; m4.makeTranslation(coilCurve.getPointAt(u)); coilDots.setMatrixAt(i, m4); } coilDots.instanceMatrix.needsUpdate = true; }
    else coilDots.visible = false;
    stepNeedle(cmpA, cmpFieldA(), dt);
    stepNeedle(cmpB.A, cmpFieldEm('A'), dt); stepNeedle(cmpB.B, cmpFieldEm('B'), dt);
    updateClips(dt);
    if (started && on() && !warned && now - onSince > 20000) { warned = true; toast('In a real lab, switch OFF between tests: the cell weakens quickly if the wires stay connected.', false, 5000); }
    placeCamera(false); readout();
    var tb = $('top').getBoundingClientRect().bottom - $('stage').getBoundingClientRect().top + 6; $('readout').style.top = tb + 'px'; $('clipBadge').style.top = tb + 'px';
    renderer.render(scene, camera);
  }
  resize(); syncUI(); renderTask(); nbShow(); placeCamera(true); requestAnimationFrame(frame);

  // ------------------------------------------------------------------ test hooks (tools/test_sim.py, qa/shots.py): the same setters as the controls
  window.__sim = {
    state: function () {
      var o = emObs();
      return { st: JSON.parse(JSON.stringify(st)), task: cur && cur.id, results: results, ended: ended, held: heldCount(), clipsFor: clipsFor(), NI: NI(),
        wireDeg: Math.round(eqAngle(cmpFieldA()) * DEG), needleA: Math.round(cmpA.ang * DEG), emA: Math.round(o.a * DEG), emB: Math.round(o.b * DEG),
        poleA: o.poleA, poleB: o.poleB, rigY: rig.position.y, moment: coilMoment.toArray().map(function (v) { return +v.toFixed(3); }), adapter: S.state() };
    },
    set: function (o) {
      if (o.station) setStation(o.station, true); if (o.cells != null) setCells(o.cells, true); if (o.rev != null && o.rev !== st.rev) setRev(o.rev, true);
      if (o.turns != null) setTurns(o.turns, true); if (o.core) setCore(o.core, true); if (o.sw != null && o.sw !== on()) setSwitch(o.sw, true);
      if (o.down != null && o.down !== st.down) setDown(o.down, true);
    },
    task: function (id) { startTask(id); },
    table: function () {   // the model over every setting (for the physics check)
      var keep = { turns: st.turns, cells: st.cells, core: st.core }, out = [];
      [25, 50, 75, 100].forEach(function (n) { [1, 2, 3, 4].forEach(function (c) { st.turns = n; st.cells = c; ['none', 'iron'].forEach(function (k) { st.core = k; out.push({ turns: n, cells: c, core: k, I: +current('em').toFixed(3), NI: +NI().toFixed(1), clips: clipsFor(), deg: Math.round(Math.atan(coilField()) * DEG) }); }); }); });
      st.turns = keep.turns; st.cells = keep.cells; st.core = keep.core; return out;
    },
    orbit: function (y, p, z) { cam.yaw = y; cam.pitch = p; if (z) cam.zoom = z; }
  };
})();

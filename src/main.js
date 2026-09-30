'use strict';
(function (AF) {
  const { CFG, T, R } = AF;
  const P = AF.P, HW = CFG.HW, HH = CFG.HH, UZ = CFG.UZ;
  const TAU = Math.PI * 2;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const mini = document.getElementById('minimap');
  const mctx = mini.getContext('2d');
  const hud = document.getElementById('status');
  let miniBase = null;

  let W, player, npcs, vehicles;
  let dpr = 1, vw = 0, vh = 0, last = performance.now();
  const cam = { x: 0, y: 0, zoom: 1 };
  const state = {
    xray: true, debug: false, keys: new Set(), mouse: null, hover: null,
    coverage: 0, fps: 60, time: 0, hudT: 0, fading: [], seed: 0,
  };

  // ------------------------------------------------------------ setup
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
  }

  function newWorld(seed) {
    state.seed = seed;
    W = new AF.World(seed);
    const rng = AF.makeRng(seed ^ 0x9e3779b9);
    player = AF.makePlayer(W);
    npcs = AF.spawnNpcs(W, rng);
    vehicles = AF.spawnVehicles(W, rng);
    state.fading = [];
    const p = P(player.x, player.y, player.z);
    cam.x = p[0]; cam.y = p[1] - 30;
    buildMinimap();
    document.getElementById('seed').textContent = seed;
  }

  // ------------------------------------------------------------ input
  window.addEventListener('keydown', e => {
    if (e.repeat) { state.keys.add(e.code); return; }
    state.keys.add(e.code);
    if (e.code === 'KeyG') state.debug = !state.debug;
    if (e.code === 'KeyX') state.xray = !state.xray;
    if (e.code === 'KeyV') AF.view.cutaway = !AF.view.cutaway;
    if (e.code === 'KeyR') newWorld((Math.random() * 1e9) | 0);
    if (e.code === 'KeyH') document.getElementById('help').classList.toggle('hidden');
    if (e.code === 'Equal' || e.code === 'NumpadAdd') cam.zoom = Math.min(2.2, cam.zoom * 1.15);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') cam.zoom = Math.max(0.45, cam.zoom / 1.15);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', e => state.keys.delete(e.code));
  window.addEventListener('blur', () => state.keys.clear());

  function toWorld(mx, my) {
    return [(mx - vw / 2) / cam.zoom + cam.x, (my - vh / 2) / cam.zoom + cam.y];
  }
  canvas.addEventListener('pointermove', e => { state.mouse = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerleave', () => { state.mouse = null; });
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    const t = W.pickTile(wx, wy);
    if (t) AF.goTo(W, player, t);
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    cam.zoom = AF.clamp(cam.zoom * Math.exp(-e.deltaY * 0.0012), 0.45, 2.2);
  }, { passive: false });
  document.getElementById('btn-xray').onclick = () => { state.xray = !state.xray; };
  document.getElementById('btn-grid').onclick = () => { state.debug = !state.debug; };
  document.getElementById('btn-cut').onclick = () => { AF.view.cutaway = !AF.view.cutaway; };
  document.getElementById('btn-new').onclick = () => newWorld((Math.random() * 1e9) | 0);

  function readInput() {
    const k = state.keys;
    let gx = 0, gy = 0;
    // teclas = direções de TELA; W+D / S+A etc. caem exatamente nos eixos do grid
    if (k.has('KeyW') || k.has('ArrowUp')) { gx -= 1; gy -= 1; }
    if (k.has('KeyS') || k.has('ArrowDown')) { gx += 1; gy += 1; }
    if (k.has('KeyA') || k.has('ArrowLeft')) { gx -= 1; gy += 1; }
    if (k.has('KeyD') || k.has('ArrowRight')) { gx += 1; gy -= 1; }
    let run = k.has('ShiftLeft') || k.has('ShiftRight');
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      let ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.hypot(ax, ay) < 0.25) { ax = 0; ay = 0; }
      const b = i => pad.buttons[i] && pad.buttons[i].pressed;
      if (b(12)) ay -= 1; if (b(13)) ay += 1; if (b(14)) ax -= 1; if (b(15)) ax += 1;
      if (ax || ay) {
        // snap em 8 direções de tela
        const a = Math.round(Math.atan2(ay, ax) / (Math.PI / 4)) * (Math.PI / 4);
        const sx = Math.round(Math.cos(a)), sy = Math.round(Math.sin(a));
        gx += sx + sy; gy += -sx + sy;
      }
      if (b(0) || b(7)) run = true;
    }
    return { gx, gy, run };
  }

  // ------------------------------------------------------------ update
  function update(dt) {
    state.time += dt;
    AF.updatePlayer(W, player, readInput(), dt, vehicles);
    for (const e of npcs) AF.updateNpc(W, e, dt);
    for (const v of vehicles) AF.updateVehicle(W, v, dt, player, vehicles);
    const p = P(player.x, player.y, player.z);
    const k = Math.min(1, dt * 6);
    cam.x += (p[0] - cam.x) * k;
    cam.y += (p[1] - 30 - cam.y) * k;
    if (state.mouse) {
      const [wx, wy] = toWorld(state.mouse[0], state.mouse[1]);
      state.hover = W.pickTile(wx, wy);
    } else state.hover = null;
  }

  // ------------------------------------------------------------ oclusão / raio-X
  // Ponto dentro da coluna isométrica de um tile entre z0 e z1
  function inColumn(t, px, py, z0, z1) {
    const cx = (t.x - t.y) * HW, dx = Math.abs(px - cx);
    if (dx > HW) return false;
    const hh = HH * (1 - dx / HW), base = (t.x + t.y + 1) * HH;
    return py >= base - z1 * UZ - hh && py <= base - z0 * UZ + hh;
  }

  function computeOcclusion(pp, psum, dt) {
    const N = W.N;
    const samples = [], halo = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) samples.push([pp[0] - 4 + i * 4, pp[1] - 6 - j * 7]);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) halo.push([pp[0] - 28 + i * 14, pp[1] - 4 - j * 11]);
    const covered = new Uint8Array(samples.length);
    const fadeList = [];
    for (let s = psum + 1; s <= 2 * N - 2; s++) {
      for (let x = Math.max(0, s - N + 1); x <= Math.min(N - 1, s); x++) {
        const y = s - x, t = W.tiles[y * N + x];
        const cx = (x - y) * HW;
        if (Math.abs(cx - pp[0]) > HW + 40) continue;
        const base = (x + y + 1) * HH;
        if (base + HH < pp[1] - 70) continue;
        if (base - t.top * UZ - HH > pp[1]) continue;
        const gTop = t.corners ? Math.max(...t.corners) : t.level;
        const sTop = AF.view.cutaway && t.house ? t.house.base + CFG.FLOOR : t.structTop;
        let hitStruct = false;
        for (let k = 0; k < samples.length; k++) {
          const [sx, sy] = samples[k];
          if (inColumn(t, sx, sy, -3, gTop)) covered[k] = 1;
          else if (t.tall && inColumn(t, sx, sy, gTop, sTop)) { covered[k] = 1; hitStruct = true; }
        }
        if (t.tall && !hitStruct) {
          for (const [sx, sy] of halo) if (inColumn(t, sx, sy, gTop, sTop)) { hitStruct = true; break; }
        }
        if (hitStruct) fadeList.push(t);
      }
    }
    let c = 0;
    for (const v of covered) c += v;
    state.coverage = c / samples.length;

    for (const t of state.fading) t.fadeT = 1;
    if (state.xray && state.coverage > 0.2) {
      for (const t of fadeList) {
        t.fadeT = 0.22;
        if (!t.inFade) { t.inFade = true; state.fading.push(t); }
      }
    }
    const k = Math.min(1, dt * 9);
    state.fading = state.fading.filter(t => {
      t.fade += (t.fadeT - t.fade) * k;
      if (t.fadeT === 1 && t.fade > 0.995) { t.fade = 1; t.inFade = false; return false; }
      return true;
    });
  }

  // ------------------------------------------------------------ render
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#5fa8e0'); g.addColorStop(0.5, '#a9d6ef'); g.addColorStop(1, '#f6dcae');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    const off = -cam.x * 0.04, hy = vh * 0.45 - cam.y * 0.03;
    // nuvens
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 397 + state.time * 8 + off * 2) % (vw + 300)) - 150, y = 60 + (i * 53) % 180;
      ctx.beginPath(); ctx.ellipse(x, y, 60, 14, 0, 0, TAU); ctx.ellipse(x + 30, y - 8, 36, 14, 0, 0, TAU); ctx.fill();
    }
    // morros distantes + Pão de Açúcar
    ctx.fillStyle = 'rgba(80,120,140,0.5)';
    ctx.beginPath(); ctx.moveTo(0, vh);
    for (let x = 0; x <= vw; x += 20) {
      const wx = x - off;
      ctx.lineTo(x, hy - 40 - Math.sin(wx * 0.004) * 50 - Math.sin(wx * 0.011) * 18);
    }
    ctx.lineTo(vw, vh); ctx.fill();
    const px = vw * 0.78 + off;
    ctx.fillStyle = 'rgba(70,105,125,0.65)';
    ctx.beginPath(); ctx.moveTo(px - 70, hy + 20); ctx.bezierCurveTo(px - 60, hy - 160, px + 40, hy - 170, px + 55, hy + 20); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px - 180, hy + 20); ctx.bezierCurveTo(px - 170, hy - 70, px - 110, hy - 80, px - 90, hy + 20); ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,40,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px - 130, hy - 60); ctx.lineTo(px - 20, hy - 140); ctx.stroke();
  }

  function render(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky();
    const z = cam.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - cam.x * z), dpr * (vh / 2 - cam.y * z));
    const view = { x0: cam.x - vw / 2 / z, x1: cam.x + vw / 2 / z, y0: cam.y - vh / 2 / z, y1: cam.y + vh / 2 / z };

    const N = W.N, time = state.time;
    const pp = P(player.x, player.y, player.z);
    const psum = AF.entitySum(player);
    computeOcclusion(pp, psum, dt);

    // entidades agrupadas pela diagonal isométrica
    const buckets = new Map();
    const ents = [player, ...npcs, ...vehicles];
    for (const e of ents) {
      const s = AF.entitySum(e);
      if (!buckets.has(s)) buckets.set(s, []);
      buckets.get(s).push(e);
    }

    for (let s = 0; s <= 2 * N - 2; s++) {
      for (let x = Math.max(0, s - N + 1); x <= Math.min(N - 1, s); x++) {
        const y = s - x, t = W.tiles[y * N + x];
        const sx = (x - y) * HW;
        if (sx + HW < view.x0 || sx - HW > view.x1) continue;
        const yb = (x + y + 2) * HH + 3 * UZ, yt = (x + y) * HH - t.top * UZ - 30;
        if (yb < view.y0 || yt > view.y1) continue;
        R.drawTile(ctx, W, t, time);
      }
      const list = buckets.get(s);
      if (list) {
        list.sort((a, b) => (a.x + a.y) - (b.x + b.y));
        for (const e of list) drawEntity(e, time, view);
      }
    }

    R.drawWires(ctx, W, view);
    drawMarkers(time);

    // silhueta do jogador por cima de tudo quando encoberto
    if (state.xray && state.coverage > 0.05) {
      ctx.globalAlpha = 0.35 + 0.4 * Math.min(1, state.coverage * 1.5);
      R.drawPerson(ctx, pp[0], pp[1], Object.assign({ mono: '#ffe14d', fx: player.fx, back: player.back, phase: player.phase, moving: player.moving }, player.look));
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,225,77,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(pp[0], pp[1], 9, 4.5, 0, 0, TAU); ctx.stroke();
    }

    if (state.debug) drawDebug(view);
    drawMinimap();
  }

  function drawEntity(e, time, view) {
    const [sx, sy] = P(e.x, e.y, e.z);
    if (sx < view.x0 - 60 || sx > view.x1 + 60 || sy < view.y0 - 80 || sy > view.y1 + 60) return;
    if (e.kind === 'player' || e.kind === 'npc') {
      R.drawPerson(ctx, sx, sy, Object.assign({ fx: e.fx, back: e.back, phase: e.phase, moving: e.moving }, e.look));
    } else if (e.kind === 'dog') {
      R.drawDog(ctx, sx, sy, { fx: e.fx, phase: e.phase, moving: e.moving, col: e.col, spot: e.spot, time });
    } else {
      if (e.x < -1.5 || e.x > W.N + 0.5) return;
      R.drawVehicle(ctx, W, e, time);
    }
  }

  function diamond(t, lift) {
    const c = t.corners || [t.level, t.level, t.level, t.level];
    const l = lift || 0;
    ctx.beginPath();
    const pts = [P(t.x, t.y, c[0] + l), P(t.x + 1, t.y, c[1] + l), P(t.x + 1, t.y + 1, c[2] + l), P(t.x, t.y + 1, c[3] + l)];
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function drawMarkers(time) {
    if (state.hover && !('ontouchstart' in window)) {
      diamond(state.hover, 0.05);
      ctx.strokeStyle = W.isWalk(state.hover) ? 'rgba(255,255,255,0.8)' : 'rgba(255,80,80,0.8)';
      ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (player.path && player.goal) {
      ctx.fillStyle = 'rgba(255,225,77,0.55)';
      for (const t of player.path) {
        const [px, py] = P(t.x + 0.5, t.y + 0.5, W.groundAt(t.x + 0.5, t.y + 0.5));
        ctx.beginPath(); ctx.ellipse(px, py, 3.5, 1.8, 0, 0, TAU); ctx.fill();
      }
      const g = player.goal, pulse = 0.5 + 0.5 * Math.sin(time * 6);
      diamond(g, 0.05);
      ctx.strokeStyle = `rgba(255,225,77,${0.5 + pulse * 0.5})`; ctx.lineWidth = 2.5; ctx.stroke();
    }
  }

  function drawDebug(view) {
    const N = W.N;
    for (const t of W.tiles) {
      const sx = (t.x - t.y) * HW;
      if (sx + HW < view.x0 || sx - HW > view.x1) continue;
      const cy = (t.x + t.y + 1) * HH;
      if (cy + HH < view.y0 || cy - t.top * UZ > view.y1) continue;
      if (t.house) {
        const zt = t.house.base + t.house.floors * CFG.FLOOR;
        const c = [P(t.x, t.y, zt), P(t.x + 1, t.y, zt), P(t.x + 1, t.y + 1, zt), P(t.x, t.y + 1, zt)];
        ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.closePath();
        ctx.fillStyle = 'rgba(255,40,40,0.22)'; ctx.fill();
        continue;
      }
      diamond(t, 0.02);
      ctx.fillStyle = W.isWalk(t) ? 'rgba(40,255,90,0.25)' : 'rgba(255,40,40,0.3)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.7; ctx.stroke();
      if (!W.isWalk(t)) continue;
      // arestas com degrau alto demais
      ctx.strokeStyle = '#ff2a2a'; ctx.lineWidth = 2.5;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const n = W.at(t.x + dx, t.y + dy);
        if (!n || !W.isWalk(n) || W.canStep(t, n)) continue;
        const a = dx ? P(t.x + 1, t.y, t.level) : P(t.x, t.y + 1, t.level);
        const b = P(t.x + 1, t.y + 1, t.level);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      const lv = t.corners ? (t.corners[0] + t.corners[2]) / 2 : t.level;
      const [px, py] = P(t.x + 0.5, t.y + 0.5, lv);
      ctx.fillText(lv.toFixed(lv % 1 ? 1 : 0), px, py + 3);
    }
    void N;
  }

  // ------------------------------------------------------------ minimapa
  let MS = 2;
  function buildMinimap() {
    const N = W.N;
    MS = (mini.width / 2 - 6) / N;
    miniBase = document.createElement('canvas');
    miniBase.width = mini.width; miniBase.height = mini.height;
    const g = miniBase.getContext('2d');
    g.clearRect(0, 0, mini.width, mini.height);
    const col = t => {
      switch (t.type) {
        case T.AVENUE: return '#3d4046';
        case T.SIDEWALK: return '#d8d0bf';
        case T.ROAD: return '#55585e';
        case T.BECO: return t.ceramic ? '#b0654e' : '#c9c2b5';
        case T.STAIR: return '#f1c40f';
        case T.PLAZA: return '#d8d2c4';
        case T.LOT: return '#5f8a32';
        case T.HOUSE: { const s = t.house.styles[t.house.floors - 1]; return AF.shade(s.brick ? '#b8633a' : s.color, 0.75 + t.house.floors * 0.07); }
      }
      return '#777';
    };
    for (let s = 0; s <= 2 * N - 2; s++) {
      for (let x = Math.max(0, s - N + 1); x <= Math.min(N - 1, s); x++) {
        const y = s - x, t = W.at(x, y);
        const cx = (x - y) * MS + mini.width / 2, cy = (x + y) * MS * 0.5 + 6;
        g.fillStyle = col(t);
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + MS, cy + MS * 0.5); g.lineTo(cx, cy + MS); g.lineTo(cx - MS, cy + MS * 0.5); g.closePath(); g.fill();
      }
    }
  }
  function drawMinimap() {
    mctx.clearRect(0, 0, mini.width, mini.height);
    mctx.drawImage(miniBase, 0, 0);
    const mp = (x, y) => [(x - y) * MS + mini.width / 2, (x + y) * MS * 0.5 + 6];
    for (const v of vehicles) {
      if (v.x < 0 || v.x > W.N) continue;
      const [x, y] = mp(v.x, v.y); mctx.fillStyle = '#fff'; mctx.fillRect(x - 1, y - 1, 2, 2);
    }
    const [px, py] = mp(player.x, player.y);
    mctx.fillStyle = '#ffe14d'; mctx.strokeStyle = '#000'; mctx.lineWidth = 1;
    mctx.beginPath(); mctx.arc(px, py, 3.5, 0, TAU); mctx.fill(); mctx.stroke();
  }

  // ------------------------------------------------------------ HUD
  function updateHud(dt) {
    state.fps = state.fps * 0.93 + (1 / Math.max(dt, 1e-3)) * 0.07;
    state.hudT -= dt;
    if (state.hudT > 0) return;
    state.hudT = 0.2;
    const t = W.at(Math.floor(player.x), Math.floor(player.y));
    const name = t ? AF.TYPE_NAME[t.type] : '—';
    const alt = (player.z * 0.75).toFixed(1);
    hud.innerHTML =
      `<b>${name}</b> · altitude ${alt} m · tile (${Math.floor(player.x)}, ${Math.floor(player.y)})` +
      ` · oclusão ${(state.coverage * 100) | 0}% · ${state.fps.toFixed(0)} fps`;
    document.getElementById('btn-xray').classList.toggle('on', state.xray);
    document.getElementById('btn-grid').classList.toggle('on', state.debug);
    document.getElementById('btn-cut').classList.toggle('on', AF.view.cutaway);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render(dt);
    updateHud(dt);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  R.init(ctx);
  const qs = new URLSearchParams(location.search).get('seed');
  newWorld(qs ? parseInt(qs, 10) : 20260930);
  requestAnimationFrame(frame);

  // ganchos de debug no console
  AF.debug = { get world() { return W; }, get player() { return player; }, state, cam };
})(window.AF = window.AF || {});

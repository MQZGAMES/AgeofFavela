'use strict';
(function (AF) {
  const { CFG, T } = AF;
  const SHIRTS = ['#e74c3c', '#f1c40f', '#27ae60', '#2980b9', '#ecf0f1', '#8e44ad', '#e67e22', '#1abc9c', '#34495e', '#ff8fb1'];
  const PANTS = ['#1f3a5f', '#2c2c2c', '#5d4037', '#1f6fb2', '#6d6d6d', '#e0e0e0'];
  const SKINS = ['#8d5524', '#c68642', '#e0ac69', '#5c3a1e', '#a0672f', '#f1c27d'];
  const HAIR = ['#1b120c', '#3b2314', '#0d0d0d', '#6b4423', '#d9b36c'];
  const DOGS = [['#c48a4a', null], ['#e8d6b0', '#8a5a2b'], ['#3a2c22', null], ['#d9d0c1', '#222'], ['#8a6a4a', '#f0e6d2']];

  // ------------------------------------------------------------ colisão
  // Um ponto (nx, ny) é ocupável se os 4 cantos do círculo de colisão estão em tiles
  // caminháveis com desnível <= STEP em relação ao tile atual, e fora de veículos.
  function canOccupy(W, e, nx, ny, vehicles) {
    const cur = W.at(Math.floor(e.x), Math.floor(e.y));
    if (!cur) return false;
    const r = CFG.RADIUS;
    const pts = [[0, 0], [-r, -r], [r, -r], [r, r], [-r, r]];
    for (const [ox, oy] of pts) {
      const t = W.at(Math.floor(nx + ox), Math.floor(ny + oy));
      if (!W.isWalk(t)) return false;
      if (Math.abs(t.level - cur.level) > CFG.STEP) return false;
    }
    if (vehicles) {
      for (const v of vehicles) {
        const ex = (v.hx !== 0 ? v.len / 2 : v.wid / 2) + r, ey = (v.hx !== 0 ? v.wid / 2 : v.len / 2) + r;
        const inNew = Math.abs(nx - v.x) < ex && Math.abs(ny - v.y) < ey;
        const inOld = Math.abs(e.x - v.x) < ex && Math.abs(e.y - v.y) < ey;
        if (inNew && !inOld) return false;
      }
    }
    return true;
  }
  AF.canOccupy = canOccupy;

  // Move com deslizamento nas paredes. Retorna a distância efetivamente percorrida.
  function moveEntity(W, e, dx, dy, vehicles) {
    const ox = e.x, oy = e.y;
    if (canOccupy(W, e, e.x + dx, e.y + dy, vehicles)) { e.x += dx; e.y += dy; }
    else if (dx && canOccupy(W, e, e.x + dx, e.y, vehicles)) e.x += dx;
    else if (dy && canOccupy(W, e, e.x, e.y + dy, vehicles)) e.y += dy;
    return Math.hypot(e.x - ox, e.y - oy);
  }

  function setFacing(e, gx, gy) {
    const sx = gx - gy, sy = (gx + gy) * 0.5;
    if (Math.abs(sx) > 0.05) e.fx = sx > 0 ? 1 : -1; else e.fx = 0;
    e.back = sy < -0.02;
  }

  function settleZ(W, e, dt) {
    const target = W.groundAt(e.x, e.y);
    e.z += (target - e.z) * Math.min(1, dt * 12);
  }

  // ------------------------------------------------------------ jogador
  AF.makePlayer = function (W) {
    const s = W.spawnTile;
    return {
      kind: 'player', x: s.x + 0.5, y: s.y + 0.5, z: s.level, fx: 1, back: false,
      phase: 0, moving: false, path: null, stuck: 0, goal: null,
      look: { shirt: '#f7d21a', stripe: '#1e9e4a', pants: '#1f4e8c', skin: '#b87444', cap: '#d62828', hair: '#1b120c' },
    };
  };

  AF.updatePlayer = function (W, p, input, dt, vehicles) {
    let gx = input.gx, gy = input.gy;
    const speed = CFG.SPEED * (input.run ? CFG.RUN : 1);
    let moved = 0;
    if (gx || gy) {
      p.path = null; p.goal = null;
      const n = Math.hypot(gx, gy); gx /= n; gy /= n;
      moved = moveEntity(W, p, gx * speed * dt, gy * speed * dt, vehicles);
      setFacing(p, gx, gy);
    } else if (p.path && p.path.length) {
      const t = p.path[0];
      const tx = t.x + 0.5, ty = t.y + 0.5;
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      if (d < 0.08) { p.path.shift(); if (!p.path.length) { p.path = null; p.goal = null; } }
      else {
        const step = Math.min(d, speed * dt);
        moved = moveEntity(W, p, dx / d * step, dy / d * step, vehicles);
        setFacing(p, dx, dy);
        if (moved < step * 0.2) { p.stuck += dt; if (p.stuck > 2.5) { p.path = null; p.goal = null; } }
        else p.stuck = 0;
      }
    }
    p.moving = moved > 0.0005;
    if (p.moving) p.phase += moved * 9;
    settleZ(W, p, dt);
  };

  AF.goTo = function (W, p, tile) {
    const start = W.at(Math.floor(p.x), Math.floor(p.y));
    const goal = W.nearestWalkable(tile, p);
    if (!goal) return false;
    const path = W.findPath(start, goal);
    if (!path) return false;
    p.path = path; p.goal = goal; p.stuck = 0;
    return true;
  };

  // ------------------------------------------------------------ moradores e cães
  AF.spawnNpcs = function (W, rng) {
    const spots = W.tiles.filter(t => W.isWalk(t) && (t.type === T.BECO || t.type === T.STAIR || t.type === T.PLAZA || t.type === T.SIDEWALK));
    const list = [];
    for (let k = 0; k < 14 && spots.length; k++) {
      const t = rng.pick(spots);
      list.push({
        kind: 'npc', x: t.x + 0.5, y: t.y + 0.5, z: t.level, fx: 1, back: false, phase: 0, moving: false,
        tx: t.x + 0.5, ty: t.y + 0.5, wait: rng.range(0, 3), speed: rng.range(1.1, 1.7), rng,
        look: { shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS), skin: rng.pick(SKINS), hair: rng.pick(HAIR), cap: rng.chance(0.3) ? rng.pick(SHIRTS) : null },
      });
    }
    for (let k = 0; k < 9 && spots.length; k++) {
      const t = rng.pick(spots), c = rng.pick(DOGS);
      list.push({
        kind: 'dog', x: t.x + 0.5, y: t.y + 0.5, z: t.level, fx: 1, back: false, phase: 0, moving: false,
        tx: t.x + 0.5, ty: t.y + 0.5, wait: rng.range(0, 3), speed: rng.range(1.6, 2.4), rng, col: c[0], spot: c[1],
      });
    }
    return list;
  };

  AF.updateNpc = function (W, e, dt) {
    const rng = e.rng;
    let moved = 0;
    if (e.wait > 0) e.wait -= dt;
    else {
      const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy);
      if (d < 0.05) {
        if (rng.chance(0.15)) e.wait = rng.range(1, 4);
        const cur = W.at(Math.floor(e.x), Math.floor(e.y));
        const opts = [];
        for (const [ox, oy] of AF.DIR4) {
          const n = W.at(cur.x + ox, cur.y + oy);
          if (!n || !W.canStep(cur, n) || n.type === T.ROAD || n.type === T.AVENUE) continue;
          // prefere seguir em frente
          const same = Math.sign(ox) === Math.sign(e.lx || 0) && Math.sign(oy) === Math.sign(e.ly || 0);
          opts.push(n); if (same) { opts.push(n); opts.push(n); }
        }
        if (opts.length) {
          const n = rng.pick(opts);
          e.lx = n.x - cur.x; e.ly = n.y - cur.y;
          e.tx = n.x + 0.5; e.ty = n.y + 0.5;
        } else e.wait = 1;
      } else {
        const step = Math.min(d, e.speed * dt);
        e.x += dx / d * step; e.y += dy / d * step;
        moved = step;
        setFacing(e, dx, dy);
      }
    }
    e.moving = moved > 0;
    if (e.moving) e.phase += moved * (e.kind === 'dog' ? 14 : 9);
    settleZ(W, e, dt);
  };

  // ------------------------------------------------------------ veículos
  function buildTrack(pts) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      segs.push({ ax, ay, ux: (bx - ax) / len, uy: (by - ay) / len, len, s0: total });
      total += len;
    }
    return { segs, total };
  }

  AF.spawnVehicles = function (W, rng) {
    const N = W.N, list = [];
    const track = buildTrack(W.roadPath);
    const hill = [
      { kind: 'moto', len: 0.8, wid: 0.35, speed: 3.2 },
      { kind: 'moto', len: 0.8, wid: 0.35, speed: 2.9 },
      { kind: 'car', len: 1.3, wid: 0.62, speed: 2.2 },
      { kind: 'van', len: 1.45, wid: 0.66, speed: 1.9 },
    ];
    hill.forEach((h, i) => {
      list.push(Object.assign({
        track, s: track.total * (0.15 + i * 0.22), dir: i % 2 ? -1 : 1, x: 0, y: 0, z: 0, hx: 1, hy: 0,
        col: h.kind === 'van' ? '#ecf0f1' : rng.pick(AF.VEH_COLORS), helmet: rng.pick(['#e74c3c', '#f1c40f', '#111', '#2980b9']),
        honk: -2, wait: 0,
      }, h));
    });
    for (let i = 0; i < 5; i++) {
      const lane = i % 2;
      const kind = i === 4 ? 'van' : i === 3 ? 'moto' : 'car';
      list.push({
        kind, len: kind === 'moto' ? 0.8 : kind === 'van' ? 1.45 : 1.3, wid: kind === 'moto' ? 0.35 : 0.62,
        speed: kind === 'moto' ? 3.8 : 3, avenue: true, lane,
        x: rng.range(0, N), y: N - 2 + lane + 0.5, z: 0, hx: lane ? -1 : 1, hy: 0, dir: 1,
        col: kind === 'van' ? '#f5f5f5' : rng.pick(AF.VEH_COLORS), helmet: '#111', honk: -2,
      });
    }
    list.forEach(v => placeOnTrack(W, v));
    return list;
  };

  function placeOnTrack(W, v) {
    if (v.avenue) { v.z = 0; return; }
    const tr = v.track;
    v.s = Math.max(0, Math.min(tr.total, v.s));
    let seg = tr.segs[tr.segs.length - 1];
    for (const sg of tr.segs) if (v.s <= sg.s0 + sg.len) { seg = sg; break; }
    const f = v.s - seg.s0;
    const hx = seg.ux * v.dir, hy = seg.uy * v.dir;
    // mão direita: desloca meio tile para o lado
    v.x = seg.ax + seg.ux * f + (-hy) * 0.5;
    v.y = seg.ay + seg.uy * f + (hx) * 0.5;
    v.hx = hx; v.hy = hy;
    v.z = W.groundAt(v.x, v.y);
  }

  AF.updateVehicle = function (W, v, dt, player, vehicles) {
    if (v.honk > 0) v.honk -= dt;
    // freia se houver alguém/algo logo à frente
    const reach = v.len / 2 + 0.55;
    const fx = v.x + v.hx * reach, fy = v.y + v.hy * reach;
    let blocked = Math.hypot(player.x - fx, player.y - fy) < 0.7;
    if (blocked && v.honk <= -1.5) v.honk = 1.1;
    if (!blocked) {
      for (const o of vehicles) {
        if (o === v || o.hx * v.hx + o.hy * v.hy < 0.5) continue;
        if (Math.hypot(o.x - fx, o.y - fy) < (o.len / 2 + 0.35)) { blocked = true; break; }
      }
    }
    if (blocked) return;
    const d = v.speed * dt;
    if (v.avenue) {
      v.x += v.hx * d;
      if (v.x > W.N + 3) v.x = -3;
      if (v.x < -3) v.x = W.N + 3;
      return;
    }
    v.s += d * v.dir;
    if (v.s >= v.track.total) { v.s = v.track.total; v.dir = -1; }
    if (v.s <= 0) { v.s = 0; v.dir = 1; }
    placeOnTrack(W, v);
  };

  // Diagonal isométrica (x+y) em que a entidade deve ser desenhada
  AF.entitySum = function (e) {
    if (e.len) {
      const ex = e.hx !== 0 ? e.len / 2 : e.wid / 2, ey = e.hx !== 0 ? e.wid / 2 : e.len / 2;
      return Math.floor(e.x + ex - 0.01) + Math.floor(e.y + ey - 0.01);
    }
    return Math.floor(e.x) + Math.floor(e.y);
  };
})(window.AF = window.AF || {});

'use strict';
(function (AF) {
  const { CFG, T } = AF;
  const HW = CFG.HW, HH = CFG.HH, UZ = CFG.UZ, FL = CFG.FLOOR;
  const FW = HW, FH = FL * UZ;      // tamanho de uma face de pavimento em coordenadas locais
  const TAU = Math.PI * 2;

  // Projeção isométrica: grid (gx, gy) + altura z (unidades) -> tela
  const P = (gx, gy, z) => [(gx - gy) * HW, (gx + gy) * HH - z * UZ];
  AF.P = P;

  const R = AF.R = {};
  let brickPat = null, grime = null;

  R.init = function (ctx) {
    const c = document.createElement('canvas');
    c.width = 24; c.height = 12;
    const g = c.getContext('2d');
    g.fillStyle = '#b8633a'; g.fillRect(0, 0, 24, 12);
    g.fillStyle = 'rgba(120,40,15,0.25)'; g.fillRect(1, 0, 10, 5); g.fillRect(19, 6, 5, 5);
    g.fillStyle = 'rgba(255,190,140,0.18)'; g.fillRect(13, 0, 10, 5); g.fillRect(7, 6, 11, 5);
    g.fillStyle = '#d6a27c';
    g.fillRect(0, 5, 24, 1); g.fillRect(0, 11, 24, 1);
    g.fillRect(0, 0, 1, 5); g.fillRect(12, 0, 1, 5); g.fillRect(6, 6, 1, 5); g.fillRect(18, 6, 1, 5);
    brickPat = ctx.createPattern(c, 'repeat');
    grime = ctx.createLinearGradient(0, FH * 0.45, 0, FH);
    grime.addColorStop(0, 'rgba(60,40,25,0)');
    grime.addColorStop(1, 'rgba(60,40,25,0.3)');
  };

  // ------------------------------------------------------------ primitivas
  function poly(ctx, pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // Caixa isométrica (faces visíveis: +y à esquerda, +x à direita, topo)
  function box(ctx, x0, y0, x1, y1, z0, z1, col, kTop = 1.08, kL = 0.88, kR = 0.68) {
    poly(ctx, [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], AF.shade(col, kL));
    poly(ctx, [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], AF.shade(col, kR));
    poly(ctx, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], AF.shade(col, kTop));
  }
  R.box = box;

  function cyl(ctx, x, y, rx, ry, h, c1, c2, top) {
    const g = ctx.createLinearGradient(x - rx, 0, x + rx, 0);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(x - rx, y - h);
    ctx.ellipse(x, y - h, rx, ry, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath(); ctx.ellipse(x, y - h, rx, ry, 0, 0, TAU); ctx.fill();
  }

  // Transforma o contexto para desenhar numa face vertical em coordenadas locais:
  // u = 0..FW (esquerda->direita), v = 0.. para baixo a partir de zTop.
  function faceXf(ctx, side, x, y, zTop) {
    const o = side === 'L' ? P(x, y + 1, zTop) : P(x + 1, y + 1, zTop);
    ctx.save();
    ctx.transform(1, side === 'L' ? 0.5 : -0.5, 0, 1, o[0], o[1]);
  }
  // Transforma para o plano do topo do tile: (u, v) em [0,1]^2
  function topXf(ctx, x, y, z) {
    const o = P(x, y, z);
    ctx.save();
    ctx.transform(HW, HH, -HW, HH, o[0], o[1]);
  }

  function fitText(ctx, text, cx, cy, maxW, size, color, font) {
    ctx.font = `bold ${size}px ${font || 'Arial, sans-serif'}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    const w = ctx.measureText(text).width;
    if (w > maxW) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(maxW / w, 1); ctx.fillText(text, 0, 0); ctx.restore();
    } else ctx.fillText(text, cx, cy);
  }

  const cornersOf = t => t.corners || [t.level, t.level, t.level, t.level];

  // ------------------------------------------------------------ chão
  const SIDE_COL = ['#777', '#6f6c68', '#9a948a', '#6f6c68', '#948d83', '#9c968c', '#948d83', '#8a7f72', '#6a5236'];
  const TOP_COL = ['#777', '#3d4046', '#e5ddcc', '#4b4d52', '#aaa396', '#b5afa4', '#a8a192', '#8a8277', '#6d8b3b'];

  function drawGround(ctx, W, t) {
    const x = t.x, y = t.y, c = cornersOf(t);
    const [hN, hE, hS, hW] = c;
    const nL = W.at(x, y + 1), nR = W.at(x + 1, y);
    const bL = nL ? cornersOf(nL) : null, bR = nR ? cornersOf(nR) : null;
    const MIN = -3;
    const lw = bL ? Math.min(hW, bL[0]) : MIN, ls = bL ? Math.min(hS, bL[1]) : MIN;
    const re = bR ? Math.min(hE, bR[0]) : MIN, rs = bR ? Math.min(hS, bR[3]) : MIN;
    const sc = SIDE_COL[t.type];

    if (lw < hW - 0.01 || ls < hS - 0.01) {
      poly(ctx, [P(x, y + 1, hW), P(x + 1, y + 1, hS), P(x + 1, y + 1, ls), P(x, y + 1, lw)], AF.shade(sc, 0.92));
      sideDetail(ctx, t, 'L', Math.min(hW, hS), Math.min(hW - lw, hS - ls));
    }
    if (re < hE - 0.01 || rs < hS - 0.01) {
      poly(ctx, [P(x + 1, y, hE), P(x + 1, y + 1, hS), P(x + 1, y + 1, rs), P(x + 1, y, re)], AF.shade(sc, 0.7));
      sideDetail(ctx, t, 'R', Math.min(hE, hS), Math.min(hE - re, hS - rs));
    }

    let top = TOP_COL[t.type];
    if (t.ceramic) top = '#a9573f';
    poly(ctx, [P(x, y, hN), P(x + 1, y, hE), P(x + 1, y + 1, hS), P(x, y + 1, hW)], top);
    topDetail(ctx, W, t);
  }

  function sideDetail(ctx, t, side, zTop, drop) {
    if (drop < 0.5) return;
    faceXf(ctx, side, t.x, t.y, zTop);
    const hpx = drop * UZ;
    if (t.type === T.STAIR) { ctx.fillStyle = '#f1c40f'; ctx.fillRect(0, 0, FW, 2.5); }
    else if (t.type === T.BECO || t.type === T.PLAZA || t.type === T.SIDEWALK) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, 0, FW, 2); }
    if (drop >= 1.5) {
      // muro de arrimo: fiadas de pedra/bloco
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      for (let v = UZ * 0.5; v < hpx; v += UZ * 0.5) ctx.fillRect(0, v, FW, 1);
      for (let row = 0, v = 0; v < hpx; row++, v += UZ * 0.5) {
        for (let u = (row % 2) * 8; u < FW; u += 16) ctx.fillRect(u, v, 1, Math.min(UZ * 0.5, hpx - v));
      }
      if (t.type === T.HOUSE || t.type === T.LOT) {
        ctx.fillStyle = 'rgba(40,70,20,0.35)';
        ctx.fillRect(0, hpx - 3, FW, 3);
      }
    }
    ctx.restore();
  }

  function topDetail(ctx, W, t) {
    const x = t.x, y = t.y, N = W.N;
    if (t.type === T.ROAD) {
      if (AF.hash(x, y, 91) > 0.6) {
        const c = t.corners, f = (u, v) => c[0] * (1 - u) * (1 - v) + c[1] * u * (1 - v) + c[2] * u * v + c[3] * (1 - u) * v;
        const u0 = 0.2 + AF.hash(x, y, 5) * 0.3, v0 = 0.2 + AF.hash(x, y, 6) * 0.3;
        poly(ctx, [P(x + u0, y + v0, f(u0, v0)), P(x + u0 + 0.3, y + v0, f(u0 + 0.3, v0)),
          P(x + u0 + 0.3, y + v0 + 0.25, f(u0 + 0.3, v0 + 0.25)), P(x + u0, y + v0 + 0.25, f(u0, v0 + 0.25))], '#3f4145');
      }
      return;
    }
    topXf(ctx, x, y, t.level);
    switch (t.type) {
      case T.AVENUE:
        if (y === N - 1 && x % 2 === 0) { ctx.fillStyle = '#e8c33a'; ctx.fillRect(0.15, -0.03, 0.5, 0.06); }
        if (x === 14 || x === 15) { ctx.fillStyle = '#e4e4e4'; for (let k = 0; k < 4; k++) ctx.fillRect(0.06 + k * 0.25, 0.08, 0.12, 0.84); }
        break;
      case T.SIDEWALK: {
        // calçadão com ondas pretas e brancas
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) { const u = i / 10; ctx.lineTo(u, 0.32 + 0.14 * Math.sin((x + u) * Math.PI)); }
        for (let i = 10; i >= 0; i--) { const u = i / 10; ctx.lineTo(u, 0.52 + 0.14 * Math.sin((x + u) * Math.PI)); }
        ctx.closePath(); ctx.fillStyle = '#2d2d2d'; ctx.fill();
        ctx.fillStyle = '#b9b09c'; ctx.fillRect(0, 0.94, 1, 0.06);
        break;
      }
      case T.BECO:
        if (t.ceramic) {
          ctx.fillStyle = '#c47058';
          for (let k = 1; k < 3; k++) { ctx.fillRect(k / 3 - 0.012, 0, 0.024, 1); ctx.fillRect(0, k / 3 - 0.012, 1, 0.024); }
        } else if (AF.hash(x, y, 13) > 0.65) {
          ctx.strokeStyle = 'rgba(60,55,50,0.5)'; ctx.lineWidth = 0.02;
          ctx.beginPath(); ctx.moveTo(0.1, 0.3); ctx.lineTo(0.4, 0.45); ctx.lineTo(0.55, 0.8); ctx.stroke();
        }
        break;
      case T.STAIR:
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(0, 0.48, 1, 0.04);
        break;
      case T.PLAZA:
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.02;
        ctx.strokeRect(0.05, 0.05, 0.9, 0.9);
        break;
      case T.LOT:
        ctx.fillStyle = '#7a6443';
        ctx.beginPath(); ctx.ellipse(0.35 + AF.hash(x, y, 3) * 0.3, 0.5, 0.25, 0.18, 0.5, 0, TAU); ctx.fill();
        break;
    }
    ctx.restore();
    if (t.tufts) drawTufts(ctx, t, t.tufts);
  }

  function drawTufts(ctx, t, seed) {
    ctx.strokeStyle = '#4f8f2a'; ctx.lineWidth = 1.3;
    for (let k = 0; k < 3; k++) {
      const a = AF.hash(seed, k, 1), along = 0.15 + a * 0.7;
      const [px, py] = AF.hash(seed, k, 2) > 0.5 ? P(t.x + along, t.y + 0.08, t.level) : P(t.x + 0.08, t.y + along, t.level);
      ctx.beginPath();
      for (let b = -2; b <= 2; b++) { ctx.moveTo(px + b * 1.6, py); ctx.lineTo(px + b * 3, py - 5 - Math.abs(2 - Math.abs(b)) * 2); }
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------ casas
  function drawHouse(ctx, W, t, time) {
    const h = t.house, x = t.x, y = t.y, base = h.base;
    for (let k = 0; k < h.floors; k++) {
      const st = h.styles[k], z1 = base + (k + 1) * FL;
      for (const side of ['L', 'R']) {
        const d = t.faces[side];
        if (!d) continue;
        faceXf(ctx, side, x, y, z1);
        ctx.fillStyle = st.brick ? brickPat : st.color;
        ctx.fillRect(0, 0, FW, FH);
        if (st.brick) {
          ctx.fillStyle = '#a39e95';                     // pilares de concreto
          ctx.fillRect(0, 0, 3, FH); ctx.fillRect(FW - 3, 0, 3, FH);
        } else {
          ctx.fillStyle = grime; ctx.fillRect(0, 0, FW, FH);
          const hh = AF.hash(x * 3 + k, y * 5 + (side === 'L' ? 1 : 2), 77);
          if (hh > 0.7) { ctx.fillStyle = brickPat; ctx.fillRect(4 + hh * 22, 28 + hh * 10, 11, 7); }
        }
        ctx.fillStyle = 'rgba(168,162,152,0.95)';       // laje / viga
        ctx.fillRect(0, 0, FW, 3);
        if (k === 0) groundFloor(ctx, d, st, time);
        else windowDeco(ctx, d.win[k], st, d, k);
        ctx.fillStyle = side === 'L' ? 'rgba(30,20,60,0.05)' : 'rgba(30,20,60,0.3)';
        ctx.fillRect(0, 0, FW, FH);
        ctx.restore();
      }
    }
    drawRoof(ctx, W, t, time);
  }

  function windowDeco(ctx, w, st, d, k) {
    if (st.brick && w >= 3) {   // vão sem acabamento
      ctx.fillStyle = '#2a211c'; ctx.fillRect(16, 14, 16, 18);
      ctx.fillStyle = '#9a958c'; ctx.fillRect(14, 12, 20, 2);
      return;
    }
    switch (w) {
      case 0:
        ctx.fillStyle = '#eee'; ctx.fillRect(14, 13, 20, 20);
        ctx.fillStyle = '#35506b'; ctx.fillRect(16, 15, 16, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(17, 16, 5, 14);
        ctx.fillStyle = '#eee'; ctx.fillRect(23, 15, 2, 16);
        break;
      case 1:
        ctx.fillStyle = '#2b2b2b'; ctx.fillRect(15, 14, 18, 18);
        ctx.fillStyle = '#6d6d6d';
        for (let u = 16; u < 33; u += 3.5) ctx.fillRect(u, 14, 1.2, 18);
        ctx.fillRect(15, 22, 18, 1.2);
        break;
      case 2:
        ctx.fillStyle = '#8b5a2b'; ctx.fillRect(15, 14, 18, 19);
        ctx.fillStyle = '#6b4020';
        for (let v = 16; v < 33; v += 3) ctx.fillRect(15, v, 18, 1);
        ctx.fillRect(23.5, 14, 1, 19);
        break;
      case 3:
        ctx.fillStyle = '#2e86c1'; ctx.fillRect(14, 14, 20, 18);
        ctx.fillStyle = '#a9cfe8';
        for (let v = 15.5; v < 31; v += 4) ctx.fillRect(15.5, v, 17, 2.6);
        break;
      case 4:
        ctx.fillStyle = '#eee'; ctx.fillRect(7, 15, 14, 14); ctx.fillRect(27, 15, 14, 14);
        ctx.fillStyle = '#3c5670'; ctx.fillRect(8.5, 16.5, 11, 11); ctx.fillRect(28.5, 16.5, 11, 11);
        break;
      default: break;
    }
    if (d.ac && k === 1) {
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(33, 6, 12, 8);
      ctx.fillStyle = '#b8b8b8'; for (let u = 34; u < 44; u += 2) ctx.fillRect(u, 7, 1, 6);
      ctx.fillStyle = 'rgba(40,40,60,0.35)'; ctx.fillRect(38, 14, 1, 16);
    }
  }

  function groundFloor(ctx, d, st, time) {
    if (d.shop) { shopFront(ctx, d.shop, time); }
    else if (d.door) {
      ctx.fillStyle = d.doorC; ctx.fillRect(15, 22, 17, 34);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let v = 25; v < 55; v += 4) ctx.fillRect(15, v, 17, 1);
      ctx.fillStyle = '#ddd'; ctx.fillRect(28, 38, 2, 2);
      ctx.fillStyle = '#9d978d'; ctx.fillRect(13, 54, 21, 2);
      windowDeco(ctx, 5, st, d, 0);
    } else {
      ctx.save(); ctx.translate(0, 6); windowDeco(ctx, d.win[0] === 5 ? 1 : d.win[0], st, d, 0); ctx.restore();
    }
    if (d.graf) {
      const g = d.graf;
      ctx.save();
      ctx.translate(g.u, g.v); ctx.rotate(g.rot);
      ctx.font = 'bold 13px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 3; ctx.strokeStyle = '#111'; ctx.strokeText(g.text, 0, 0);
      ctx.fillStyle = g.color; ctx.fillText(g.text, 0, 0);
      ctx.fillRect(3, 0, 1, 4); ctx.fillRect(12, 0, 1, 6);
      ctx.restore();
    }
  }

  function shopFront(ctx, shop, time) {
    const k = shop.kind;
    ctx.fillStyle = '#8d8d8d'; ctx.fillRect(3, 17, 42, 4);                   // porta de enrolar recolhida
    ctx.fillStyle = k === 'barbearia' ? '#dfe6ea' : '#2a2220'; ctx.fillRect(4, 21, 40, 35);
    if (k === 'bar') {
      ctx.fillStyle = '#6d4c2f'; ctx.fillRect(4, 24, 40, 2);
      const cols = ['#2e7d32', '#6d4c2f', '#c0392b', '#f1c40f', '#ecf0f1'];
      for (let i = 0; i < 9; i++) { ctx.fillStyle = cols[i % 5]; ctx.fillRect(7 + i * 4, 27, 2, 6); }
      ctx.fillStyle = '#d7d0c2'; ctx.fillRect(4, 43, 40, 13);
      ctx.fillStyle = '#b5ada0'; ctx.fillRect(4, 43, 40, 2);
      board(ctx, shop.name, '#c0392b', '#fff', 'Arial Black, Arial, sans-serif');
      for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#d93b30'; ctx.fillRect(3 + i * 7, 17, 7, 4); }
    } else if (k === 'mercearia') {
      const cols = ['#e74c3c', '#f1c40f', '#27ae60', '#3498db', '#e67e22'];
      for (let r = 0; r < 3; r++) {
        ctx.fillStyle = '#7b5a3a'; ctx.fillRect(4, 29 + r * 8, 40, 1.5);
        for (let i = 0; i < 9; i++) { ctx.fillStyle = cols[(i + r * 2) % 5]; ctx.fillRect(6 + i * 4.2, 24 + r * 8, 3, 5); }
      }
      board(ctx, shop.name, '#f4d03f', '#222', '"Comic Sans MS", "Segoe Print", cursive');
      ctx.fillStyle = '#fff'; ctx.fillRect(30, 44, 12, 8);
      fitText(ctx, 'PIX', 36, 48.5, 10, 6, '#16a085');
    } else if (k === 'barbearia') {
      ctx.fillStyle = '#34495e'; ctx.fillRect(14, 36, 10, 14); ctx.fillRect(16, 30, 6, 7);
      ctx.fillStyle = '#b0c4d0'; ctx.fillRect(28, 26, 12, 14);
      board(ctx, shop.name, '#1f3a93', '#fff', 'Arial Black, Arial, sans-serif');
      // poste de barbeiro girando
      ctx.fillStyle = '#fff'; ctx.fillRect(41, 22, 4, 22);
      ctx.save(); ctx.beginPath(); ctx.rect(41, 22, 4, 22); ctx.clip();
      const off = (time * 12) % 8;
      for (let v = -8; v < 30; v += 8) { ctx.fillStyle = '#d62828'; ctx.fillRect(41, 22 + v + off, 4, 2.5); ctx.fillStyle = '#1f3a93'; ctx.fillRect(41, 26 + v + off, 4, 2.5); }
      ctx.restore();
    } else {
      ctx.fillStyle = '#5b2a86'; ctx.fillRect(8, 40, 32, 16);
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(10, 30, 6, 8); ctx.fillStyle = '#8e44ad'; ctx.fillRect(20, 30, 6, 8);
      board(ctx, shop.name, '#5b2a86', '#f7dc6f', 'Arial Black, Arial, sans-serif');
    }
  }

  function board(ctx, text, bg, fg, font) {
    ctx.fillStyle = bg; ctx.fillRect(2, 5, 44, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(2, 15, 44, 2);
    fitText(ctx, text, 24, 11, 40, 8, fg, font);
  }

  function drawRoof(ctx, W, t, time) {
    const h = t.house, x = t.x, y = t.y, zt = h.base + h.floors * FL;
    const top = [P(x, y, zt), P(x + 1, y, zt), P(x + 1, y + 1, zt), P(x, y + 1, zt)];
    const ext = (dx, dy) => { const n = W.at(x + dx, y + dy); return !n || n.house !== h; };
    if (h.roof === 'telha') {
      poly(ctx, top, '#8f9aa3');
      topXf(ctx, x, y, zt);
      ctx.fillStyle = 'rgba(40,50,60,0.25)';
      for (let u = 0.08; u < 1; u += 0.14) ctx.fillRect(u, 0, 0.035, 1);
      ctx.restore();
    } else {
      poly(ctx, top, '#bdb7ac');
      const hs = AF.hash(x, y, 404);
      if (hs > 0.55) {
        topXf(ctx, x, y, zt);
        ctx.fillStyle = 'rgba(70,70,60,0.18)';
        ctx.beginPath(); ctx.ellipse(0.3 + hs * 0.4, 0.5, 0.22, 0.14, hs * 3, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
    const mur = h.roof === 'laje' ? 0.6 : 0;
    const topCol = h.styles[h.floors - 1];
    // mureta dos fundos
    if (mur) {
      if (ext(0, -1)) poly(ctx, [P(x, y, zt), P(x + 1, y, zt), P(x + 1, y, zt + mur), P(x, y, zt + mur)], '#a59f95');
      if (ext(-1, 0)) poly(ctx, [P(x, y, zt), P(x, y + 1, zt), P(x, y + 1, zt + mur), P(x, y, zt + mur)], '#b0aa9f');
    }
    if (h.roof === 'obra') {
      const cs = [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92]];
      for (const [u, v] of cs) {
        box(ctx, x + u - 0.05, y + v - 0.05, x + u + 0.05, y + v + 0.05, zt, zt + 1.4, '#aaa49a');
        const [px, py] = P(x + u, y + v, zt + 1.4);
        ctx.strokeStyle = '#7a3e22'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let r = -1; r <= 1; r++) { ctx.moveTo(px + r * 2, py); ctx.lineTo(px + r * 3, py - 13 - r * r * 2); }
        ctx.stroke();
      }
    }
    for (const p of t.roof) roofProp(ctx, x, y, zt, p, time);
    // mureta da frente (continua a fachada)
    if (mur) {
      const col = topCol.brick ? '#b8633a' : topCol.color;
      if (t.faces.L) poly(ctx, [P(x, y + 1, zt), P(x + 1, y + 1, zt), P(x + 1, y + 1, zt + mur), P(x, y + 1, zt + mur)], AF.shade(col, 0.88));
      if (t.faces.R) poly(ctx, [P(x + 1, y, zt), P(x + 1, y + 1, zt), P(x + 1, y + 1, zt + mur), P(x + 1, y, zt + mur)], AF.shade(col, 0.66));
      ctx.strokeStyle = 'rgba(230,225,215,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (t.faces.L) { const a = P(x, y + 1, zt + mur), b = P(x + 1, y + 1, zt + mur); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      if (t.faces.R) { const a = P(x + 1, y, zt + mur), b = P(x + 1, y + 1, zt + mur); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
    }
  }

  const CLOTHES = ['#e74c3c', '#f1c40f', '#3498db', '#ecf0f1', '#9b59b6', '#2ecc71', '#e67e22', '#ff8fb1'];

  function roofProp(ctx, x, y, zt, p, time) {
    const [px, py] = P(x + p.u, y + p.v, zt);
    switch (p.kind) {
      case 'tank':
        cyl(ctx, px, py, 13, 6.5, 19, '#4d92f0', '#1b4fa6', '#5aa0ff');
        ctx.fillStyle = '#1a4a9a'; ctx.beginPath(); ctx.ellipse(px, py - 19, 6, 3, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(px, py - 8, 13, 6.5, 0, 0.1, Math.PI - 0.1); ctx.stroke();
        break;
      case 'dish':
        ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 12); ctx.stroke();
        ctx.save(); ctx.translate(px + 1, py - 15); ctx.rotate(-0.6);
        ctx.fillStyle = '#e6e6e6'; ctx.strokeStyle = '#9a9a9a';
        ctx.beginPath(); ctx.ellipse(0, 0, 8, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, -5); ctx.stroke();
        ctx.restore();
        break;
      case 'fish':
        ctx.strokeStyle = '#7a7a7a'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 36);
        for (let i = 0; i < 5; i++) { const w = 12 - i * 1.6, yy = py - 34 + i * 4; ctx.moveTo(px - w, yy + w * 0.5); ctx.lineTo(px + w, yy - w * 0.5); }
        ctx.stroke();
        break;
      case 'varal': {
        const a = P(x + 0.15, y + p.v, zt), b = P(x + 0.85, y + p.v, zt);
        ctx.strokeStyle = '#6d6d6d'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0], a[1] - 17); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0], b[1] - 17); ctx.stroke();
        ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.8;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - 17 + 4;
        ctx.beginPath(); ctx.moveTo(a[0], a[1] - 17); ctx.quadraticCurveTo(mx, my + 3, b[0], b[1] - 17); ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const f = 0.18 + i * 0.21;
          const lx = a[0] + (b[0] - a[0]) * f, ly = a[1] - 17 + (b[1] - a[1]) * f + 6 * 4 * f * (1 - f) * 0.5 + 1;
          const sway = Math.sin(time * 2.2 + i + p.c) * 1.5;
          ctx.fillStyle = CLOTHES[(p.c + i * 3) % CLOTHES.length];
          ctx.beginPath(); ctx.moveTo(lx - 3, ly); ctx.lineTo(lx + 3, ly); ctx.lineTo(lx + 3 + sway, ly + 8); ctx.lineTo(lx - 3 + sway, ly + 8); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'bbq': {
        const u = x + p.u, v = y + p.v;
        box(ctx, u - 0.1, v - 0.1, u + 0.1, v + 0.1, zt, zt + 1.1, '#b8633a');
        box(ctx, u - 0.035, v - 0.035, u + 0.035, v + 0.035, zt + 1.1, zt + 2.4, '#9a9590');
        const [cx, cy] = P(u, v, zt + 2.4);
        for (let i = 0; i < 3; i++) {
          const ph = (time * 0.5 + i / 3 + p.c * 0.001) % 1;
          ctx.fillStyle = `rgba(225,225,225,${0.4 * (1 - ph)})`;
          ctx.beginPath(); ctx.arc(cx + Math.sin(ph * 6 + i) * 3 + ph * 6, cy - ph * 22, 2.5 + ph * 4, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'chair':
        ctx.fillStyle = p.c % 2 ? '#e74c3c' : '#2e86c1';
        ctx.beginPath(); ctx.moveTo(px - 8, py - 1); ctx.lineTo(px + 4, py - 7); ctx.lineTo(px + 8, py - 5); ctx.lineTo(px - 4, py + 1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(px - 8, py - 1); ctx.lineTo(px - 8, py - 10); ctx.lineTo(px - 5, py - 11); ctx.lineTo(px - 5, py - 2); ctx.closePath(); ctx.fill();
        break;
      case 'plant':
        ctx.fillStyle = '#b35a2b'; ctx.fillRect(px - 4, py - 7, 8, 7);
        ctx.fillStyle = '#3c8d2f';
        ctx.beginPath(); ctx.arc(px - 2, py - 10, 4, 0, TAU); ctx.arc(px + 3, py - 11, 4, 0, TAU); ctx.arc(px, py - 14, 4, 0, TAU); ctx.fill();
        break;
    }
  }

  // ------------------------------------------------------------ props de chão
  function groundProp(ctx, t, p, time) {
    const z = t.level, u = t.x + p.u, v = t.y + p.v;
    const [px, py] = P(u, v, z);
    switch (p.kind) {
      case 'poste': {
        box(ctx, u - 0.05, v - 0.05, u + 0.05, v + 0.05, z, z + 9, '#c3beb5');
        const a = P(u - 0.3, v, z + 8.6), b = P(u + 0.3, v, z + 8.6);
        ctx.strokeStyle = '#8d8880'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        const tr = P(u + 0.1, v + 0.1, z + 6.6);
        cyl(ctx, tr[0], tr[1], 5, 2.5, 12, '#9aa3a8', '#5d666b', '#b5bcc0');
        const l0 = P(u, v, z + 8), l1 = P(u - 0.3, v + 0.3, z + 8.4);
        ctx.strokeStyle = '#8d8880'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(l0[0], l0[1]); ctx.lineTo(l1[0], l1[1]); ctx.stroke();
        ctx.fillStyle = '#fff3b0'; ctx.fillRect(l1[0] - 3, l1[1], 6, 2);
        break;
      }
      case 'lixeira':
        ctx.fillStyle = '#1b1b1b';
        for (const [a, b] of [[-0.3, 0.3], [0.3, 0.32]]) {
          const q = P(u + a, v + b, z);
          ctx.beginPath(); ctx.ellipse(q[0], q[1] - 4, 7, 5.5, 0, 0, TAU); ctx.fill();
        }
        box(ctx, u - 0.28, v - 0.2, u + 0.28, v + 0.18, z, z + 1.7, '#2f7d3b');
        ctx.fillStyle = '#1b1b1b';
        { const q = P(u + 0.05, v + 0.4, z); ctx.beginPath(); ctx.ellipse(q[0], q[1] - 4, 8, 6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(q[0] - 3, q[1] - 8, 3, 2); }
        break;
      case 'sacos': {
        ctx.fillStyle = '#1b1b1b';
        ctx.beginPath(); ctx.ellipse(px, py - 3.5, 6, 4.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2b2b2b';
        ctx.beginPath(); ctx.ellipse(px + 6, py - 2.5, 4.5, 3.5, 0, 0, TAU); ctx.fill();
        break;
      }
      case 'botijao':
        for (const [a, b] of [[-0.15, -0.05], [0.13, 0.12]]) {
          const q = P(u + a, v + b, z);
          cyl(ctx, q[0], q[1], 6, 3, 11, AF.shade(p.c, 1.2), AF.shade(p.c, 0.6), AF.shade(p.c, 1.1));
          ctx.fillStyle = '#555'; ctx.fillRect(q[0] - 1.5, q[1] - 16, 3, 3);
          ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(q[0], q[1] - 15, 4, Math.PI, TAU); ctx.stroke();
        }
        break;
      case 'barril':
        cyl(ctx, px, py, 9, 4.5, 20, '#3a8fd6', '#174f86', '#2c7bc0');
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
        for (const hh of [6, 13]) { ctx.beginPath(); ctx.ellipse(px, py - hh, 9, 4.5, 0, 0, Math.PI); ctx.stroke(); }
        break;
      case 'moto':
        R.drawMoto(ctx, px, py, p.d ? 1 : -1, 0.5, p.c, false, 0);
        break;
      case 'mesa': {
        const chairs = [[-0.3, -0.05], [0.28, 0.1]];
        for (const [a, b] of chairs) plasticChair(ctx, u + a, v + b, z, p.c);
        ctx.strokeStyle = AF.shade(p.c, 0.7); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px - 8, py - 1); ctx.lineTo(px - 7, py - 15); ctx.moveTo(px + 8, py - 1); ctx.lineTo(px + 7, py - 15); ctx.moveTo(px, py + 3); ctx.lineTo(px, py - 13); ctx.stroke();
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(px, py - 16, 14, 7, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = AF.shade(p.c, 0.8); ctx.beginPath(); ctx.ellipse(px, py - 15, 14, 7, 0, 0, Math.PI); ctx.fill();
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(px, py - 16.5, 13, 6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#6b3a12'; ctx.fillRect(px - 3, py - 29, 4, 11); ctx.fillRect(px - 2, py - 32, 2, 3);
        ctx.fillStyle = 'rgba(255,240,200,0.8)'; ctx.fillRect(px + 4, py - 22, 3.5, 5);
        break;
      }
      case 'bananeira': bananeira(ctx, px, py, p.s, time); break;
      case 'mangueira': mangueira(ctx, px, py, p.s); break;
      case 'mato': {
        ctx.strokeStyle = '#4c8a28'; ctx.lineWidth = 1.2;
        for (let k = 0; k < 7; k++) {
          const q = P(t.x + 0.15 + AF.hash(p.s, k, 1) * 0.7, t.y + 0.15 + AF.hash(p.s, k, 2) * 0.7, z);
          ctx.beginPath();
          for (let b = -2; b <= 2; b++) { ctx.moveTo(q[0] + b, q[1]); ctx.lineTo(q[0] + b * 2.5, q[1] - 6 - (2 - Math.abs(b)) * 2.5); }
          ctx.stroke();
        }
        break;
      }
      case 'entulho': {
        const cols = ['#9c968d', '#b8633a', '#7d776f', '#c9c2b6'];
        for (let k = 0; k < 7; k++) {
          const q = P(t.x + 0.25 + AF.hash(p.s, k, 3) * 0.5, t.y + 0.25 + AF.hash(p.s, k, 4) * 0.5, z);
          ctx.fillStyle = cols[k % 4];
          ctx.beginPath(); ctx.moveTo(q[0] - 5, q[1]); ctx.lineTo(q[0] - 1, q[1] - 6); ctx.lineTo(q[0] + 5, q[1] - 2); ctx.lineTo(q[0] + 3, q[1] + 1); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
        const q = P(t.x + 0.7, t.y + 0.35, z);
        ctx.beginPath(); ctx.ellipse(q[0], q[1] - 3, 6, 3, 0, 0, TAU); ctx.stroke();
        break;
      }
    }
  }

  function plasticChair(ctx, u, v, z, col) {
    const [px, py] = P(u, v, z);
    ctx.strokeStyle = AF.shade(col, 0.7); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px - 5, py); ctx.lineTo(px - 5, py - 9); ctx.moveTo(px + 5, py); ctx.lineTo(px + 5, py - 9); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(px, py - 10, 7, 3.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = AF.shade(col, 0.85); ctx.fillRect(px - 6, py - 22, 12, 11);
  }

  function bananeira(ctx, px, py, s, time) {
    ctx.strokeStyle = '#7d8f3a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 3, py - 18, px + 1, py - 34); ctx.stroke();
    ctx.lineCap = 'butt';
    const tx = px + 1, ty = py - 34;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.55 + Math.sin(time * 1.3 + s + i) * 0.05;
      const dx = Math.cos(a), dy = Math.sin(a), L = 24 + AF.hash(i, s * 100 | 0, 7) * 8;
      const ex = tx + dx * L, ey = ty + dy * L * 0.6 + 10 + Math.abs(dx) * 6;
      const cx = tx + dx * L * 0.5 - dy * 0, cy = ty + dy * L * 0.6 - 8;
      ctx.fillStyle = i % 3 === 0 ? '#8fb33a' : i % 2 ? '#4f9a2c' : '#62ad35';
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(cx - dy * 6, cy + dx * 6 * 0.3 - 4, ex, ey);
      ctx.quadraticCurveTo(cx + dy * 6, cy + 4, tx, ty);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,70,20,0.5)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
    }
    ctx.fillStyle = '#b9c43a';
    ctx.beginPath(); ctx.ellipse(tx + 4, ty + 8, 3, 5, 0.3, 0, TAU); ctx.fill();
  }

  function mangueira(ctx, px, py, s) {
    ctx.fillStyle = '#5d4027'; ctx.fillRect(px - 3.5, py - 30, 7, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(px, py, 22, 10, 0, 0, TAU); ctx.fill();
    const blobs = [[0, -50, 22], [-16, -40, 17], [16, -40, 17], [-9, -62, 15], [11, -60, 15]];
    ctx.fillStyle = '#2d6628';
    for (const [dx, dy, r] of blobs) { ctx.beginPath(); ctx.arc(px + dx, py + dy, r, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#3f8a37';
    for (const [dx, dy, r] of blobs) { ctx.beginPath(); ctx.arc(px + dx - r * 0.25, py + dy - r * 0.3, r * 0.6, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#f39c12';
    for (let k = 0; k < 5; k++) {
      const a = AF.hash(k, s * 100 | 0, 8) * TAU, r = 10 + AF.hash(k, 3, s * 100 | 0) * 10;
      ctx.beginPath(); ctx.arc(px + Math.cos(a) * r, py - 46 + Math.sin(a) * r * 0.7, 2.2, 0, TAU); ctx.fill();
    }
  }

  // ------------------------------------------------------------ tile completo
  R.drawTile = function (ctx, W, t, time) {
    drawGround(ctx, W, t);
    const faded = t.fade < 0.999;
    if (t.type === T.HOUSE) {
      if (faded) ctx.globalAlpha = t.fade;
      drawHouse(ctx, W, t, time);
      ctx.globalAlpha = 1;
    }
    for (const p of t.props) {
      const tall = p.kind === 'bananeira' || p.kind === 'mangueira';
      if (tall && faded) ctx.globalAlpha = t.fade;
      groundProp(ctx, t, p, time);
      ctx.globalAlpha = 1;
    }
  };

  // ------------------------------------------------------------ fiação
  R.drawWires = function (ctx, W, view) {
    ctx.strokeStyle = 'rgba(18,18,18,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const w of W.wires) {
      const a = P(w.a[0], w.a[1], w.a[2]), b = P(w.b[0], w.b[1], w.b[2]);
      if (Math.max(a[0], b[0]) < view.x0 || Math.min(a[0], b[0]) > view.x1) continue;
      if (Math.max(a[1], b[1]) + 60 < view.y0 || Math.min(a[1], b[1]) > view.y1) continue;
      const d = Math.hypot(w.a[0] - w.b[0], w.a[1] - w.b[1]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + (w.sag * d + 0.4) * UZ;
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(mx, my, b[0], b[1]);
    }
    ctx.stroke();
    // emaranhados nos postes
    ctx.strokeStyle = 'rgba(15,15,15,0.85)';
    ctx.beginPath();
    for (const p of W.poles) {
      const [px, py] = P(p.x, p.y, p.z - 0.6);
      if (px < view.x0 || px > view.x1 || py < view.y0 - 20 || py > view.y1) continue;
      for (let k = 0; k < 4; k++) {
        ctx.moveTo(px + 7 + k, py + k * 2);
        ctx.ellipse(px + k - 1, py + k * 2, 7 + k, 3 + k * 0.6, 0.2 * k, 0, TAU);
      }
    }
    ctx.stroke();
  };

  // ------------------------------------------------------------ personagens
  R.drawPerson = function (ctx, sx, sy, o) {
    const m = o.mono, c = col => m || col;
    const sw = o.moving ? Math.sin(o.phase) : 0;
    const fx = o.fx;
    if (!m) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(sx, sy, 9, 4.5, 0, 0, TAU); ctx.fill(); }
    // pernas
    ctx.fillStyle = c(o.pants);
    const l1 = sw * 3, l2 = -sw * 3;
    ctx.fillRect(sx - 5 + l1 * fx * 0.6, sy - 14 - Math.max(0, sw) * 2, 4, 13);
    ctx.fillRect(sx + 1 + l2 * fx * 0.6, sy - 14 - Math.max(0, -sw) * 2, 4, 13);
    ctx.fillStyle = c('#222');
    ctx.fillRect(sx - 5.5 + l1 * fx * 0.6, sy - 2 - Math.max(0, sw) * 2, 5, 2);
    ctx.fillRect(sx + 0.5 + l2 * fx * 0.6, sy - 2 - Math.max(0, -sw) * 2, 5, 2);
    // braços
    ctx.strokeStyle = c(o.skin); ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx - 7, sy - 26); ctx.lineTo(sx - 9 - sw * fx * 3, sy - 16 + Math.abs(sw) * 0.5);
    ctx.moveTo(sx + 7, sy - 26); ctx.lineTo(sx + 9 + sw * fx * 3, sy - 16 + Math.abs(sw) * 0.5);
    ctx.stroke(); ctx.lineCap = 'butt';
    // tronco
    ctx.fillStyle = c(o.shirt);
    ctx.beginPath(); ctx.roundRect(sx - 7.5, sy - 29, 15, 16, 3); ctx.fill();
    if (!m && o.stripe) { ctx.fillStyle = o.stripe; ctx.fillRect(sx - 7.5, sy - 22, 15, 2.5); }
    // cabeça
    const hx = sx + fx * 1.2;
    ctx.fillStyle = c(o.skin);
    ctx.beginPath(); ctx.arc(hx, sy - 35, 6.5, 0, TAU); ctx.fill();
    if (o.cap) {
      ctx.fillStyle = c(o.cap);
      ctx.beginPath(); ctx.arc(hx, sy - 36, 6.8, Math.PI, TAU); ctx.fill();
      if (!o.back) ctx.fillRect(hx + (fx >= 0 ? -2 : -7), sy - 37, 9, 2.4);
    } else {
      ctx.fillStyle = c(o.hair);
      ctx.beginPath(); ctx.arc(hx, sy - 36.5, 6.8, Math.PI * (o.back ? 0.9 : 1.05), Math.PI * (o.back ? 2.1 : 1.95)); ctx.fill();
      if (o.back) { ctx.beginPath(); ctx.arc(hx, sy - 35, 6.6, 0, TAU); ctx.fill(); }
    }
    if (!o.back && !m) {
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(hx + fx * 2.5 - 3, sy - 35.5, 1.6, 2);
      ctx.fillRect(hx + fx * 2.5 + 1.5, sy - 35.5, 1.6, 2);
    }
  };

  R.drawDog = function (ctx, sx, sy, o) {
    const fx = o.fx >= 0 ? 1 : -1, sw = o.moving ? Math.sin(o.phase) * 2.5 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx, sy, 10, 4, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = o.col; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(sx - 6, sy - 7); ctx.lineTo(sx - 6 + sw, sy);
    ctx.moveTo(sx - 3, sy - 7); ctx.lineTo(sx - 3 - sw, sy);
    ctx.moveTo(sx + 4, sy - 7); ctx.lineTo(sx + 4 - sw, sy);
    ctx.moveTo(sx + 7, sy - 7); ctx.lineTo(sx + 7 + sw, sy);
    ctx.stroke();
    ctx.fillStyle = o.col; ctx.beginPath(); ctx.ellipse(sx, sy - 9, 10, 5, 0, 0, TAU); ctx.fill();
    if (o.spot) { ctx.fillStyle = o.spot; ctx.beginPath(); ctx.ellipse(sx - 2, sy - 11, 4, 2.5, 0, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.fillStyle = o.col; ctx.arc(sx + fx * 10, sy - 14, 4.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx + fx * 13, sy - 12.5, 3, 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = AF.shade(o.col, 0.6);
    ctx.beginPath(); ctx.ellipse(sx + fx * 8.5, sy - 17, 1.8, 3.2, fx * 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(sx + fx * 15 - 1, sy - 13.5, 2, 2); ctx.fillRect(sx + fx * 11 - 0.5, sy - 16, 1.4, 1.4);
    ctx.strokeStyle = o.col; ctx.lineWidth = 2;
    const wag = Math.sin(o.time * (o.moving ? 14 : 8)) * 4;
    ctx.beginPath(); ctx.moveTo(sx - fx * 9, sy - 11); ctx.quadraticCurveTo(sx - fx * 13, sy - 16, sx - fx * 12 + wag, sy - 20); ctx.stroke();
  };

  // sdx/sdy: direção na tela (normalizada)
  R.drawMoto = function (ctx, sx, sy, sdx, sdy, col, rider, time) {
    const n = Math.hypot(sdx, sdy) || 1; sdx /= n; sdy /= n;
    const L = 11;
    const fx = sx + sdx * L, fy = sy + sdy * L, bx = sx - sdx * L, by = sy - sdy * L;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx, sy, 14, 5, Math.atan2(sdy, sdx) * 0.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.ellipse(fx, fy - 5, 3, 5, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(bx, by - 5, 3, 5, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx, by - 8); ctx.lineTo(sx, sy - 11); ctx.lineTo(fx - sdx * 2, fy - 12); ctx.stroke();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(fx, fy - 5); ctx.lineTo(fx - sdx * 3, fy - 17); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#222'; ctx.fillRect(sx - sdx * 5 - 4, sy - sdy * 5 - 15, 8, 3);
    if (rider) {
      const rx = sx - sdx * 3, ry = sy - sdy * 3;
      ctx.fillStyle = '#f39c12'; ctx.beginPath(); ctx.roundRect(rx - 5.5, ry - 30, 11, 15, 3); ctx.fill();
      ctx.strokeStyle = '#8d5524'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(rx, ry - 26); ctx.lineTo(fx - sdx * 3, fy - 17); ctx.stroke();
      ctx.fillStyle = '#1f3a93'; ctx.fillRect(rx - 4, ry - 17, 8, 6);
      ctx.fillStyle = rider; ctx.beginPath(); ctx.arc(rx + sdx * 1.5, ry - 35, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(20,20,30,0.8)'; ctx.fillRect(rx + sdx * 3 - 3, ry - 37, 6, 3);
    }
  };

  R.drawVehicle = function (ctx, W, v, time) {
    const z = v.z;
    if (v.kind === 'moto') {
      const [sx, sy] = P(v.x, v.y, z);
      const sdx = (v.hx - v.hy), sdy = (v.hx + v.hy) * 0.5;
      R.drawMoto(ctx, sx, sy, sdx, sdy, v.col, v.helmet, time);
    } else {
      const ax = v.hx !== 0;
      const hl = v.len / 2, hw = v.wid / 2;
      const ex = ax ? hl : hw, ey = ax ? hw : hl;
      const x0 = v.x - ex, x1 = v.x + ex, y0 = v.y - ey, y1 = v.y + ey;
      // sombra
      poly(ctx, [P(x0 - 0.05, y0 - 0.05, z), P(x1 + 0.1, y0 - 0.05, z), P(x1 + 0.1, y1 + 0.1, z), P(x0 - 0.05, y1 + 0.1, z)], 'rgba(0,0,0,0.28)');
      // rodas
      const wz = 0.75, inset = 0.22;
      const wheels = ax ? [[x0 + inset, y1], [x1 - inset, y1], [x1 - inset, y0]] : [[x1, y0 + inset], [x1, y1 - inset], [x0, y1 - inset]];
      ctx.fillStyle = '#151515';
      for (const [wx, wy] of wheels) { const q = P(wx, wy, z + wz * 0.5); ctx.beginPath(); ctx.ellipse(q[0], q[1], 5, 5.5, 0, 0, TAU); ctx.fill(); }
      const top = v.kind === 'van' ? 3.1 : 1.5;
      box(ctx, x0, y0, x1, y1, z + 0.4, z + top, v.col);
      if (v.kind === 'car') {
        // cabine: um pouco para trás do centro
        const hdx = v.hx, hdy = v.hy;
        const cx = v.x - hdx * 0.1, cy = v.y - hdy * 0.1;
        const cex = ax ? hl * 0.5 : hw - 0.05, cey = ax ? hw - 0.05 : hl * 0.5;
        box(ctx, cx - cex, cy - cey, cx + cex, cy + cey, z + top, z + top + 1.05, '#2a3a4a', 1.0, 1.05, 0.8);
        box(ctx, cx - cex + 0.02, cy - cey + 0.02, cx + cex - 0.02, cy + cey - 0.02, z + top + 1.05, z + top + 1.15, v.col);
      } else {
        // van: faixa de janelas + listra
        const q1 = [P(x0, y1, z + 2.9), P(x1, y1, z + 2.9), P(x1, y1, z + 2.1), P(x0, y1, z + 2.1)];
        poly(ctx, q1, '#34495e');
        poly(ctx, [P(x1, y0, z + 2.9), P(x1, y1, z + 2.9), P(x1, y1, z + 2.1), P(x1, y0, z + 2.1)], '#2c3e50');
        poly(ctx, [P(x0, y1, z + 1.4), P(x1, y1, z + 1.4), P(x1, y1, z + 1.1), P(x0, y1, z + 1.1)], '#1f6fb2');
        poly(ctx, [P(x1, y0, z + 1.4), P(x1, y1, z + 1.4), P(x1, y1, z + 1.1), P(x1, y0, z + 1.1)], '#185a91');
      }
      // faróis
      const hx = v.hx, hy = v.hy;
      if (hx > 0 || hy > 0) {
        const q = P(hx > 0 ? x1 : x0 + 0.1, hy > 0 ? y1 : y0 + 0.1, z + 1.0);
        const q2 = P(hx > 0 ? x1 : x1 - 0.1, hy > 0 ? y1 : y1 - 0.1, z + 1.0);
        ctx.fillStyle = '#fff6c8';
        ctx.fillRect(q[0] - 2, q[1] - 2, 4, 3); ctx.fillRect(q2[0] - 2, q2[1] - 2, 4, 3);
      }
    }
    if (v.honk > 0) {
      const [sx, sy] = P(v.x, v.y, z + 4);
      ctx.font = 'bold 13px Arial Black, Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = '#111'; ctx.strokeText('BI-BI!', sx, sy - 10);
      ctx.fillStyle = '#ffe600'; ctx.fillText('BI-BI!', sx, sy - 10);
    }
  };
})(window.AF = window.AF || {});

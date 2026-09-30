'use strict';
(function (AF) {
  const { CFG, T } = AF;
  const FL = CFG.FLOOR;
  const RAMP_FLAT = 0.36;  // primeiros 36% da escada são patamar plano (entrada fácil)
  AF.RAMP_FLAT = RAMP_FLAT;
  const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  AF.DIR4 = DIR4;

  const SHOPS = [
    { kind: 'bar', names: ['BAR DO ZÉ', 'BAR DA TIA', 'BIROSCA', 'BOTECO'] },
    { kind: 'mercearia', names: ['MERCEARIA', 'MERCADINHO', 'DEPÓSITO'] },
    { kind: 'barbearia', names: ['BARBEARIA', 'CORTE R$15'] },
    { kind: 'acai', names: ['AÇAÍ', 'SALGADOS'] },
  ];
  const TAGS = ['PAZ', 'AMOR', 'RJ', 'MORRO', 'FÉ', 'VILA', '021', 'ARTE', 'JUNTOS', 'CRIA'];
  const GRAF = ['#ff3fa4', '#29e0ff', '#ffe600', '#7dff4f', '#ff7a1a', '#b86bff', '#ffffff'];
  const DOORS = ['#5a6b7a', '#2f5d3a', '#274a7a', '#7a3b2a', '#8a8a8a', '#a33a3a'];

  class MinHeap {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(v, k) {
      const a = this.k, b = this.v; a.push(k); b.push(v);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p] <= a[i]) break;
        [a[p], a[i]] = [a[i], a[p]]; [b[p], b[i]] = [b[i], b[p]]; i = p;
      }
    }
    pop() {
      const a = this.k, b = this.v, top = b[0];
      const lk = a.pop(), lv = b.pop();
      if (a.length) {
        a[0] = lk; b[0] = lv;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < a.length && a[l] < a[m]) m = l;
          if (r < a.length && a[r] < a[m]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]]; [b[m], b[i]] = [b[i], b[m]]; i = m;
        }
      }
      return top;
    }
  }

  class World {
    constructor(seed) {
      this.seed = seed;
      this.N = CFG.N;
      this.generate();
    }

    at(x, y) { return (x < 0 || y < 0 || x >= this.N || y >= this.N) ? null : this.tiles[y * this.N + x]; }

    // Um tile é caminhável pelo chão (becos, ruas…) ou por uma superfície elevada (escada / laje)
    isWalk(t) {
      if (!t) return false;
      if (t.surf) return !t.surfBlock;
      return AF.WALK.has(t.type) && !t.block;
    }

    // Altura da superfície caminhável de t no ponto (gx, gy): chão, rampa da rua, escada ou laje
    heightAt(t, gx, gy) {
      const s = t.surf;
      if (s) {
        if (s.kind === 'deck') return s.h;
        let f = s.axis === 'x' ? gx - t.x : gy - t.y;
        if (s.dir < 0) f = 1 - f;
        return s.lo + (s.hi - s.lo) * AF.clamp((f - RAMP_FLAT) / (1 - RAMP_FLAT), 0, 1);
      }
      if (!t.corners) return t.level;
      const fx = gx - t.x, fy = gy - t.y, c = t.corners;
      return c[0] * (1 - fx) * (1 - fy) + c[1] * fx * (1 - fy) + c[2] * fx * fy + c[3] * (1 - fx) * fy;
    }
    groundAt(gx, gy) {
      const t = this.at(Math.floor(gx), Math.floor(gy));
      return t ? this.heightAt(t, gx, gy) : 0;
    }
    // Altura no meio da aresta de t voltada para (dx, dy)
    edgeHeight(t, dx, dy) { return this.heightAt(t, t.x + 0.5 + dx * 0.5, t.y + 0.5 + dy * 0.5); }
    // Alturas nos 4 vértices (N, E, S, W) da superfície caminhável
    surfCorners(t) {
      if (t.surf) return [this.heightAt(t, t.x, t.y), this.heightAt(t, t.x + 1, t.y), this.heightAt(t, t.x + 1, t.y + 1), this.heightAt(t, t.x, t.y + 1)];
      return t.corners || [t.level, t.level, t.level, t.level];
    }

    // Dá para passar de a para b? No chão comum compara os níveis; com escada/laje procura
    // um ponto da aresta comum com desnível <= 1 degrau (diagonais só em chão comum).
    canStep(a, b) {
      if (!this.isWalk(b)) return false;
      if (!a.surf && !b.surf) return Math.abs(a.level - b.level) <= CFG.STEP;
      if (a.x !== b.x && a.y !== b.y) return false;
      return !!this.crossing(a, b);
    }
    // Melhor ponto de passagem na aresta comum: o corpo inteiro (largura 2·raio) precisa caber
    // com desnível <= 1 degrau dos dois lados. Empate -> mais perto do meio da aresta.
    crossing(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, r = CFG.RADIUS + 0.01;
      const pt = s => [dx ? Math.max(a.x, b.x) : a.x + s, dy ? Math.max(a.y, b.y) : a.y + s];
      const H = (t, x, y) => (t.surf ? this.heightAt(t, x, y) : t.level);   // mesma regra da colisão
      let best = null, bd = Infinity;
      for (let s = 0.18; s <= 0.821; s += 0.02) {
        const [px, py] = pt(s), ha = H(a, px, py), hb = H(b, px, py);
        // simétrico: com o centro de qualquer lado, o corpo todo precisa caber
        let d = Math.abs(ha - hb);
        for (const o of [-r, r]) {
          const [qx, qy] = pt(s + o), qa = H(a, qx, qy), qb = H(b, qx, qy);
          d = Math.max(d, Math.abs(qb - ha), Math.abs(qa - hb), Math.abs(qa - ha), Math.abs(qb - hb));
        }
        d += Math.abs(s - 0.5) * 0.01;
        if (d < bd) { bd = d; best = [px, py]; }
      }
      return bd <= CFG.STEP + 0.01 ? best : null;
    }

    // ---------------------------------------------------------------- geração
    generate() {
      const N = this.N, rng = AF.makeRng(this.seed), seed = this.seed;
      const tiles = this.tiles = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        tiles.push({
          x, y, i: y * N + x, type: T.NONE, level: 0, corners: null, house: null,
          props: [], roof: [], faces: null, block: false, ceramic: false, tufts: 0,
          fade: 1, fadeT: 1, inFade: false, structTop: 0, top: 0, tall: false,
        });
      }
      const at = (x, y) => this.at(x, y);
      // Morro: sobe forte em -y (fundo) e um pouco em -x
      const hill = (x, y) => {
        if (y >= N - 3) return 0;
        const up = N - 4 - y;
        return up * 0.72 + 0.7 + (N - 1 - x) * 0.08 * Math.min(1, up / 14);
      };

      // Avenida + calçada na base
      for (let x = 0; x < N; x++) {
        at(x, N - 1).type = T.AVENUE; at(x, N - 2).type = T.AVENUE; at(x, N - 3).type = T.SIDEWALK;
      }

      // Rua principal em ziguezague (2 tiles de largura)
      // Layout desenhado para N=40 e escalado para o N atual
      const K = N / 40, sc = v => Math.round(v * K);
      const way = [[27, 36], [27, 29], [8, 29], [8, 20], [30, 20], [30, 11], [10, 11], [10, 4], [22, 4]]
        .map(([x, y]) => [sc(x), y === 36 ? N - 4 : sc(y)]);
      const stamp = (x, y) => {
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const t = at(x + dx, y + dy);
          if (t && t.type !== T.AVENUE) t.type = T.ROAD;
        }
      };
      for (let k = 0; k < way.length - 1; k++) {
        let [x, y] = way[k];
        const [x2, y2] = way[k + 1];
        const sx = Math.sign(x2 - x), sy = Math.sign(y2 - y);
        stamp(x, y);
        while (x !== x2 || y !== y2) { x += sx; y += sy; stamp(x, y); }
      }
      this.roadPath = way.map(([x, y]) => [x + 1, y + 1]);

      // Escadarias longas ligando trechos da rua
      const stairs = [[18, 22, 28], [20, 13, 19], [14, 31, 36], [34, 22, 36], [16, 6, 10], [25, 13, 19], [4, 30, 36]]
        .map(([x, y0, y1]) => [sc(x), sc(y0), y1 === 36 ? N - 4 : sc(y1)]);
      for (const [x, y0, y1] of stairs) for (let y = y0 - 1; y <= y1 + 1; y++) {
        const t = at(x, y);
        if (t && t.type === T.NONE) t.type = T.STAIR;
      }
      this.crossX = stairs[2][0];

      // Becos: caminhantes aleatórios estreitos (evita abrir blocos 2x2 livres)
      const isPath = t => t && (t.type === T.ROAD || t.type === T.BECO || t.type === T.STAIR || t.type === T.PLAZA);
      const isOpen = t => t && t.type !== T.NONE && t.type !== T.HOUSE && t.type !== T.LOT;
      const wouldBlock = (x, y) => {
        for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
          let c = 0;
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const xx = x + ox + dx, yy = y + oy + dy;
            if (xx === x && yy === y) continue;
            if (isOpen(at(xx, yy))) c++;
          }
          if (c === 3) return true;
        }
        return false;
      };
      const starts = tiles.filter(t => isPath(t) && t.y < N - 3);
      for (let k = 0; k < 150 * K * K; k++) {
        const s = rng.pick(starts);
        let [dx, dy] = rng.pick(DIR4);
        let x = s.x, y = s.y;
        const len = rng.int(3, 12);
        for (let st = 0; st < len; st++) {
          const nx = x + dx, ny = y + dy, t = at(nx, ny);
          if (!t || t.y >= N - 3 || t.type !== T.NONE || wouldBlock(nx, ny)) break;
          t.type = T.BECO; starts.push(t);
          x = nx; y = ny;
          if (rng.chance(0.28)) [dx, dy] = rng.chance(0.5) ? [dy, dx] : [-dy, -dx];
        }
      }

      // Pracinhas 3x3 encostadas em caminhos
      this.plazas = [];
      for (let k = 0; k < 400 && this.plazas.length < Math.round(3 * K * K); k++) {
        const s = rng.pick(starts);
        const ox = s.x + rng.int(-3, 1), oy = s.y + rng.int(-3, 1);
        let ok = oy > 2 && oy + 2 < N - 4, touches = false;
        for (let dy = -1; dy <= 3 && ok; dy++) for (let dx = -1; dx <= 3 && ok; dx++) {
          const t = at(ox + dx, oy + dy);
          const inner = dx >= 0 && dx <= 2 && dy >= 0 && dy <= 2;
          if (inner) { if (!t || t.type !== T.NONE) ok = false; }
          else if (isPath(t)) touches = true;
        }
        if (!ok || !touches) continue;
        const group = [];
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
          const t = at(ox + dx, oy + dy); t.type = T.PLAZA; group.push(t);
        }
        this.plazas.push(group);
      }

      // Alturas dos caminhos
      for (const t of tiles) {
        const h = hill(t.x, t.y);
        if (t.type === T.AVENUE || t.type === T.SIDEWALK) t.level = 0;
        else if (t.type === T.ROAD) t.level = t.y >= N - 3 ? 0 : h;
        else if (t.type === T.BECO || t.type === T.STAIR || t.type === T.PLAZA) t.level = Math.round(h);
        if (t.type === T.BECO && AF.noise(t.x * 0.25, t.y * 0.25, seed + 11) > 0.6) t.ceramic = true;
      }
      // Relaxa degraus: becos/escadarias (inteiros) se ajustam aos vizinhos para nunca passar de 1 degrau
      const stepped = tiles.filter(t => t.type === T.BECO || t.type === T.STAIR || t.type === T.PLAZA);
      for (let pass = 0; pass < 30; pass++) {
        let changed = false;
        for (const t of stepped) {
          for (const [dx, dy] of DIR4) {
            const n = at(t.x + dx, t.y + dy);
            if (!n || !(isPath(n) || n.type === T.SIDEWALK)) continue;
            if (t.level > n.level + 1) { t.level = Math.floor(n.level + 1); changed = true; }
            else if (t.level < n.level - 1) { t.level = Math.ceil(n.level - 1); changed = true; }
          }
        }
        if (!changed) break;
      }

      // Casas: blocos de 2x2 a 3x3 tiles (1 tile = 3 m) sobre fundações irregulares
      const nz = (x, y) => AF.noise(x * 0.35, y * 0.35, seed + 3) * 2 - 1;
      const groundLv = g => Math.max(0, Math.round(hill(g.x, g.y) + nz(g.x, g.y) * 1.6));
      this.houses = [];
      const rect = (x, y, w, h) => {
        const g = [];
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
          const q = at(x + dx, y + dy);
          if (!q || q.type !== T.NONE) return null;
          g.push(q);
        }
        return g;
      };
      const addHouse = group => {
        const house = this.makeHouse(rng, this.houses.length);
        this.houses.push(house);
        let lv = 0;
        for (const g of group) lv = Math.max(lv, groundLv(g));
        for (const g of group) { g.type = T.HOUSE; g.house = house; g.level = lv; house.tiles.push(g); }
        house.base = lv;
      };
      for (const t of tiles) {           // varredura em ordem: empacota bem os blocos
        if (t.type !== T.NONE) continue;
        if (rng.chance(0.04)) { t.type = T.LOT; t.level = groundLv(t); continue; }
        let w = rng.int(2, 3), h = rng.int(2, 3);
        const group = rect(t.x, t.y, w, h) || rect(t.x, t.y, 2, 3) || rect(t.x, t.y, 3, 2) || rect(t.x, t.y, 2, 2);
        if (group) addHouse(group);
      }
      // Sobras de 1 tile viram anexo da casa vizinha (ou quintal)
      for (let pass = 0; pass < 3; pass++) {
        for (const t of tiles) {
          if (t.type !== T.NONE) continue;
          const nb = DIR4.map(([dx, dy]) => at(t.x + dx, t.y + dy)).filter(n => n && n.type === T.HOUSE);
          if (nb.length) {
            const house = rng.pick(nb).house;
            t.type = T.HOUSE; t.house = house; t.level = house.base; house.tiles.push(t);
          } else if (pass === 2) { t.type = T.LOT; t.level = groundLv(t); }
        }
      }

      // Conectividade: todo caminho precisa ser alcançável a partir do spawn
      this.spawnTile = at(this.crossX + 1, N - 3);
      let r = this.reach();
      for (const t of tiles) {
        if (AF.WALK.has(t.type) && !r.seen[t.i]) { t.type = T.LOT; t.ceramic = false; }
      }

      // Rampas da rua: altura por vértice = média dos tiles de rua que compartilham o vértice
      const cv = (cx, cy, fallback) => {
        let s = 0, n = 0;
        for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const q = at(cx + ox, cy + oy);
          if (q && (q.type === T.ROAD || q.type === T.AVENUE)) { s += q.level; n++; }
        }
        return n ? s / n : fallback;
      };
      for (const t of tiles) {
        if (t.type !== T.ROAD) continue;
        t.corners = [cv(t.x, t.y, t.level), cv(t.x + 1, t.y, t.level), cv(t.x + 1, t.y + 1, t.level), cv(t.x, t.y + 1, t.level)];
      }

      // Toda casa precisa de uma porta acessível: se não tiver, abre um beco até ela
      this.ensureAccess(rng, hill);

      this.planAccess(rng);
      this.walkCount = this.reach().count;
      this.decorate(rng);
      this.computeTops();
    }

    // Porta = face externa da casa voltada para um caminho alcançável com desnível <= 2 (degraus na soleira)
    findDoor(house, seen) {
      const sides = [['L', 0, 1], ['R', 1, 0], ['N', 0, -1], ['W', -1, 0]];   // L/R são as faces visíveis
      let best = null;
      for (const [side, dx, dy] of sides) {
        for (const t of house.tiles) {
          const n = this.at(t.x + dx, t.y + dy);
          if (!n || n.house === house || !AF.WALK.has(n.type) || n.block || !seen[n.i]) continue;
          const d = { tile: t, side, nb: n };
          if (side === 'L' || side === 'R') return d;
          if (!best) best = d;
        }
      }
      return best;
    }

    ensureAccess(rng, hill) {
      const N = this.N;
      for (let pass = 0; pass < 4; pass++) {
        const seen = this.reach().seen;
        let changed = false;
        for (const house of this.houses) {
          if (!house.tiles.length) continue;
          house.door = this.findDoor(house, seen);
          if (house.door) continue;
          // BFS atravessando lotes e outras casas até um caminho alcançável (máx. 14 tiles)
          const prev = new Map(), q = [];
          for (const t of house.tiles) for (const [dx, dy] of DIR4) {
            const n = this.at(t.x + dx, t.y + dy);
            if (n && n.house !== house && !prev.has(n.i) && n.y < N - 3) { prev.set(n.i, null); q.push([n, 1]); }
          }
          let goal = null;
          for (let qi = 0; qi < q.length && !goal; qi++) {
            const [t, d] = q[qi];
            if (AF.WALK.has(t.type) && seen[t.i] && !t.block) { goal = t; break; }
            if (d >= 14 || AF.WALK.has(t.type)) continue;
            for (const [dx, dy] of DIR4) {
              const n = this.at(t.x + dx, t.y + dy);
              if (!n || n.house === house || prev.has(n.i) || n.y >= N - 3) continue;
              prev.set(n.i, t); q.push([n, d + 1]);
            }
          }
          if (goal) {
            // escava do caminho até a casa, com degraus de no máximo 1
            let lv = goal.level;
            for (let t = prev.get(goal.i); t; t = prev.get(t.i)) {
              if (t.house) { t.house.tiles = t.house.tiles.filter(g => g !== t); t.house = null; }
              t.type = T.BECO; t.props = [];
              lv = Math.max(lv - 1, Math.min(lv + 1, Math.round(hill(t.x, t.y))));
              t.level = lv;
            }
            changed = true;
          } else {
            for (const t of house.tiles) { t.type = T.LOT; t.house = null; }   // sem acesso possível: vira terreno
            house.tiles = [];
          }
        }
        if (!changed) break;
      }
      const seen = this.reach().seen;
      for (const h of this.houses) {
        if (!h.tiles.length) continue;
        h.door = this.findDoor(h, seen);
        if (!h.door) { for (const t of h.tiles) { t.type = T.LOT; t.house = null; } h.tiles = []; continue; }
        // fundação no nível exato da soleira: a borda do chão em frente à porta (sem degrau nem piso cobrindo)
        const d = h.door, dx = d.nb.x - d.tile.x, dy = d.nb.y - d.tile.y;
        h.base = this.edgeHeight(d.nb, -dx, -dy);
        for (const t of h.tiles) t.level = h.base;
      }
      this.houses = this.houses.filter(h => h.tiles.length);
    }

    // Módulo de acesso vertical, dentro do terreno da casa (não ocupa beco):
    //  - 'unit' (puxadinho): na fileira da frente, 1–2 tiles viram escada e o resto vira terraço na altura
    //    do andar de cima; a unidade de cima recua uma fileira e sua porta abre para o terraço.
    //  - 'laje': casa de 1–2 andares com escada até o teto; a laje inteira vira área caminhável.
    planAccess(rng) {
      const at = (x, y) => this.at(x, y);
      const seen = this.reach().seen;
      for (const h of this.houses) for (const t of h.tiles) { t.floorsHere = h.floors; t.surf = null; t.ramp = null; t.surfBlock = false; }
      for (const h of this.houses) {
        if (h.door) h.door.nb.reserved = true;
        let mode = null, uf = 0;
        if (h.unitFloor) { mode = 'unit'; uf = h.floors >= 3 && rng.chance(0.35) ? 2 : 1; }
        else if (h.roof === 'laje' && h.floors <= 2 && rng.chance(0.4)) { mode = 'laje'; uf = h.floors; }
        h.unitFloor = 0;
        if (!mode) continue;
        const inH = t => !!t && t.house === h;
        const okEntry = n => n && n.house !== h && AF.WALK.has(n.type) && n.type !== T.AVENUE && !n.block && seen[n.i] && Math.abs(n.level - h.base) <= 1;
        const options = [];
        for (const [side, dx, dy] of [['L', 0, 1], ['R', 1, 0]]) {
          const ax = dy ? 1 : 0, ay = dx ? 1 : 0;                 // eixo da fileira da frente
          const key = t => (dy ? t.y : t.x), pos = t => (dy ? t.x : t.y);
          const rows = new Map();
          for (const t of h.tiles) {
            if (inH(at(t.x + dx, t.y + dy))) continue;
            if (!rows.has(key(t))) rows.set(key(t), []);
            rows.get(key(t)).push(t);
          }
          for (const g of rows.values()) {
            g.sort((a, b) => pos(a) - pos(b));
            const runs = [[g[0]]];
            for (let i = 1; i < g.length; i++) {
              if (pos(g[i]) === pos(g[i - 1]) + 1) runs[runs.length - 1].push(g[i]); else runs.push([g[i]]);
            }
            for (const run of runs) {
              if (run.length < uf + 1) continue;
              for (const rev of [false, true]) {
                const seq = rev ? run.slice().reverse() : run;
                const ramps = seq.slice(0, uf), terr = seq.slice(uf), rise = rev ? -1 : 1;
                if (h.door && ramps.includes(h.door.tile)) continue;
                const r0 = ramps[0];
                const entries = [at(r0.x + dx, r0.y + dy), at(r0.x - ax * rise, r0.y - ay * rise)].filter(okEntry);
                if (!entries.length) continue;
                let upper = null;
                if (mode === 'unit') {
                  for (const tt of terr) {
                    const b = at(tt.x - dx, tt.y - dy);
                    if (inH(b) && !seq.includes(b)) { upper = { tile: b, side, floor: uf, front: tt }; break; }
                  }
                  if (!upper) continue;
                }
                options.push({ side, ax, rise, ramps, terr, entries, upper });
              }
            }
          }
        }
        if (!options.length) continue;
        const o = rng.pick(options);
        o.ramps.forEach((t, j) => {
          t.floorsHere = j;
          t.ramp = { axis: o.ax ? 'x' : 'y', dir: o.rise, front: o.side, j };
          t.surf = { kind: 'ramp', axis: t.ramp.axis, dir: o.rise, lo: h.base + j * FL, hi: h.base + (j + 1) * FL };
        });
        const deckH = h.base + uf * FL;
        const decks = mode === 'laje' ? h.tiles.filter(t => !t.ramp) : o.terr;
        for (const t of decks) { t.floorsHere = uf; t.surf = { kind: 'deck', h: deckH }; }
        for (const e of o.entries) e.reserved = true;
        h.access = { mode, uf, side: o.side, top: o.terr[0] };
        if (o.upper) { h.unitFloor = uf; h.upperDoor = o.upper; }
        // laje acessível: a caixa-d'água fica no tile mais longe da escada (e bloqueia só ele)
        if (mode === 'laje' && decks.length >= 3) {
          const top = o.terr[0];
          const far = decks.reduce((a, b) => (Math.abs(b.x - top.x) + Math.abs(b.y - top.y) > Math.abs(a.x - top.x) + Math.abs(a.y - top.y) ? b : a));
          far.surfBlock = true; h.tankTile = far;
        }
      }
      // trechos de laje que ficaram isolados (casas de formato irregular) voltam a ser teto comum
      const reach = this.reach().seen;
      for (const h of this.houses) for (const t of h.tiles) {
        if (t.surf && t.surf.kind === 'deck' && !t.surfBlock && !reach[t.i]) t.surf = null;
      }
    }

    makeHouse(rng, id) {
      const r = rng();
      const floors = r < 0.16 ? 1 : r < 0.48 ? 2 : r < 0.82 ? 3 : 4;
      let color = rng.pick(AF.PALETTE), brick = rng.chance(0.2);
      const styles = [];
      for (let k = 0; k < floors; k++) {
        if (k > 0) {
          if (!brick && rng.chance(0.42)) brick = true;
          if (rng.chance(0.3)) color = rng.pick(AF.PALETTE);
        }
        styles.push({ brick, color });
      }
      const topBrick = styles[floors - 1].brick;
      const roof = topBrick && rng.chance(0.55) ? 'obra' : rng.chance(0.14) ? 'telha' : 'laje';
      // Andar de cima de outra família ("puxadinho"): o planAccess decide se cabe escada + terraço
      const unitFloor = floors >= 2 && rng.chance(0.55) ? 1 : 0;
      return { id, floors, styles, roof, tiles: [], base: 0, shop: null, unitFloor, door: null, upperDoor: null, access: null };
    }

    decorate(rng) {
      const at = (x, y) => this.at(x, y);
      const tiles = this.tiles;

      // Fachadas (por pavimento), comércio, grafites e itens de laje
      this.doorSpots = [];
      for (const t of tiles) {
        if (t.type !== T.HOUSE) continue;
        const h = t.house;
        t.faces = {};
        for (const side of ['L', 'R']) {
          const dx = side === 'R' ? 1 : 0, dy = side === 'L' ? 1 : 0;
          const nb = at(t.x + dx, t.y + dy);
          const same = !!nb && nb.house === h;
          const from = same ? nb.floorsHere : 0;          // pavimentos escondidos atrás do vizinho da mesma casa
          if (from >= t.floorsHere) { t.faces[side] = null; continue; }
          // porta/loja só onde a soleira coincide com o chão da frente (sem degrau, sem piso cobrindo)
          const flush = !same && !!nb && AF.WALK.has(nb.type) && !nb.block && Math.abs(this.edgeHeight(nb, -dx, -dy) - h.base) < 0.15;
          const d = { from, flush, shop: null, door: false, graf: null, win: [], ac: rng.chance(0.22), doorC: rng.pick(DOORS), upper: -1 };
          const mainDoor = !!h.door && h.door.tile === t && h.door.side === side;
          if (h.upperDoor && h.upperDoor.tile === t && h.upperDoor.side === side) d.upper = h.upperDoor.floor;
          if (from === 0 && (flush || mainDoor)) {
            if (!h.shop && nb.type !== T.AVENUE && rng.chance(0.12)) {
              const sh = rng.pick(SHOPS);
              d.shop = { kind: sh.kind, name: rng.pick(sh.names) };
              h.shop = d.shop;
            } else d.door = mainDoor || rng.chance(0.3);
          }
          if (from === 0 && !d.shop && rng.chance(flush ? 0.32 : 0.14)) {
            d.graf = { text: rng.pick(TAGS), color: rng.pick(GRAF), rot: rng.range(-0.18, 0.08), u: rng.range(3, 12), v: rng.range(40, 50) };
          }
          for (let k = 0; k < h.floors; k++) d.win.push(rng.int(0, 5));
          t.faces[side] = d;
          if (d.door || d.shop) nb.reserved = true;       // frente de porta/loja nunca recebe prop
          const off = 0.3, px = side === 'L' ? t.x + 0.5 : t.x + 1 + off, py = side === 'L' ? t.y + 1 + off : t.y + 0.5;
          if (d.door || d.shop) this.doorSpots.push({ x: px, y: py, z: h.base, label: d.shop ? d.shop.name : 'Porta' });
          if (d.upper > 0) this.doorSpots.push({ x: px, y: py, z: h.base + d.upper * FL, label: 'Porta do puxadinho' });
        }
        if (t.ramp) continue;
        const deck = !!t.surf;
        const slots = AF.shuffle([[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]], rng);
        let si = 0;
        const tankHere = h.tankTile ? t === h.tankTile : !deck && t === h.tiles.find(q => !q.surf && !q.ramp);
        if (h.roof !== 'telha' && tankHere) { t.roof.push({ kind: 'tank', u: slots[0][0], v: slots[0][1] }); si = 1; }
        if (deck) {
          // terraço/laje caminhável: só itens baixos que não atrapalham a passagem
          const n = rng.int(0, 2);
          for (let k = 0; k < n; k++) {
            const kind = rng.pick(['varal', 'chair', 'plant', 'plant']);
            t.roof.push({ kind, u: kind === 'varal' ? 0.5 : slots[si][0], v: slots[si][1], c: rng.int(0, 1e6) });
            si++;
          }
        } else if (h.roof === 'laje') {
          const n = rng.int(0, 2);
          for (let k = 0; k < n; k++) {
            const kind = rng.pick(['dish', 'fish', 'varal', 'varal', 'bbq', 'chair', 'plant', 'plant']);
            t.roof.push({ kind, u: kind === 'varal' ? 0.5 : slots[si][0], v: slots[si][1], c: rng.int(0, 1e6) });
            si++;
          }
        } else if (h.roof === 'telha' && rng.chance(0.3)) t.roof.push({ kind: 'dish', u: 0.5, v: 0.5 });
        t.roof.sort((a, b) => (a.u + a.v) - (b.u + b.v));
      }

      // Props que bloqueiam passagem — nunca desconectam o mapa
      const tryBlock = (t, prop) => {
        if (t.reserved) return false;           // frente de porta/escada fica sempre livre
        t.block = true; t.props.push(prop);
        const c = this.reach().count;
        if (c < this.walkCount - 1) { t.block = false; t.props.pop(); return false; }
        this.walkCount = c;
        return true;
      };
      for (const t of tiles) if (t.type === T.SIDEWALK && t.x % 6 === 3) tryBlock(t, { kind: 'poste', u: 0.5, v: 0.3 });

      const paths = AF.shuffle(tiles.filter(t => t.type === T.BECO || t.type === T.PLAZA), rng);
      for (const t of paths) {
        if (t.block) continue;
        const r = rng();
        let p = null;
        if (r < 0.07) p = { kind: 'poste', u: 0.5, v: 0.5 };
        else if (r < 0.1) p = { kind: 'lixeira', u: 0.5, v: 0.5 };
        else if (r < 0.125) p = { kind: 'botijao', u: 0.5, v: 0.5, c: rng.pick(['#8e9aa3', '#2e86c1', '#d35400', '#27ae60']) };
        else if (r < 0.15) p = { kind: 'moto', u: 0.5, v: 0.5, c: rng.pick(AF.VEH_COLORS), d: rng.int(0, 1) };
        else if (r < 0.165) p = { kind: 'barril', u: 0.5, v: 0.5 };
        else if (r < 0.18) p = { kind: 'bananeira', u: 0.5, v: 0.5, s: rng() * 10 };
        if (p) tryBlock(t, p);
        else if (rng.chance(0.07)) t.props.push({ kind: 'sacos', u: rng.range(0.25, 0.75), v: rng.range(0.25, 0.75), nb: true });
      }
      for (const t of tiles) {
        if (t.type === T.STAIR && rng.chance(0.08)) t.props.push({ kind: 'sacos', u: rng.range(0.2, 0.8), v: rng.range(0.2, 0.8), nb: true });
      }

      // Mesas de plástico na frente dos bares
      for (const t of tiles) {
        if (!t.faces) continue;
        for (const side of ['L', 'R']) {
          const d = t.faces[side];
          if (!d || !d.shop || d.shop.kind !== 'bar') continue;
          const nb = side === 'L' ? at(t.x, t.y + 1) : at(t.x + 1, t.y);
          if (!nb) continue;
          // a frente da porta fica livre: as mesas vão para o lado, ao longo da fachada
          const along = side === 'L' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
          const col = rng.pick(['#f1c40f', '#e74c3c']);
          for (const [ax, ay] of along) {
            const m = at(nb.x + ax, nb.y + ay);
            if (m && !m.block && (m.type === T.BECO || m.type === T.PLAZA || m.type === T.SIDEWALK) && tryBlock(m, { kind: 'mesa', u: 0.5, v: 0.5, c: col })) break;
          }
        }
      }

      // Pracinhas: mangueira + mesas
      for (const g of this.plazas) {
        tryBlock(g[4], { kind: 'mangueira', u: 0.5, v: 0.5, s: rng() * 10 });
        for (const t of AF.shuffle(g.slice(), rng).slice(0, 2)) {
          if (!t.block && t.type === T.PLAZA) tryBlock(t, { kind: 'mesa', u: 0.5, v: 0.5, c: rng.pick(['#f1c40f', '#e74c3c']) });
        }
      }

      // Terrenos baldios: mato, bananeiras, mangueiras, entulho
      for (const t of tiles) {
        if (t.type !== T.LOT) continue;
        t.props.push({ kind: 'mato', u: 0.5, v: 0.5, s: rng.int(0, 1e6) });
        const r = rng();
        if (r < 0.4) t.props.push({ kind: 'bananeira', u: rng.range(0.4, 0.6), v: rng.range(0.4, 0.6), s: rng() * 10 });
        else if (r < 0.62) t.props.push({ kind: 'mangueira', u: 0.5, v: 0.5, s: rng() * 10 });
        else if (r < 0.82) t.props.push({ kind: 'entulho', u: 0.5, v: 0.5, s: rng.int(0, 1e6) });
      }

      // Mato nas frestas junto às paredes
      for (const t of tiles) {
        if (!AF.WALK.has(t.type) || t.type === T.AVENUE || t.type === T.ROAD) continue;
        const b1 = at(t.x, t.y - 1), b2 = at(t.x - 1, t.y);
        if (((b1 && b1.type === T.HOUSE) || (b2 && b2.type === T.HOUSE)) && rng.chance(0.45)) t.tufts = rng.int(1, 1e6);
      }

      // Postes e fiação ("gatos")
      const poles = this.poles = [];
      for (const t of tiles) for (const p of t.props) {
        if (p.kind === 'poste') poles.push({ x: t.x + p.u, y: t.y + p.v, z: t.level + 8.6 });
      }
      const wires = this.wires = [];
      const seen = new Set();
      const houseTiles = tiles.filter(t => t.type === T.HOUSE && !t.surf);
      const roofZ = h => h.house.base + h.floorsHere * FL - 0.8;
      poles.forEach((a, i) => {
        const near = poles.map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
          .filter(o => o.j !== i && o.d < 9).sort((p, q) => p.d - q.d).slice(0, 2);
        for (const o of near) {
          const key = Math.min(i, o.j) + '-' + Math.max(i, o.j);
          if (seen.has(key)) continue;
          seen.add(key);
          const b = poles[o.j];
          wires.push({ a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], sag: 0.5 + rng() * 0.6 });
          wires.push({ a: [a.x, a.y, a.z - 0.5], b: [b.x, b.y, b.z - 0.5], sag: 0.7 + rng() * 0.8 });
        }
        const hs = houseTiles.filter(h => Math.hypot(h.x + 0.5 - a.x, h.y + 0.5 - a.y) < 4.5);
        const n = Math.min(hs.length, rng.int(3, 6));
        for (let k = 0; k < n; k++) {
          const h = rng.pick(hs);
          wires.push({ a: [a.x, a.y, a.z - 0.3 - rng() * 0.6], b: [h.x + rng.range(0.2, 0.8), h.y + 1, roofZ(h)], sag: 0.3 + rng() * 0.7 });
        }
      });
      // Fios cruzando becos de casa em casa
      for (let k = 0; k < 45 && houseTiles.length; k++) {
        const a = rng.pick(houseTiles);
        const cands = houseTiles.filter(b => b !== a && b.house !== a.house && Math.abs(b.x - a.x) + Math.abs(b.y - a.y) >= 2 && Math.abs(b.x - a.x) + Math.abs(b.y - a.y) <= 4);
        if (!cands.length) continue;
        const b = rng.pick(cands);
        wires.push({ a: [a.x + 0.5, a.y + 1, roofZ(a)], b: [b.x + 0.5, b.y + 1, roofZ(b)], sag: 0.2 + rng() * 0.5 });
      }
    }

    computeTops() {
      for (const t of this.tiles) {
        let top = t.corners ? Math.max(...t.corners) : t.level;
        t.structTop = 0; t.tall = false;
        if (t.house) {
          const h = t.house;
          if (t.ramp) t.structTop = t.surf.hi + 1.6;
          else if (t.surf) t.structTop = t.surf.h + (t.roof.length ? 1.6 : 0.8);
          else t.structTop = h.base + t.floorsHere * FL + (t.roof.length ? 1.6 : 0.6) + (h.roof === 'obra' ? 1.6 : 0);
          t.tall = true; top = t.structTop;
        }
        for (const p of t.props) {
          if (p.kind === 'mangueira' || p.kind === 'bananeira') {
            t.tall = true;
            t.structTop = Math.max(t.structTop, t.level + (p.kind === 'mangueira' ? 5 : 4.4));
            top = Math.max(top, t.structTop);
          }
          if (p.kind === 'poste') top = Math.max(top, t.level + 10);
        }
        t.top = top + 1;
      }
    }

    // ---------------------------------------------------------------- consultas
    reach() {
      const N = this.N, seen = new Uint8Array(N * N), s = this.spawnTile;
      if (!this.isWalk(s)) return { seen, count: 0 };
      const q = [s]; seen[s.i] = 1;
      for (let qi = 0; qi < q.length; qi++) {
        const t = q[qi];
        for (const [dx, dy] of DIR4) {
          const n = this.at(t.x + dx, t.y + dy);
          if (n && !seen[n.i] && this.canStep(t, n)) { seen[n.i] = 1; q.push(n); }
        }
      }
      return { seen, count: q.length };
    }

    // A* em 8 direções, sem cortar quinas, respeitando degraus
    findPath(start, goal) {
      if (!start || !goal || !this.isWalk(goal)) return null;
      const N = this.N, n2 = N * N;
      const g = new Float32Array(n2).fill(Infinity);
      const came = new Int32Array(n2).fill(-1);
      const closed = new Uint8Array(n2);
      const heur = t => {
        const dx = Math.abs(t.x - goal.x), dy = Math.abs(t.y - goal.y);
        return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
      };
      const heap = new MinHeap();
      g[start.i] = 0; heap.push(start.i, heur(start));
      while (heap.size) {
        const ci = heap.pop();
        if (closed[ci]) continue;
        closed[ci] = 1;
        if (ci === goal.i) break;
        const cur = this.tiles[ci];
        for (const [dx, dy] of DIR8) {
          const n = this.at(cur.x + dx, cur.y + dy);
          if (!n || closed[n.i] || !this.canStep(cur, n)) continue;
          if (dx && dy) {
            const a = this.at(cur.x + dx, cur.y), b = this.at(cur.x, cur.y + dy);
            if (!this.canStep(cur, a) || !this.canStep(cur, b) || !this.canStep(a, n) || !this.canStep(b, n)) continue;
          }
          const ng = g[ci] + (dx && dy ? 1.4142 : 1) + Math.abs(n.level - cur.level) * 0.3;
          if (ng < g[n.i]) { g[n.i] = ng; came[n.i] = ci; heap.push(n.i, ng + heur(n)); }
        }
      }
      if (!closed[goal.i]) return null;
      const path = [];
      for (let i = goal.i; i !== start.i && i !== -1; i = came[i]) path.push(this.tiles[i]);
      return path.reverse();
    }

    // Tile caminhável sob um ponto da tela (em coordenadas de mundo), da frente para trás
    pickTile(wx, wy) {
      const N = this.N, HW = CFG.HW, HH = CFG.HH, UZ = CFG.UZ;
      for (let s = 2 * N - 2; s >= 0; s--) {
        for (let x = Math.min(N - 1, s); x >= Math.max(0, s - N + 1); x--) {
          const y = s - x, t = this.tiles[y * N + x];
          if (!AF.WALK.has(t.type) && !t.surf) continue;
          const c = this.surfCorners(t), lv = (c[0] + c[1] + c[2] + c[3]) / 4;
          const cx = (x - y) * HW, cy = (x + y + 1) * HH - lv * UZ;
          if (Math.abs(wx - cx) / HW + Math.abs(wy - cy) / HH <= 1) return t;
        }
      }
      return null;
    }

    nearestWalkable(t, from) {
      if (this.isWalk(t)) return t;
      let best = null, bd = Infinity;
      for (const [dx, dy] of DIR8) {
        const n = this.at(t.x + dx, t.y + dy);
        if (!this.isWalk(n)) continue;
        const d = Math.hypot(n.x - from.x, n.y - from.y);
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    }
  }

  AF.World = World;
})(window.AF = window.AF || {});

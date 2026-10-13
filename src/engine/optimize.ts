/** Derivative-free optimizers: Nelder-Mead (local) and differential evolution (global). */

export function nelderMead(f: (x: number[]) => number, x0: number[], step: number[], maxIter = 2000, tol = 1e-10): { x: number[]; f: number; iterations: number } {
  const n = x0.length;
  let simplex: number[][] = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] += step[i];
    simplex.push(p);
  }
  let fs = simplex.map(f);
  let it = 0;
  for (; it < maxIter; it++) {
    const order = fs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
    simplex = order.map((i) => simplex[i]);
    fs = order.map((i) => fs[i]);
    if (Math.abs(fs[n] - fs[0]) <= tol * (Math.abs(fs[0]) + tol) && it > 5 * n) break;
    const c = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
    const along = (k: number) => c.map((cj, j) => cj + k * (simplex[n][j] - cj));
    const xr = along(-1), fr = f(xr);
    if (fr < fs[0]) {
      const xe = along(-2), fe = f(xe);
      if (fe < fr) { simplex[n] = xe; fs[n] = fe; } else { simplex[n] = xr; fs[n] = fr; }
    } else if (fr < fs[n - 1]) {
      simplex[n] = xr; fs[n] = fr;
    } else {
      const xc = fr < fs[n] ? along(-0.5) : along(0.5);
      const fc = f(xc);
      if (fc < Math.min(fr, fs[n])) { simplex[n] = xc; fs[n] = fc; } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
          fs[i] = f(simplex[i]);
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i <= n; i++) if (fs[i] < fs[best]) best = i;
  return { x: simplex[best], f: fs[best], iterations: it };
}

/** Deterministic pseudo-random generator (mulberry32). The same seed gives the same search. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DeOptions { population?: number; generations?: number; F?: number; CR?: number; seed?: number; onProgress?: (gen: number, best: number) => boolean | void; initial?: number[][] }

/** Differential evolution (rand/1/bin with dither). */
export function differentialEvolution(f: (x: number[]) => number, lower: number[], upper: number[], opt: DeOptions = {}): { x: number[]; f: number } {
  const n = lower.length;
  const NP = opt.population ?? Math.max(20, 10 * n);
  const G = opt.generations ?? 200;
  const CR = opt.CR ?? 0.9;
  const rand = rng(opt.seed ?? 1);
  const pop: number[][] = [];
  for (let i = 0; i < NP; i++) {
    const init = opt.initial?.[i];
    pop.push(init ? init.slice() : lower.map((lo, j) => lo + rand() * (upper[j] - lo)));
  }
  const cost = pop.map(f);
  let best = 0;
  for (let i = 1; i < NP; i++) if (cost[i] < cost[best]) best = i;
  for (let g = 0; g < G; g++) {
    const F = opt.F ?? 0.5 + 0.4 * rand();
    for (let i = 0; i < NP; i++) {
      let a: number, b: number, c: number;
      do a = Math.floor(rand() * NP); while (a === i);
      do b = Math.floor(rand() * NP); while (b === i || b === a);
      do c = Math.floor(rand() * NP); while (c === i || c === a || c === b);
      const jr = Math.floor(rand() * n);
      const trial = pop[i].slice();
      for (let j = 0; j < n; j++) {
        if (rand() < CR || j === jr) {
          let v = pop[a][j] + F * (pop[b][j] - pop[c][j]);
          if (v < lower[j]) v = lower[j] + rand() * (pop[i][j] - lower[j]);
          if (v > upper[j]) v = upper[j] - rand() * (upper[j] - pop[i][j]);
          trial[j] = v;
        }
      }
      const ft = f(trial);
      if (ft <= cost[i]) {
        pop[i] = trial; cost[i] = ft;
        if (ft < cost[best]) best = i;
      }
    }
    if (opt.onProgress && opt.onProgress(g, cost[best]) === true) break;
  }
  return { x: pop[best], f: cost[best] };
}

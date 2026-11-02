/* Ready-made labs, experiments and papers. Scientists can import these as a starting point and edit them freely. */
window.RPLabsStarter = (() => {
  const labs = [
    { id: "physics", name: "Physics Lab", emoji: "⚛️", color: "#60a5fa", description: "Motion, waves, orbits and the laws that govern them." },
    { id: "chemistry", name: "Chemistry Lab", emoji: "⚗️", color: "#34d399", description: "Reactions, acids and bases, gases and kinetics." },
    { id: "biology", name: "Biology Lab", emoji: "🧬", color: "#f472b6", description: "Populations, genetics, epidemics and enzymes." },
    { id: "earth", name: "Earth & Space Lab", emoji: "🌍", color: "#fbbf24", description: "Planets, climate and the physics of our world." }
  ];
  const P = (key, label, unit, min, max, step, def) => ({ key, label, unit, min, max, step, default: def });
  const experiments = [
    { id: "exp-projectile", lab: "physics", title: "Projectile motion with air drag", difficulty: "intro", minutes: 5,
      summary: "Launch a ball and see how air resistance changes its flight.",
      hypothesis: "Air drag shortens the range and lowers the best launch angle below 45°.",
      theory: "## Model\nWithout drag a projectile follows a parabola and travels farthest at **45°**. With quadratic drag the force opposes velocity and grows with speed squared, so the ball loses horizontal speed throughout its flight.\n\n- Acceleration: a = −g − (k/m)|v|v\n- Try mass 0.1 kg vs 5 kg at the same angle.",
      safety: "", goal: { metric: "range", op: ">=", value: 120, value2: 0, text: "Throw the ball at least 120 m." },
      params: [P("v0", "Launch speed", "m/s", 5, 80, 1, 40), P("angle", "Launch angle", "°", 5, 85, 1, 45), P("mass", "Mass", "kg", 0.05, 5, 0.05, 0.5), P("drag", "Drag coefficient k", "kg/m", 0, 0.1, 0.002, 0.01)],
      script: `const th = params.angle * Math.PI / 180, g = Lab.constants.g;
const f = (t, s) => { const v = Math.hypot(s[2], s[3]); const a = params.drag / params.mass * v; return [s[2], s[3], -a * s[2], -g - a * s[3]]; };
const sim = Lab.rk4(f, [0, 0, params.v0 * Math.cos(th), params.v0 * Math.sin(th)], 0, 30, 0.01, 2);
let end = sim.y.findIndex((s, i) => i > 0 && s[1] < 0); if (end < 0) end = sim.y.length - 1;
const xs = sim.y.slice(0, end + 1).map(s => s[0]), ys = sim.y.slice(0, end + 1).map(s => Math.max(0, s[1]));
const ideal = Lab.linspace(0, params.v0 * params.v0 * Math.sin(2 * th) / g, 60).map(x => x);
const ideY = ideal.map(x => x * Math.tan(th) - g * x * x / (2 * params.v0 * params.v0 * Math.cos(th) * Math.cos(th)));
return {
  charts: [{ title: "Trajectory", xLabel: "Distance (m)", yLabel: "Height (m)", series: [{ name: "With drag", x: xs, y: ys }, { name: "No drag (ideal)", x: ideal, y: ideY, style: "points" }] }],
  metrics: { range: { label: "Range", value: Lab.round(xs[xs.length - 1], 2), unit: "m" }, height: { label: "Maximum height", value: Lab.round(Lab.max(ys), 2), unit: "m" }, time: { label: "Flight time", value: Lab.round(sim.t[end], 2), unit: "s" }, ideal: { label: "Ideal range (no drag)", value: Lab.round(ideal[ideal.length - 1], 2), unit: "m" } }
};` },
    { id: "exp-pendulum", lab: "physics", title: "The not-so-simple pendulum", difficulty: "intermediate", minutes: 6,
      summary: "Large swings break the textbook period formula. By how much?",
      hypothesis: "For large amplitudes the period is longer than 2π√(L/g).",
      theory: "## Small-angle approximation\nThe textbook period T = 2π√(L/g) is only exact as the amplitude approaches zero. The true equation is θ'' = −(g/L) sin θ − c θ'.\n\nCompare the simulated period with the formula as you raise the starting angle.",
      safety: "", goal: { metric: "error", op: ">=", value: 10, value2: 0, text: "Find an amplitude where the textbook formula is off by 10% or more." },
      params: [P("L", "String length", "m", 0.2, 5, 0.05, 1), P("theta0", "Start angle", "°", 2, 175, 1, 30), P("damp", "Damping", "1/s", 0, 1, 0.01, 0)],
      script: `const g = Lab.constants.g, th0 = params.theta0 * Math.PI / 180;
const f = (t, s) => [s[1], -(g / params.L) * Math.sin(s[0]) - params.damp * s[1]];
const T0 = 2 * Math.PI * Math.sqrt(params.L / g), tEnd = Math.min(T0 * 4, 60);
const sim = Lab.rk4(f, [th0, 0], 0, tEnd, 0.002, 5);
const th = sim.y.map(s => s[0] * 180 / Math.PI);
const crossings = []; for (let i = 1; i < sim.t.length; i++) if (sim.y[i - 1][0] > 0 && sim.y[i][0] <= 0) crossings.push(sim.t[i - 1] + (sim.t[i] - sim.t[i - 1]) * sim.y[i - 1][0] / (sim.y[i - 1][0] - sim.y[i][0]));
const T = crossings.length > 1 ? crossings[1] - crossings[0] : NaN;
return {
  charts: [{ title: "Angle over time", xLabel: "Time (s)", yLabel: "Angle (°)", series: [{ name: "θ(t)", x: sim.t, y: th }] }],
  metrics: { period: { label: "Simulated period", value: Lab.round(T, 4), unit: "s" }, textbook: { label: "Textbook period 2π√(L/g)", value: Lab.round(T0, 4), unit: "s" }, error: { label: "Textbook formula error", value: Lab.round(Math.abs(T0 - T) / T * 100, 2), unit: "%" } }
};` },
    { id: "exp-decay", lab: "physics", title: "Radioactive decay and half-life", difficulty: "intro", minutes: 4,
      summary: "Watch random decays follow a smooth exponential curve.",
      hypothesis: "A fitted line through ln(N) recovers the true half-life, better with more atoms.",
      theory: "## Decay law\nEach nucleus decays independently, so on average N(t) = N₀·2^(−t/T½). Individual decays are random, so small samples are noisy.\n\nThe experiment fits ln(N) against time. The slope is −ln 2 / T½.",
      safety: "", goal: { metric: "fitError", op: "<=", value: 2, value2: 0, text: "Measure the half-life to within 2%." },
      params: [P("N0", "Starting atoms", "", 100, 20000, 100, 2000), P("half", "True half-life", "s", 1, 100, 1, 20), P("seed", "Random seed", "", 1, 9999, 1, 7)],
      script: `const r = Lab.rng(params.seed), p = 1 - Math.pow(0.5, 1 / params.half);
let n = Math.round(params.N0); const t = [0], N = [n];
for (let s = 1; s <= params.half * 5; s++) { n -= Lab.binomial(r, n, p); t.push(s); N.push(n); }
const ideal = t.map(s => params.N0 * Math.pow(0.5, s / params.half));
const keep = N.map((v, i) => i).filter(i => N[i] > 5);
const fit = Lab.linreg(keep.map(i => t[i]), keep.map(i => Math.log(N[i])));
const half = -Math.LN2 / fit.slope;
return {
  charts: [{ title: "Atoms remaining", xLabel: "Time (s)", yLabel: "Atoms", series: [{ name: "Measured", x: t, y: N, style: "points" }, { name: "Theory", x: t, y: ideal }] }],
  metrics: { fitHalf: { label: "Measured half-life", value: Lab.round(half, 3), unit: "s" }, fitError: { label: "Error vs true value", value: Lab.round(Math.abs(half - params.half) / params.half * 100, 2), unit: "%" }, r2: { label: "Fit quality R²", value: Lab.round(fit.r2, 4), unit: "" } }
};` },
    { id: "exp-titration", lab: "chemistry", title: "Acid–base titration curve", difficulty: "intermediate", minutes: 6,
      summary: "Add base drop by drop and find the equivalence point.",
      hypothesis: "A weak acid has a lower starting pH and an equivalence point above pH 7.",
      theory: "## Titration\nA base of known concentration is added to an acid. At the **equivalence point** moles of base equal moles of acid.\n\n- Strong acid + strong base: equivalence at pH 7.\n- Weak acid + strong base: equivalence above 7, with a buffer region near pH = pKa.\n\nSet pKa to 0 to model a strong acid.",
      safety: "Real titrations use eye protection and gloves.", goal: { metric: "eqPH", op: "between", value: 8.5, value2: 9.5, text: "Set up a titration whose equivalence point is between pH 8.5 and 9.5." },
      params: [P("ca", "Acid concentration", "mol/L", 0.01, 1, 0.01, 0.1), P("va", "Acid volume", "mL", 10, 100, 1, 25), P("cb", "Base concentration", "mol/L", 0.01, 1, 0.01, 0.1), P("pka", "Acid pKa (0 = strong)", "", 0, 10, 0.1, 4.76)],
      script: `const Kw = 1e-14, Ka = params.pka > 0 ? Math.pow(10, -params.pka) : 0;
const ca = params.ca, va = params.va / 1000, cb = params.cb;
const eqV = ca * va / cb * 1000, maxV = eqV * 2, vs = Lab.linspace(0, maxV, 240), pH = [];
const charge = (h, vb) => { const Vt = va + vb, Na = cb * vb / Vt, A = Ka > 0 ? (ca * va / Vt) * Ka / (Ka + h) : ca * va / Vt; return h + Na - Kw / h - A; };
const solve = v => { const vb = v / 1000; let lo = 1e-14, hi = 1; for (let i = 0; i < 200; i++) { const mid = Math.sqrt(lo * hi); if (charge(mid, vb) > 0) hi = mid; else lo = mid; } return -Math.log10(Math.sqrt(lo * hi)); };
vs.forEach(v => pH.push(solve(v))); const eqPH = solve(eqV);
return {
  charts: [{ title: "Titration curve", xLabel: "Base added (mL)", yLabel: "pH", series: [{ name: "pH", x: vs, y: pH }] }],
  metrics: { eqV: { label: "Equivalence volume", value: Lab.round(eqV, 2), unit: "mL" }, startPH: { label: "Starting pH", value: Lab.round(pH[0], 2), unit: "" }, eqPH: { label: "pH at equivalence", value: Lab.round(eqPH, 2), unit: "" } }
};` },
    { id: "exp-kinetics", lab: "chemistry", title: "Consecutive reactions A → B → C", difficulty: "intermediate", minutes: 5,
      summary: "Watch an intermediate rise and fall, and time its peak.",
      hypothesis: "The intermediate B peaks at t = ln(k1/k2) / (k1 − k2).",
      theory: "## Rate equations\nd[A]/dt = −k₁[A]\nd[B]/dt = k₁[A] − k₂[B]\nd[C]/dt = k₂[B]\n\nThe intermediate B accumulates when k₁ > k₂ and its peak time is found by setting d[B]/dt = 0. The simulation compares with that formula.",
      safety: "", goal: null,
      params: [P("k1", "Rate constant k₁", "1/s", 0.01, 2, 0.01, 0.5), P("k2", "Rate constant k₂", "1/s", 0.01, 2, 0.01, 0.2), P("A0", "Initial [A]", "mol/L", 0.1, 5, 0.1, 1)],
      script: `const f = (t, s) => [-params.k1 * s[0], params.k1 * s[0] - params.k2 * s[1], params.k2 * s[1]];
const tEnd = 6 / Math.min(params.k1, params.k2), sim = Lab.rk4(f, [params.A0, 0, 0], 0, tEnd, tEnd / 1500, 3);
const A = Lab.column(sim.y, 0), B = Lab.column(sim.y, 1), C = Lab.column(sim.y, 2), bi = B.indexOf(Lab.max(B));
const k1 = params.k1, k2 = params.k2, theory = Math.abs(k1 - k2) < 1e-9 ? 1 / k1 : Math.log(k1 / k2) / (k1 - k2);
return {
  charts: [{ title: "Concentrations over time", xLabel: "Time (s)", yLabel: "Concentration (mol/L)", series: [{ name: "A", x: sim.t, y: A }, { name: "B (intermediate)", x: sim.t, y: B }, { name: "C (product)", x: sim.t, y: C }] }],
  metrics: { peakT: { label: "Peak time of B", value: Lab.round(sim.t[bi], 3), unit: "s" }, theory: { label: "Theory ln(k₁/k₂)/(k₁−k₂)", value: Lab.round(theory, 3), unit: "s" }, peakB: { label: "Maximum [B]", value: Lab.round(B[bi], 3), unit: "mol/L" } }
};` },
    { id: "exp-gas", lab: "chemistry", title: "Gas laws: pressure vs volume", difficulty: "intro", minutes: 3,
      summary: "Squeeze an ideal gas at different temperatures.",
      hypothesis: "Pressure and volume are inversely proportional, and a hotter gas has higher pressure.",
      theory: "## Ideal gas law\nPV = nRT. At fixed temperature (**Boyle's law**) pressure falls as volume rises. Each curve below is an *isotherm*.",
      safety: "", goal: null,
      params: [P("n", "Amount of gas", "mol", 0.1, 5, 0.1, 1), P("T", "Base temperature", "K", 150, 600, 10, 300), P("vmax", "Largest volume", "L", 5, 100, 1, 50)],
      script: `const R = Lab.constants.R, vs = Lab.linspace(Math.max(1, params.vmax / 20), params.vmax, 80), series = [];
[0.6, 1, 1.5].forEach(k => { const T = params.T * k; series.push({ name: Math.round(T) + " K", x: vs, y: vs.map(v => params.n * R * T / (v / 1000) / 1000) }); });
const p1 = params.n * R * params.T / (params.vmax / 1000) / 1000;
return { charts: [{ title: "Isotherms", xLabel: "Volume (L)", yLabel: "Pressure (kPa)", series }], metrics: { atMax: { label: "Pressure at largest volume", value: Lab.round(p1, 2), unit: "kPa" }, product: { label: "P × V (constant per curve)", value: Lab.round(p1 * params.vmax, 1), unit: "kPa·L" } } };` },
    { id: "exp-sir", lab: "biology", title: "Epidemic model (SIR)", difficulty: "intermediate", minutes: 5,
      summary: "Explore how contact rate and recovery shape an outbreak.",
      hypothesis: "An outbreak only grows when R₀ = β/γ is above 1, and vaccination below the herd-immunity threshold cannot stop it.",
      theory: "## SIR model\nPeople are Susceptible, Infected or Recovered.\n\n- dS/dt = −β S I / N\n- dI/dt = β S I / N − γ I\n- dR/dt = γ I\n\nThe **basic reproduction number** is R₀ = β/γ. Herd immunity needs a vaccinated fraction of 1 − 1/R₀.",
      safety: "", goal: { metric: "peakPct", op: "<=", value: 5, value2: 0, text: "Keep the peak of the outbreak under 5% of the population." },
      params: [P("beta", "Contact rate β", "1/day", 0.05, 1.5, 0.01, 0.5), P("gamma", "Recovery rate γ", "1/day", 0.05, 1, 0.01, 0.2), P("vax", "Vaccinated", "%", 0, 95, 1, 0), P("days", "Days simulated", "days", 30, 365, 5, 160)],
      script: `const N = 10000, V = N * params.vax / 100, I0 = 10, S0 = Math.max(0, N - V - I0);
const f = (t, s) => [-params.beta * s[0] * s[1] / N, params.beta * s[0] * s[1] / N - params.gamma * s[1], params.gamma * s[1]];
const sim = Lab.rk4(f, [S0, I0, V], 0, params.days, 0.1, 5), S = Lab.column(sim.y, 0), I = Lab.column(sim.y, 1), Rr = Lab.column(sim.y, 2), pk = I.indexOf(Lab.max(I));
const R0 = params.beta / params.gamma;
return {
  charts: [{ title: "People over time", xLabel: "Day", yLabel: "People", series: [{ name: "Susceptible", x: sim.t, y: S }, { name: "Infected", x: sim.t, y: I }, { name: "Recovered / immune", x: sim.t, y: Rr }] }],
  metrics: { r0: { label: "Basic reproduction number R₀", value: Lab.round(R0, 2), unit: "" }, peak: { label: "Peak infected", value: Math.round(I[pk]), unit: "people" }, peakPct: { label: "Peak as share of population", value: Lab.round(I[pk] / N * 100, 2), unit: "%" }, peakDay: { label: "Day of the peak", value: Lab.round(sim.t[pk], 1), unit: "" }, herd: { label: "Herd-immunity threshold", value: R0 > 1 ? Lab.round((1 - 1 / R0) * 100, 1) : 0, unit: "% vaccinated" } }
};` },
    { id: "exp-predator", lab: "biology", title: "Predators and prey", difficulty: "advanced", minutes: 6,
      summary: "Lotka–Volterra cycles of rabbits and foxes.",
      hypothesis: "Predator and prey populations oscillate with the predators lagging behind the prey.",
      theory: "## Lotka–Volterra equations\n- dx/dt = αx − βxy (prey)\n- dy/dt = δxy − γy (predators)\n\nThe populations cycle around the equilibrium (γ/δ, α/β).",
      safety: "", goal: null,
      params: [P("alpha", "Prey growth α", "", 0.1, 2, 0.05, 1), P("beta", "Predation β", "", 0.01, 0.5, 0.01, 0.1), P("delta", "Predator gain δ", "", 0.01, 0.5, 0.01, 0.075), P("gamma", "Predator death γ", "", 0.1, 2, 0.05, 1.5), P("x0", "Starting prey", "", 1, 50, 1, 10), P("y0", "Starting predators", "", 1, 50, 1, 5)],
      script: `const f = (t, s) => [params.alpha * s[0] - params.beta * s[0] * s[1], params.delta * s[0] * s[1] - params.gamma * s[1]];
const sim = Lab.rk4(f, [params.x0, params.y0], 0, 50, 0.01, 10), X = Lab.column(sim.y, 0), Y = Lab.column(sim.y, 1);
return {
  charts: [{ title: "Populations over time", xLabel: "Time", yLabel: "Population", series: [{ name: "Prey", x: sim.t, y: X }, { name: "Predators", x: sim.t, y: Y }] }, { title: "Phase portrait", xLabel: "Prey", yLabel: "Predators", series: [{ name: "Orbit", x: X, y: Y }] }],
  metrics: { eqX: { label: "Equilibrium prey", value: Lab.round(params.gamma / params.delta, 2), unit: "" }, eqY: { label: "Equilibrium predators", value: Lab.round(params.alpha / params.beta, 2), unit: "" }, maxX: { label: "Peak prey", value: Lab.round(Lab.max(X), 1), unit: "" } }
};` },
    { id: "exp-drift", lab: "biology", title: "Genetic drift", difficulty: "intermediate", minutes: 4,
      summary: "Small populations lose alleles by chance alone.",
      hypothesis: "Allele frequency wanders randomly and drifts to 0 or 1 faster in small populations.",
      theory: "## Wright–Fisher drift\nEach generation the next gene pool is a random sample of the current one. With population size N the expected time to fixation grows with N.\n\nRun it with N = 20 and with N = 500.",
      safety: "", goal: { metric: "fixed", op: ">=", value: 8, value2: 0, text: "Make at least 8 of the 10 populations lose or fix the allele." },
      params: [P("N", "Population size", "", 10, 1000, 10, 50), P("p0", "Starting allele frequency", "", 0.1, 0.9, 0.05, 0.5), P("gens", "Generations", "", 20, 300, 10, 100), P("seed", "Random seed", "", 1, 9999, 1, 11)],
      script: `const r = Lab.rng(params.seed), reps = 10, series = []; let fixed = 0;
for (let k = 0; k < reps; k++) { let p = params.p0; const x = [0], y = [p]; for (let g = 1; g <= params.gens; g++) { p = Lab.binomial(r, params.N * 2, p) / (params.N * 2); x.push(g); y.push(p); if (p === 0 || p === 1) { for (let h = g + 1; h <= params.gens; h++) { x.push(h); y.push(p); } break; } } if (p === 0 || p === 1) fixed++; series.push({ name: "Pop " + (k + 1), x, y }); }
return { charts: [{ title: "Allele frequency in " + reps + " populations", xLabel: "Generation", yLabel: "Allele frequency", series }], metrics: { fixed: { label: "Populations that lost or fixed the allele", value: fixed, unit: "of " + reps } } };` },
    { id: "exp-enzyme", lab: "biology", title: "Enzyme kinetics", difficulty: "advanced", minutes: 5,
      summary: "Measure Km and Vmax from noisy data with a Lineweaver–Burk plot.",
      hypothesis: "A competitive inhibitor raises the apparent Km but leaves Vmax unchanged.",
      theory: "## Michaelis–Menten\nv = Vmax·[S] / (Km + [S]). A competitive inhibitor [I] raises Km to Km(1 + [I]/Ki).\n\nPlot 1/v against 1/[S]. The line has slope Km/Vmax and intercept 1/Vmax.",
      safety: "", goal: null,
      params: [P("vmax", "Vmax", "µM/s", 1, 100, 1, 50), P("km", "Km", "µM", 1, 200, 1, 40), P("inh", "Inhibitor [I]", "µM", 0, 200, 5, 0), P("ki", "Inhibitor Ki", "µM", 5, 200, 5, 50), P("noise", "Measurement noise", "%", 0, 15, 1, 3), P("seed", "Random seed", "", 1, 9999, 1, 5)],
      script: `const r = Lab.rng(params.seed), S = [5, 10, 20, 40, 80, 160, 320], kapp = params.km * (1 + params.inh / params.ki);
const v = S.map(s => params.vmax * s / (kapp + s) * (1 + Lab.normal(r, 0, params.noise / 100)));
const inv = Lab.linreg(S.map(s => 1 / s), v.map(x => 1 / x)), vmaxFit = 1 / inv.intercept, kmFit = inv.slope * vmaxFit;
const curve = Lab.linspace(1, 330, 120);
return {
  charts: [{ title: "Reaction rate", xLabel: "Substrate (µM)", yLabel: "Rate (µM/s)", series: [{ name: "Measured", x: S, y: v, style: "points" }, { name: "True curve", x: curve, y: curve.map(s => params.vmax * s / (kapp + s)) }] },
    { title: "Lineweaver–Burk", xLabel: "1/[S]", yLabel: "1/v", series: [{ name: "Data", x: S.map(s => 1 / s), y: v.map(x => 1 / x), style: "points" }, { name: "Fit", x: [0, 1 / 5], y: [inv.intercept, inv.intercept + inv.slope / 5] }] }],
  metrics: { vmaxFit: { label: "Fitted Vmax", value: Lab.round(vmaxFit, 2), unit: "µM/s" }, kmFit: { label: "Fitted apparent Km", value: Lab.round(kmFit, 2), unit: "µM" }, r2: { label: "Fit quality R²", value: Lab.round(inv.r2, 4), unit: "" } }
};` },
    { id: "exp-orbit", lab: "earth", title: "Planetary orbits", difficulty: "advanced", minutes: 6,
      summary: "Launch a planet around a star and test Kepler's third law.",
      hypothesis: "The orbital period squared is proportional to the semi-major axis cubed.",
      theory: "## Two-body orbit\nA planet at distance r feels gravitational acceleration GM/r². Starting at distance r₀ with a sideways speed v you can get a circle, an ellipse, or an escape.\n\n**Kepler's third law:** T² ∝ a³. The simulation reports both sides in astronomical units and years (T² / a³ ≈ 1 for the Sun).",
      safety: "", goal: { metric: "ecc", op: "between", value: 0.5, value2: 0.7, text: "Create a stable orbit with eccentricity between 0.5 and 0.7." },
      params: [P("r0", "Starting distance", "AU", 0.3, 5, 0.05, 1), P("vf", "Speed as a share of circular speed", "", 0.3, 1.45, 0.01, 0.8), P("years", "Years simulated", "yr", 1, 30, 1, 3)],
      script: `const GM = 4 * Math.PI * Math.PI, vc = Math.sqrt(GM / params.r0), v0 = vc * params.vf;
const f = (t, s) => { const r3 = Math.pow(s[0] * s[0] + s[1] * s[1], 1.5); return [s[2], s[3], -GM * s[0] / r3, -GM * s[1] / r3]; };
const sim = Lab.rk4(f, [params.r0, 0, 0, v0], 0, params.years, 0.0005, 8), X = Lab.column(sim.y, 0), Y = Lab.column(sim.y, 1);
const E = v0 * v0 / 2 - GM / params.r0, escapes = E >= 0;
let a = NaN, ecc = NaN, T = NaN; if (!escapes) { a = -GM / (2 * E); const h = params.r0 * v0; ecc = Math.sqrt(Math.max(0, 1 + 2 * E * h * h / (GM * GM))); T = Math.sqrt(a * a * a); }
return {
  charts: [{ title: "Orbit (Sun at the origin)", xLabel: "x (AU)", yLabel: "y (AU)", series: [{ name: "Planet", x: X, y: Y }, { name: "Sun", x: [0], y: [0], style: "points" }] }],
  metrics: { status: { label: "Outcome", value: escapes ? "Escapes the Sun" : "Bound orbit" }, a: { label: "Semi-major axis", value: escapes ? null : Lab.round(a, 3), unit: "AU" }, ecc: { label: "Eccentricity", value: escapes ? null : Lab.round(ecc, 3), unit: "" }, T: { label: "Orbital period", value: escapes ? null : Lab.round(T, 3), unit: "yr" }, kepler: { label: "T² / a³", value: escapes ? null : Lab.round(T * T / (a * a * a), 4), unit: "" } }
};` },
    { id: "exp-climate", lab: "earth", title: "Greenhouse planet energy balance", difficulty: "intro", minutes: 4,
      summary: "How much does an atmosphere warm a planet?",
      hypothesis: "A stronger greenhouse effect raises equilibrium temperature even when sunlight is unchanged.",
      theory: "## Zero-dimensional model\nAbsorbed sunlight = S(1 − α)/4. A planet radiates σT⁴ and an atmosphere that absorbs a fraction ε of that radiation sends half back down, so the surface temperature solves S(1−α)/4 = σT⁴(1 − ε/2).\n\nThis is a toy model, but it shows why greenhouse gases and reflectivity matter.",
      safety: "", goal: { metric: "temp", op: "between", value: 285, value2: 291, text: "Make the planet comfortably habitable: 285 to 291 K." },
      params: [P("S", "Sunlight at the planet", "W/m²", 300, 3000, 10, 1361), P("albedo", "Reflectivity (albedo)", "", 0, 0.9, 0.01, 0.3), P("eps", "Greenhouse absorption ε", "", 0, 1, 0.01, 0.78)],
      script: `const sigma = 5.670374419e-8, absorbed = params.S * (1 - params.albedo) / 4;
const T = Math.pow(absorbed / (sigma * (1 - params.eps / 2)), 0.25), T0 = Math.pow(absorbed / sigma, 0.25), eps = Lab.linspace(0, 1, 60);
return { charts: [{ title: "Temperature vs greenhouse strength", xLabel: "Greenhouse absorption ε", yLabel: "Surface temperature (K)", series: [{ name: "Equilibrium", x: eps, y: eps.map(e => Math.pow(absorbed / (sigma * (1 - e / 2)), 0.25)) }, { name: "Your planet", x: [params.eps], y: [T], style: "points" }] }],
  metrics: { temp: { label: "Surface temperature", value: Lab.round(T, 1), unit: "K" }, celsius: { label: "In Celsius", value: Lab.round(T - 273.15, 1), unit: "°C" }, bare: { label: "Without an atmosphere", value: Lab.round(T0, 1), unit: "K" }, warming: { label: "Greenhouse warming", value: Lab.round(T - T0, 1), unit: "K" } } };` }
  ];
  const papers = [
    { id: "paper-herd", lab: "biology", title: "How much vaccination is enough? A model-based note", authors: "RP Biology Lab", status: "published",
      abstract: "Using a classic SIR model we show that vaccinating roughly 1 − 1/R₀ of a population prevents an outbreak from growing.",
      body: "## Introduction\nWhen a fraction of a population is immune, an infection finds fewer susceptible people. We ask how large that fraction must be.\n\n## Method\nWe simulate an SIR epidemic in a population of 10,000 people with R₀ = 2.5 (β = 0.5, γ = 0.2) and vary the vaccinated share.\n\n## Results\n- With **no vaccination** the outbreak peaks above a quarter of the population.\n- With **60%** vaccinated, the herd-immunity threshold, the epidemic no longer takes off.\n\nUse the figure button to reproduce the 60% case.\n\n## Conclusion\nThe threshold 1 − 1/R₀ predicts the transition well in this simple model. Real diseases are more complicated.",
      figure: { experiment: "exp-sir", params: { beta: 0.5, gamma: 0.2, vax: 60, days: 160 }, caption: "Figure 1. SIR epidemic with 60% of people vaccinated." },
      references: [{ title: "Kermack & McKendrick (1927), A contribution to the mathematical theory of epidemics", url: "https://en.wikipedia.org/wiki/Kermack%E2%80%93McKendrick_theory" }] },
    { id: "paper-kepler", lab: "earth", title: "Checking Kepler's third law numerically", authors: "RP Earth & Space Lab", status: "published",
      abstract: "We integrate Newtonian orbits and confirm that T²/a³ is constant for bound orbits regardless of eccentricity.",
      body: "## Introduction\nKepler observed that planets with larger orbits take disproportionately longer to go around the Sun.\n\n## Method\nWe integrate the equations of motion with a fourth-order Runge–Kutta method for several starting speeds.\n\n## Results\nFor every bound orbit the ratio T²/a³ stays at 1.000 when measured in years and astronomical units.\n\n## Conclusion\nThe law follows from an inverse-square force and holds for ellipses of any eccentricity.",
      figure: { experiment: "exp-orbit", params: { r0: 1, vf: 0.8, years: 3 }, caption: "Figure 1. An orbit with eccentricity 0.36." }, references: [] }
  ];
  return { labs, experiments, papers };
})();

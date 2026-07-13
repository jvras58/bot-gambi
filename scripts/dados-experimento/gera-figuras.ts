// Gera as figuras do Capítulo 6 (boxplot, série temporal, conformidade, ações)
// Uso: bun run gera-figuras.ts  → figuras/*.svg + figuras/print-*.html
// Depois converta para PDF vetorial com Edge headless (ver gera-figuras-pdf.sh)

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const DIR = import.meta.dir;
const RAW = join(DIR, "raw");
const OUT = join(DIR, "figuras");
mkdirSync(OUT, { recursive: true });

type Cycle = Record<string, any>;
const cycles: Cycle[] = [
  ...JSON.parse(readFileSync(join(RAW, "cycles_p1.json"), "utf8")),
  ...JSON.parse(readFileSync(join(RAW, "cycles_p2.json"), "utf8")),
];
const snapshots: Cycle[] = JSON.parse(readFileSync(join(RAW, "snapshots.json"), "utf8"));
const spec = new Map<string, Cycle>();
for (const s of snapshots) spec.set(`${s.session_id}|${s.participant_id}`, s);
const gpuOf = (c: Cycle) => {
  const s = spec.get(`${c.session_id}|${c.participant_id}`);
  const g = s?.gpu && s.gpu !== "Parsec Virtual Display Adapter" ? s.gpu : null;
  return g
    ? g.replace("NVIDIA GeForce ", "").replace("Intel(R) Iris(R) Xe Graphics", "Iris Xe").replace("AMD Radeon(TM) Graphics", "Radeon iGPU").replace("Apple ", "")
    : "CPU only";
};
const keyOf = (c: Cycle) => `${c.model_name}|${gpuOf(c)}`;

// Configurações principais (ordem fixa; cores seguem a entidade)
const CONFIGS: { key: string; model: string; hw: string; color: string }[] = [
  { key: "gemma3:1b|M3 Pro", model: "gemma3:1b", hw: "M3 Pro", color: "#9d5ecf" },
  { key: "gemma3:1b|RTX 2050", model: "gemma3:1b", hw: "RTX 2050", color: "#2a78d6" },
  { key: "gemma3:4b|M2 Pro", model: "gemma3:4b", hw: "M2 Pro", color: "#178f66" },
  { key: "llama3.2:latest|M2", model: "llama3.2 (3B)", hw: "M2", color: "#c8880a" },
  { key: "qwen2.5:0.5b|Radeon iGPU", model: "qwen2.5:0.5b", hw: "Radeon iGPU", color: "#d64550" },
  { key: "granite4.1:3b|CPU only", model: "granite4.1:3b", hw: "CPU only", color: "#52514e" },
  { key: "granite4.1:8b|GTX 1650", model: "granite4.1:8b", hw: "GTX 1650", color: "#12707f" },
];
const byKey = new Map<string, Cycle[]>();
for (const c of cycles) {
  const k = keyOf(c);
  (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(c);
}

const INK = "#1a1a1a", INK2 = "#4a4a48", MUTED = "#7a7975", GRID = "#e2e1db", AXIS = "#b9b8b0";
const FONT = `font-family="Helvetica,Arial,sans-serif"`;
const nums = (xs: any[]) => xs.filter((x): x is number => typeof x === "number" && isFinite(x));
const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const svgWrap = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ${FONT} font-size="12">
<rect width="${w}" height="${h}" fill="#ffffff"/>
${body}</svg>`;

function save(name: string, w: number, h: number, body: string) {
  const svg = svgWrap(w, h, body);
  writeFileSync(join(OUT, `${name}.svg`), svg, "utf8");
  writeFileSync(join(OUT, `print-${name}.html`),
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:${w}px ${h}px;margin:0}html,body{margin:0;padding:0}svg{display:block}</style></head><body>${svg}</body></html>`, "utf8");
  console.log(`✔ figuras/${name}.svg`);
}

// escala log10 (segundos)
const logY = (v: number, min: number, max: number, top: number, bot: number) =>
  bot - ((Math.log10(v) - Math.log10(min)) / (Math.log10(max) - Math.log10(min))) * (bot - top);

// ═══ Figura 1: Boxplot de latência ═══════════════════════════
{
  const W = 800, H = 440, L = 62, R = 786, T = 18, B = 366;
  const yMin = 1, yMax = 130;
  const y = (v: number) => logY(v, yMin, yMax, T, B);
  let s = "";
  for (const tk of [1, 2, 5, 10, 30, 60, 120]) {
    s += `<line x1="${L}" y1="${y(tk).toFixed(1)}" x2="${R}" y2="${y(tk).toFixed(1)}" stroke="${GRID}"/>`;
    s += `<text x="${L - 8}" y="${(y(tk) + 4).toFixed(1)}" fill="${MUTED}" text-anchor="end">${tk}</text>`;
  }
  s += `<line x1="${y(3) && L}" y1="${y(3).toFixed(1)}" x2="${R}" y2="${y(3).toFixed(1)}" stroke="${MUTED}" stroke-dasharray="4 4"/>`;
  s += `<text x="${R}" y="${(y(3) - 6).toFixed(1)}" fill="${INK2}" text-anchor="end" font-weight="600">ciclo-alvo: 3 s</text>`;
  s += `<text x="16" y="${(T + B) / 2}" fill="${INK2}" text-anchor="middle" transform="rotate(-90 16 ${(T + B) / 2})">Latência bot-side (s, escala log)</text>`;

  const configs = [...CONFIGS].sort((a, b) => {
    const m = (k: string) => q(nums(byKey.get(k)!.map((c) => c.llm_response_time_ms)), 0.5);
    return m(a.key) - m(b.key);
  });
  const step = (R - L) / configs.length;
  configs.forEach((cfg, i) => {
    const lat = nums(byKey.get(cfg.key)!.map((c) => c.llm_response_time_ms)).map((v) => v / 1000);
    const q1 = q(lat, 0.25), q2 = q(lat, 0.5), q3 = q(lat, 0.75);
    const iqr = q3 - q1;
    const inliers = lat.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
    const wLo = Math.min(...inliers), wHi = Math.max(...inliers);
    const outliers = lat.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr);
    const cx = L + step * (i + 0.5), bw = 44;
    s += `<line x1="${cx}" y1="${y(wLo).toFixed(1)}" x2="${cx}" y2="${y(q1).toFixed(1)}" stroke="${INK2}"/>`;
    s += `<line x1="${cx}" y1="${y(q3).toFixed(1)}" x2="${cx}" y2="${y(wHi).toFixed(1)}" stroke="${INK2}"/>`;
    s += `<line x1="${cx - 12}" y1="${y(wLo).toFixed(1)}" x2="${cx + 12}" y2="${y(wLo).toFixed(1)}" stroke="${INK2}"/>`;
    s += `<line x1="${cx - 12}" y1="${y(wHi).toFixed(1)}" x2="${cx + 12}" y2="${y(wHi).toFixed(1)}" stroke="${INK2}"/>`;
    s += `<rect x="${cx - bw / 2}" y="${y(q3).toFixed(1)}" width="${bw}" height="${(y(q1) - y(q3)).toFixed(1)}" rx="3" fill="${cfg.color}" fill-opacity="0.28" stroke="${cfg.color}" stroke-width="1.6"/>`;
    s += `<line x1="${cx - bw / 2}" y1="${y(q2).toFixed(1)}" x2="${cx + bw / 2}" y2="${y(q2).toFixed(1)}" stroke="${cfg.color}" stroke-width="2.6"/>`;
    for (const o of outliers) s += `<circle cx="${cx}" cy="${y(o).toFixed(1)}" r="2.4" fill="none" stroke="${MUTED}" stroke-width="1"/>`;
    s += `<text x="${cx}" y="${B + 20}" fill="${INK}" text-anchor="middle" font-weight="600">${cfg.model}</text>`;
    s += `<text x="${cx}" y="${B + 36}" fill="${MUTED}" text-anchor="middle">${cfg.hw}</text>`;
    s += `<text x="${cx}" y="${B + 52}" fill="${MUTED}" text-anchor="middle">n=${lat.length}</text>`;
  });
  s += `<line x1="${L}" y1="${B}" x2="${R}" y2="${B}" stroke="${AXIS}"/>`;
  save("fig-boxplot-latencia", W, H, s);
}

// ═══ Figura 2: Série temporal de latência ════════════════════
{
  const W = 800, H = 446, L = 62, R = 786, T = 62, B = 402;
  const SERIES = CONFIGS.filter((c) => (byKey.get(c.key)?.length ?? 0) >= 94);
  const yMin = 1, yMax = 70;
  const y = (v: number) => logY(Math.min(Math.max(v, yMin), yMax), yMin, yMax, T, B);
  const maxCycle = Math.max(...SERIES.map((cfg) => Math.max(...byKey.get(cfg.key)!.map((c) => c.cycle_number))));
  const x = (n: number) => L + (n / maxCycle) * (R - L);
  let s = "";
  for (const tk of [1, 2, 5, 10, 30, 60]) {
    s += `<line x1="${L}" y1="${y(tk).toFixed(1)}" x2="${R}" y2="${y(tk).toFixed(1)}" stroke="${GRID}"/>`;
    s += `<text x="${L - 8}" y="${(y(tk) + 4).toFixed(1)}" fill="${MUTED}" text-anchor="end">${tk}</text>`;
  }
  for (const tk of [0, 50, 100, 150]) {
    s += `<text x="${x(tk).toFixed(1)}" y="${B + 20}" fill="${MUTED}" text-anchor="middle">${tk}</text>`;
  }
  s += `<text x="${(L + R) / 2}" y="${B + 40}" fill="${INK2}" text-anchor="middle">Número do ciclo</text>`;
  s += `<text x="16" y="${(T + B) / 2}" fill="${INK2}" text-anchor="middle" transform="rotate(-90 16 ${(T + B) / 2})">Latência bot-side (s, escala log)</text>`;
  s += `<line x1="${L}" y1="${y(3).toFixed(1)}" x2="${R}" y2="${y(3).toFixed(1)}" stroke="${MUTED}" stroke-dasharray="4 4"/>`;

  let lx = L, lyRow = 14;
  for (const cfg of SERIES) {
    const label = `${cfg.model} — ${cfg.hw}`;
    const wEst = 21 + label.length * 6.4 + 22;
    if (lx + wEst > W - 10) { lx = L; lyRow += 18; }
    s += `<line x1="${lx}" y1="${lyRow}" x2="${lx + 16}" y2="${lyRow}" stroke="${cfg.color}" stroke-width="3"/>`;
    s += `<text x="${lx + 21}" y="${lyRow + 4}" fill="${INK2}" font-size="11.5">${label}</text>`;
    lx += wEst;
  }
  for (const cfg of SERIES) {
    const pts = byKey.get(cfg.key)!
      .filter((c) => c.llm_response_time_ms != null)
      .sort((a, b) => a.cycle_number - b.cycle_number)
      .map((c) => `${x(c.cycle_number).toFixed(1)},${y(c.llm_response_time_ms / 1000).toFixed(1)}`);
    s += `<polyline points="${pts.join(" ")}" fill="none" stroke="${cfg.color}" stroke-width="1.7" stroke-linejoin="round" stroke-opacity="0.9"/>`;
  }
  s += `<text x="${R}" y="${(y(3) - 6).toFixed(1)}" fill="${INK2}" text-anchor="end" font-weight="600">ciclo-alvo: 3 s</text>`;
  s += `<line x1="${L}" y1="${B}" x2="${R}" y2="${B}" stroke="${AXIS}"/>`;
  save("fig-serie-temporal-latencia", W, H, s);
}

// ═══ helper: barras horizontais 100% empilhadas ═══════════════
function stacked(name: string, rows: { label: string; sub: string; parts: number[] }[], cats: { name: string; color: string }[], note?: string) {
  const W = 800, LBL = 190, R = 786, rowH = 34, barH = 22, T = 34;
  const noteLines: string[] = [];
  if (note) {
    let line = "";
    for (const word of note.split(" ")) {
      if ((line + " " + word).length > 118) { noteLines.push(line); line = word; }
      else line = line ? line + " " + word : word;
    }
    if (line) noteLines.push(line);
  }
  const H = T + rows.length * rowH + 14 + noteLines.length * 15 + 12;
  let s = "";
  let lx = LBL;
  for (const c of cats) {
    s += `<rect x="${lx}" y="8" width="12" height="12" rx="2" fill="${c.color}"/>`;
    s += `<text x="${lx + 17}" y="18" fill="${INK2}">${c.name}</text>`;
    lx += 17 + c.name.length * 6.4 + 22;
  }
  rows.forEach((r, i) => {
    const yTop = T + i * rowH, yMid = yTop + barH / 2;
    const total = r.parts.reduce((a, b) => a + b, 0) || 1;
    s += `<text x="${LBL - 10}" y="${yMid + 1}" fill="${INK}" text-anchor="end" font-weight="600">${r.label}</text>`;
    s += `<text x="${LBL - 10}" y="${yMid + 13}" fill="${MUTED}" text-anchor="end" font-size="10.5">${r.sub}</text>`;
    let xx = LBL;
    r.parts.forEach((p, j) => {
      const w = (p / total) * (R - LBL);
      if (w <= 0) { return; }
      s += `<rect x="${xx.toFixed(1)}" y="${yTop}" width="${Math.max(w - 2, 0.5).toFixed(1)}" height="${barH}" rx="2" fill="${cats[j].color}"/>`;
      const pctv = (100 * p) / total;
      if (pctv >= 7) s += `<text x="${(xx + w / 2).toFixed(1)}" y="${yMid + 4}" fill="#ffffff" text-anchor="middle" font-weight="600" font-size="11">${pctv.toFixed(pctv >= 99.5 ? 0 : 1)}%</text>`;
      xx += w;
    });
  });
  noteLines.forEach((ln, i) => {
    s += `<text x="14" y="${T + rows.length * rowH + 22 + i * 15}" fill="${MUTED}" font-size="11">${ln}</text>`;
  });
  save(name, W, H, s);
}

// ═══ Figura 3: Conformidade JSON empilhada ═══════════════════
{
  const rows: { label: string; sub: string; parts: number[] }[] = [];
  const EXTRA = [
    { key: "qwen3.5:2b-mlx|M2 Pro", model: "qwen3.5:2b-mlx", hw: "M2 Pro" },
    { key: "qwen3.5:4b|RTX 2050", model: "qwen3.5:4b", hw: "RTX 2050" },
    { key: "gemma4:12b|M3 Pro", model: "gemma4:12b", hw: "M3 Pro" },
  ];
  for (const cfg of [...CONFIGS, ...EXTRA]) {
    const g = (byKey.get(cfg.key) ?? []).filter((c) => c.llm_error == null);
    if (!g.length) continue;
    const rep = g.filter((c) => c.llm_json_repaired).length;
    const fail = g.filter((c) => c.llm_parse_error).length;
    rows.push({ label: cfg.model, sub: `${cfg.hw} · n=${g.length}`, parts: [g.length - rep - fail, rep, fail] });
  }
  rows.sort((a, b) => (b.parts[0] + b.parts[1]) / (b.parts[0] + b.parts[1] + b.parts[2]) - (a.parts[0] + a.parts[1]) / (a.parts[0] + a.parts[1] + a.parts[2]));
  stacked("fig-conformidade-json", rows,
    [{ name: "JSON válido direto", color: "#2a78d6" }, { name: "Reparado (jsonrepair)", color: "#c8880a" }, { name: "Falha de parse", color: "#c0392b" }],
    "Percentuais sobre ciclos com resposta do hub. As três últimas configurações são modelos com raciocínio explícito truncados pelo limite de 256 tokens (Seção 6.3.2).");
}

// ═══ Figura 4: Distribuição de ações empilhada ═══════════════
{
  const ACTS = ["EXPLORAR", "COLETAR", "ANDAR", "FALAR", "OLHAR"];
  const CATS = [
    { name: "EXPLORAR", color: "#2a78d6" }, { name: "COLETAR", color: "#178f66" },
    { name: "ANDAR", color: "#c8880a" }, { name: "FALAR", color: "#9d5ecf" },
    { name: "OLHAR", color: "#d64550" }, { name: "Outras", color: "#8a8983" },
  ];
  const rows = CONFIGS.map((cfg) => {
    const acts = (byKey.get(cfg.key) ?? []).filter((c) => c.action != null);
    const parts = ACTS.map((a) => acts.filter((c) => c.action === a).length);
    parts.push(acts.length - parts.reduce((a, b) => a + b, 0));
    return { label: cfg.model, sub: `${cfg.hw} · n=${acts.length}`, parts };
  }).filter((r) => r.parts.reduce((a, b) => a + b, 0) >= 20);
  stacked("fig-distribuicao-acoes", rows, CATS,
    "Ações válidas por configuração. “Outras” agrega SEGUIR, PARAR, NADA, PULAR e ATACAR. A ação registrada já passou pelo mecanismo de variedade forçada (Seção 5.4.6).");
}

console.log("Figuras geradas em figuras/. Converta para PDF com: bash gera-figuras-pdf.sh");

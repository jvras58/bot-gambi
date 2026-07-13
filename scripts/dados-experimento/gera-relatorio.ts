// Gera o relatório HTML do experimento (estilo "encontro-2026-07-11.html")
// Uso: bun run gera-relatorio.ts
// Saída: relatorio-minecraft-2026-07-11.html (nesta pasta)

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DIR = import.meta.dir;
const RAW = join(DIR, "raw");
const TZ_OFFSET_MS = -3 * 3600e3; // UTC-3 (Recife)

type Cycle = Record<string, any>;
const cycles: Cycle[] = [
  ...JSON.parse(readFileSync(join(RAW, "cycles_p1.json"), "utf8")),
  ...JSON.parse(readFileSync(join(RAW, "cycles_p2.json"), "utf8")),
];
const snapshots: Cycle[] = JSON.parse(readFileSync(join(RAW, "snapshots.json"), "utf8"));
const sessions: Cycle[] = JSON.parse(readFileSync(join(RAW, "sessions.json"), "utf8"));

// ── helpers ──────────────────────────────────────────────────
const local = (iso: string) => new Date(new Date(iso).getTime() + TZ_OFFSET_MS);
const hhmm = (iso: string) => local(iso).toISOString().slice(11, 16);
const nums = (xs: any[]) => xs.filter((x): x is number => typeof x === "number" && isFinite(x));
const pct = (xs: number[], p: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const specByKey = new Map<string, Cycle>();
for (const s of snapshots) specByKey.set(`${s.session_id}|${s.participant_id}`, s);
const specOf = (c: Cycle) => specByKey.get(`${c.session_id}|${c.participant_id}`);
const hwLabel = (s?: Cycle) => {
  if (!s) return "?";
  const gpu = s.gpu && s.gpu !== "Parsec Virtual Display Adapter" ? s.gpu : null;
  const short = gpu
    ? gpu.replace("NVIDIA GeForce ", "").replace("Intel(R) Iris(R) Xe Graphics", "Iris Xe").replace("AMD Radeon(TM) Graphics", "Radeon iGPU").replace("Apple ", "")
    : "CPU only";
  return `${short} · ${s.ram ?? "?"}GB`;
};

// ── série ciclos/min ─────────────────────────────────────────
const perMin = new Map<string, number>();
for (const c of cycles) {
  const k = hhmm(c.created_at);
  perMin.set(k, (perMin.get(k) ?? 0) + 1);
}
const t0 = "10:14", t1 = "11:08";
const minKey = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (k: string) => +k.slice(0, 2) * 60 + +k.slice(3);
const series: { t: string; v: number }[] = [];
for (let m = toMin(t0); m <= toMin(t1); m++) series.push({ t: minKey(m), v: perMin.get(minKey(m)) ?? 0 });

// ── agregados por modelo × hardware ──────────────────────────
type Agg = {
  model: string; hw: string; n: number; p50: number; tps: number; json: number; act: number; err: number; thinking: boolean;
  hubDur: number; ttft: number; tpsLlm: number; tpsHub: number; tokIn: number; tokOut: number; overhead: number;
};
const groups = new Map<string, Cycle[]>();
for (const c of cycles) {
  const k = `${c.model_name}|${hwLabel(specOf(c))}`;
  (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
}
const THINKING = (m: string) => m.startsWith("qwen3.5") || m === "gemma4:12b" || m.includes("thinking") || m === "ornith:9b";
const aggs: Agg[] = [...groups.entries()].map(([k, g]) => {
  const [model, hw] = k.split("|");
  const answered = g.filter((c) => c.llm_error == null);
  const executed = g.filter((c) => c.action_success != null);
  const overheads = nums(g.filter((c) => c.llm_response_time_ms != null && c.hub_duration_ms != null)
    .map((c) => c.llm_response_time_ms - c.hub_duration_ms));
  return {
    model, hw, n: g.length,
    p50: pct(nums(g.map((c) => c.llm_response_time_ms)), 0.5),
    tps: pct(nums(g.map((c) => c.hub_tokens_per_second ?? c.llm_tokens_per_second)), 0.5),
    hubDur: pct(nums(g.map((c) => c.hub_duration_ms)), 0.5),
    ttft: pct(nums(g.map((c) => c.hub_ttft_ms)), 0.5),
    tpsLlm: pct(nums(g.map((c) => c.llm_tokens_per_second)), 0.5),
    tpsHub: pct(nums(g.map((c) => c.hub_tokens_per_second)), 0.5),
    tokIn: pct(nums(g.map((c) => c.hub_input_tokens ?? c.llm_input_tokens)), 0.5),
    tokOut: pct(nums(g.map((c) => c.hub_output_tokens ?? c.llm_output_tokens)), 0.5),
    overhead: pct(overheads, 0.5),
    json: answered.length ? (100 * answered.filter((c) => !c.llm_parse_error).length) / answered.length : NaN,
    act: executed.length ? (100 * executed.filter((c) => c.action_success).length) / executed.length : NaN,
    err: (100 * g.filter((c) => c.llm_error != null).length) / g.length,
    thinking: THINKING(model),
  };
}).sort((a, b) => b.n - a.n);

// ── métricas por modelo: conformidade + qualidade de decisão ─
type ModelStat = {
  model: string; n: number; errPct: number; validPct: number; repairPct: number; failPct: number;
  nActions: number; actOk: number; execP50: number; fav: string; favPct: number; entropy: number; thinking: boolean;
};
const byModel = new Map<string, Cycle[]>();
for (const c of cycles) (byModel.get(c.model_name) ?? byModel.set(c.model_name, []).get(c.model_name)!).push(c);
const modelStats: ModelStat[] = [...byModel.entries()].map(([model, g]) => {
  const answered = g.filter((c) => c.llm_error == null);
  const valid = answered.filter((c) => !c.llm_parse_error);
  const rep = answered.filter((c) => c.llm_json_repaired);
  const acts = g.filter((c) => c.action != null);
  const counts = new Map<string, number>();
  for (const c of acts) counts.set(c.action, (counts.get(c.action) ?? 0) + 1);
  let entropy = NaN, fav = "—", favPct = NaN;
  if (acts.length) {
    entropy = 0;
    for (const n of counts.values()) {
      const p = n / acts.length;
      entropy -= p * Math.log2(p);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    fav = top[0];
    favPct = (100 * top[1]) / acts.length;
  }
  const executed = g.filter((c) => c.action_success != null);
  return {
    model, n: g.length,
    errPct: (100 * g.filter((c) => c.llm_error != null).length) / g.length,
    validPct: answered.length ? (100 * valid.length) / answered.length : NaN,
    repairPct: answered.length ? (100 * rep.length) / answered.length : NaN,
    failPct: answered.length ? (100 * (answered.length - valid.length)) / answered.length : NaN,
    nActions: acts.length,
    actOk: executed.length ? (100 * executed.filter((c) => c.action_success).length) / executed.length : NaN,
    execP50: pct(nums(g.map((c) => c.action_execution_time_ms)), 0.5),
    fav, favPct, entropy, thinking: THINKING(model),
  };
}).sort((a, b) => b.n - a.n);

const viaveis = aggs.filter((a) => a.json >= 75 && a.n >= 20).sort((a, b) => a.p50 - b.p50);
const comTps = aggs.filter((a) => isFinite(a.tps) && a.n >= 20).sort((a, b) => b.tps - a.tps);

// ── distribuição de ações ────────────────────────────────────
const actCount = new Map<string, number>();
for (const c of cycles) if (c.action) actCount.set(c.action, (actCount.get(c.action) ?? 0) + 1);
const actions = [...actCount.entries()].sort((a, b) => b[1] - a[1]);
const totalValid = actions.reduce((a, [, n]) => a + n, 0);

// ── fatos ────────────────────────────────────────────────────
const nModels = new Set(cycles.map((c) => c.model_name)).size;
const nHw = new Set([...groups.keys()].map((k) => k.split("|")[1])).size;
const nSessData = new Set(cycles.map((c) => c.session_id)).size;
const reqCycles = cycles.filter((c) => c.chat_request != null);
const nReqs = new Set(reqCycles.map((c) => c.chat_request)).size;
const firstReq = hhmm(reqCycles.map((c) => c.created_at).sort()[0]);
const death = cycles.find((c) => c.health === 0)!;
const peak = series.reduce((a, b) => (b.v > a.v ? b : a));
const repaired = cycles.filter((c) => c.llm_json_repaired).length;
const emptyResp = cycles.filter((c) => c.llm_parse_error && !c.llm_raw_length).length;

// ═════════════════════════════════════════════════════════════
// SVG builders
// ═════════════════════════════════════════════════════════════

function lineChart() {
  const W = 900, H = 300, L = 56, R = 884, T = 24, B = 266;
  const x = (m: string) => L + ((toMin(m) - toMin(t0)) / (toMin(t1) - toMin(t0))) * (R - L);
  const yMax = 60;
  const y = (v: number) => B - (v / yMax) * (B - T);
  let s = "";
  for (const g of [0, 20, 40, 60]) {
    s += `<line x1="${L}" y1="${y(g).toFixed(1)}" x2="${R}" y2="${y(g).toFixed(1)}" class="grid"/>`;
    s += `<text x="${L - 8}" y="${(y(g) + 4).toFixed(1)}" class="tick" text-anchor="end">${g}</text>`;
  }
  for (let m = toMin("10:15"); m <= toMin(t1); m += 10) {
    s += `<text x="${x(minKey(m)).toFixed(1)}" y="292" class="tick" text-anchor="middle">${minKey(m)}</text>`;
  }
  const pts = series.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`);
  s += `<polygon points="${x(t0).toFixed(1)},${B} ${pts.join(" ")} ${x(t1).toFixed(1)},${B}" class="area"/>`;
  s += `<polyline points="${pts.join(" ")}" class="line"/>`;
  const anns: [string, string, number, string][] = [
    ["10:16", "primeiros ciclos", 44, "start"],
    [firstReq, "jvras58 começa a dar ordens", 64, "end"],
    [hhmm(death.created_at), "☠️ amarante cai", 100, "end"],
    ["11:06", "último ciclo — hora do World", 44, "end"],
  ];
  for (const [t, lab, yy, anchor] of anns) {
    const xx = x(t).toFixed(1);
    s += `<line x1="${xx}" y1="24" x2="${xx}" y2="${B}" class="ann"/>`;
    s += `<text x="${anchor === "start" ? +xx + 6 : +xx - 6}" y="${yy}" class="annlab" text-anchor="${anchor}">${lab}</text>`;
  }
  for (const p of series) {
    if (p.v === 0) continue;
    s += `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="9" class="hit" data-tip="${p.t} — ${p.v} ciclos/min"/>`;
  }
  s += `<line x1="${L}" y1="${B}" x2="${R}" y2="${B}" class="axis"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ciclos por minuto">${s}</svg>`;
}

function hbar(rows: { label: string; value: number; disp: string; tip: string }[], opts: { color: string; maxOverride?: number; annotateAt?: { v: number; label: string }; xticks: number[]; fmtTick?: (v: number) => string }) {
  const LBL = 250, R = 884, rowH = 30, barH = 20;
  const PAD = opts.annotateAt ? 22 : 0;
  const H = rows.length * rowH + 20 + 34 + PAD;
  const max = opts.maxOverride ?? Math.max(...rows.map((r) => r.value)) * 1.08;
  const x = (v: number) => LBL + (v / max) * (R - LBL);
  let s = "";
  for (const tk of opts.xticks) {
    if (tk > 0) s += `<line x1="${x(tk).toFixed(1)}" y1="${PAD + 4}" x2="${x(tk).toFixed(1)}" y2="${PAD + rows.length * rowH + 4}" class="grid"/>`;
  }
  s += `<line x1="${LBL}" y1="${PAD}" x2="${LBL}" y2="${PAD + rows.length * rowH + 4}" class="axis"/>`;
  rows.forEach((r, i) => {
    const yTop = PAD + i * rowH + 4, yMid = yTop + 10;
    const w = Math.max(x(r.value) - LBL, 2).toFixed(1);
    s += `<text x="${LBL - 10}" y="${yMid + 4}" class="blab" text-anchor="end">${esc(r.label.length > 34 ? r.label.slice(0, 33) + "…" : r.label)}</text>`;
    s += `<path d="M${LBL},${yTop} h${w} a4,4 0 0 1 4,4 v${barH - 8} a4,4 0 0 1 -4,4 h-${w} z" fill="${opts.color}" class="bar" data-tip="${esc(r.tip)}"/>`;
    s += `<text x="${(+w + LBL + 8).toFixed(1)}" y="${yMid + 4}" class="bval">${r.disp}</text>`;
  });
  if (opts.annotateAt) {
    const xv = x(opts.annotateAt.v);
    const flip = xv > (LBL + R) / 2;
    s += `<line x1="${xv.toFixed(1)}" y1="10" x2="${xv.toFixed(1)}" y2="${PAD + rows.length * rowH + 4}" class="ann"/>`;
    s += `<text x="${(flip ? xv - 6 : xv + 6).toFixed(1)}" y="14" class="annlab" text-anchor="${flip ? "end" : "start"}">${opts.annotateAt.label}</text>`;
  }
  for (const tk of opts.xticks) {
    s += `<text x="${x(tk).toFixed(1)}" y="${PAD + rows.length * rowH + 26}" class="tick" text-anchor="middle">${opts.fmtTick ? opts.fmtTick(tk) : tk}</text>`;
  }
  return `<svg class="chart" viewBox="0 0 900 ${H}" role="img">${s}</svg>`;
}

// ── gráficos ─────────────────────────────────────────────────
const latChart = hbar(
  viaveis.map((a) => ({
    label: `${a.model} — ${a.hw}`,
    value: a.p50 / 1000,
    disp: `${(a.p50 / 1000).toFixed(1)} s`,
    tip: `${a.model} em ${a.hw} — p50 ${(a.p50 / 1000).toFixed(1)} s · ${a.n} ciclos · JSON ${a.json.toFixed(0)}% · ação OK ${a.act.toFixed(0)}%`,
  })),
  { color: "var(--series-1)", maxOverride: 85, annotateAt: { v: 3, label: "alvo: ciclo de 3 s" }, xticks: [0, 20, 40, 60, 80], fmtTick: (v) => `${v}s` },
);

const tpsChart = hbar(
  comTps.map((a) => ({
    label: `${a.model} — ${a.hw}`,
    value: a.tps,
    disp: `${a.tps.toFixed(1)}${a.thinking ? " 🤔" : ""}`,
    tip: `${a.model} em ${a.hw} — ${a.tps.toFixed(1)} tokens/s (p50) · ${a.n} ciclos${a.thinking ? " · modelo thinking (só desempenho vale)" : ""}`,
  })),
  { color: "var(--series-2)", xticks: [0, 15, 30, 45, 60] },
);

const entRows = modelStats.filter((m) => m.nActions >= 20).sort((a, b) => b.entropy - a.entropy);
const entChart = hbar(
  entRows.map((m) => ({
    label: m.model,
    value: m.entropy,
    disp: `${m.entropy.toFixed(2)} bits`,
    tip: `${m.model} — entropia ${m.entropy.toFixed(2)} bits sobre ${m.nActions} ações válidas · favorita: ${m.fav} (${m.favPct.toFixed(0)}%)`,
  })),
  { color: "var(--series-1)", maxOverride: 3.6, annotateAt: { v: Math.log2(10), label: "máximo teórico: 3,32 bits (10 ações)" }, xticks: [0, 1, 2, 3] },
);

const actChart = hbar(
  actions.map(([a, n]) => ({
    label: a, value: n, disp: `${n}`,
    tip: `${a} — ${n} ciclos (${((100 * n) / totalValid).toFixed(1)}% das ações válidas)`,
  })),
  { color: "var(--series-1)", xticks: [0, 60, 120, 180, 240] },
);

// ── tabela de desempenho detalhado ───────────────────────────
const sec = (v: number) => (isFinite(v) ? (v / 1000).toFixed(1) + " s" : "—");
const n1 = (v: number) => (isFinite(v) ? v.toFixed(1) : "—");
const n0 = (v: number) => (isFinite(v) ? v.toFixed(0) : "—");
const perfRows = aggs.filter((a) => a.n >= 10 && a.err < 99).map((a) => `<tr>
<td>${esc(a.model)}</td><td>${esc(a.hw)}</td><td class="num">${a.n}</td>
<td class="num">${sec(a.p50)}</td><td class="num">${sec(a.hubDur)}</td><td class="num">${isFinite(a.overhead) ? a.overhead.toFixed(0) + " ms" : "—"}</td>
<td class="num">${sec(a.ttft)}</td>
<td class="num">${n1(a.tpsLlm)}</td><td class="num">${n1(a.tpsHub)}</td>
<td class="num">${n0(a.tokIn)}</td><td class="num">${n0(a.tokOut)}</td></tr>`).join("\n");

// ── tabela de conformidade por modelo ────────────────────────
const confRows = modelStats.filter((m) => m.n >= 10).sort((a, b) => (isNaN(b.validPct) ? -1 : b.validPct) - (isNaN(a.validPct) ? -1 : a.validPct)).map((m) => `<tr>
<td>${esc(m.model)}${m.thinking ? " 🤔" : ""}</td><td class="num">${m.n}</td>
<td class="num${m.errPct > 20 ? "" : " muted"}">${m.errPct.toFixed(1)}%</td>
<td class="num${m.validPct >= 90 ? " ok" : ""}">${isFinite(m.validPct) ? m.validPct.toFixed(1) + "%" : "—"}</td>
<td class="num">${isFinite(m.repairPct) ? m.repairPct.toFixed(1) + "%" : "—"}</td>
<td class="num">${isFinite(m.failPct) ? m.failPct.toFixed(1) + "%" : "—"}</td></tr>`).join("\n");

// ── tabela de qualidade de decisão por modelo ────────────────
const qualRows = modelStats.filter((m) => m.nActions >= 5).sort((a, b) => b.nActions - a.nActions).map((m) => `<tr>
<td>${esc(m.model)}</td><td class="num">${m.nActions}</td>
<td class="num${m.actOk >= 85 ? " ok" : ""}">${isFinite(m.actOk) ? m.actOk.toFixed(1) + "%" : "—"}</td>
<td class="num">${isFinite(m.execP50) ? (m.execP50 < 1 ? "&lt;1 ms" : m.execP50.toFixed(0) + " ms") : "—"}</td>
<td class="num">${esc(m.fav)} (${n0(m.favPct)}%)</td>
<td class="num">${isFinite(m.entropy) ? m.entropy.toFixed(2) : "—"}</td></tr>`).join("\n");

// ── tabela principal ─────────────────────────────────────────
const obs = (a: Agg) => {
  if (a.err >= 99) return "hub fora do ar — sem dados";
  if (a.thinking && a.json < 5) return "🤔 estourou os 256 tokens pensando";
  if (a.json >= 90 && a.p50 <= 6000) return "✅ sustenta o loop";
  if (a.json >= 75 && a.json < 90) return "no limite: erra ~1 em 4 respostas";
  if (a.json >= 90) return "correto, mas lento demais";
  return "";
};
const tableRows = aggs.filter((a) => a.n >= 10).map((a) => `<tr>
<td>${esc(a.model)}</td><td>${esc(a.hw)}</td><td class="num">${a.n}</td>
<td class="num">${isFinite(a.p50) ? (a.p50 / 1000).toFixed(1) + " s" : "—"}</td>
<td class="num">${isFinite(a.tps) ? a.tps.toFixed(1) : "—"}</td>
<td class="num${a.json >= 90 ? " ok" : ""}">${isFinite(a.json) ? a.json.toFixed(0) + "%" : "—"}</td>
<td class="num${a.act >= 85 ? " ok" : ""}">${isFinite(a.act) ? a.act.toFixed(0) + "%" : "—"}</td>
<td class="muted">${obs(a)}</td></tr>`).join("\n");

// ═════════════════════════════════════════════════════════════
const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bot Gambi no Minecraft — Experimento (11/07/2026)</title>
<style>
:root {
  --surface-1:#fcfcfb; --page:#f9f9f7; --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10);
  --series-1:#2a78d6; --series-1-strong:#1c5cab; --series-1-soft:#cde2fb; --series-2:#1baf7a;
}
@media (prefers-color-scheme: dark) { :root {
  --surface-1:#1a1a19; --page:#0d0d0d; --ink:#ffffff; --ink-2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
  --series-1:#3987e5; --series-1-strong:#6da7ec; --series-1-soft:#184f95; --series-2:#199e70;
} }
:root[data-theme="light"] { --surface-1:#fcfcfb; --page:#f9f9f7; --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781; --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10); --series-1:#2a78d6; --series-1-strong:#1c5cab; --series-1-soft:#cde2fb; --series-2:#1baf7a; }
:root[data-theme="dark"] { --surface-1:#1a1a19; --page:#0d0d0d; --ink:#ffffff; --ink-2:#c3c2b7; --muted:#898781; --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10); --series-1:#3987e5; --series-1-strong:#6da7ec; --series-1-soft:#184f95; --series-2:#199e70; }
* { box-sizing:border-box; margin:0; }
body { background:var(--page); color:var(--ink); font-family:system-ui,-apple-system,"Segoe UI",sans-serif; line-height:1.55; }
.wrap { max-width:980px; margin:0 auto; padding:32px 20px 80px; }
header.hero { padding:56px 0 28px; }
.kicker { text-transform:uppercase; letter-spacing:.14em; font-size:13px; font-weight:700; color:var(--series-1); }
h1 { font-size:clamp(30px,5vw,46px); line-height:1.12; margin:10px 0 8px; }
.sub { color:var(--ink-2); font-size:17px; max-width:66ch; }
h2 { font-size:24px; margin:56px 0 6px; }
.lede { color:var(--ink-2); margin-bottom:18px; max-width:70ch; }
.card { background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:20px; }
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-top:20px; }
.tile { background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:14px 16px; }
.tile-v { font-size:30px; font-weight:750; letter-spacing:-.01em; }
.tile-l { color:var(--muted); font-size:13px; margin-top:2px; }
.chart { width:100%; height:auto; display:block; }
.chart .grid { stroke:var(--grid); stroke-width:1; }
.chart .axis { stroke:var(--axis); stroke-width:1; }
.chart .tick { fill:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
.chart .blab { fill:var(--ink-2); font-size:13px; }
.chart .bval { fill:var(--ink); font-size:12.5px; font-weight:650; font-variant-numeric:tabular-nums; }
.chart .bar:hover { opacity:.82; }
.chart .line { fill:none; stroke:var(--series-1); stroke-width:2; stroke-linejoin:round; }
.chart .area { fill:var(--series-1-soft); opacity:.55; }
.chart .ann { stroke:var(--muted); stroke-width:1; stroke-dasharray:3 4; }
.chart .annlab { fill:var(--ink-2); font-size:12px; font-weight:650; }
.chart .hit { fill:transparent; }
.chart .hit:hover { fill:var(--series-1); }
.tl-item { display:grid; grid-template-columns:110px 18px 1fr; gap:0 14px; padding:0 0 26px; position:relative; }
.tl-item:not(:last-child):before { content:""; position:absolute; left:calc(110px + 14px + 8px); top:16px; bottom:-4px; width:2px; background:var(--grid); }
.tl-time { color:var(--muted); font-size:13px; font-weight:650; text-align:right; padding-top:2px; font-variant-numeric:tabular-nums; }
.tl-dot { width:12px; height:12px; border-radius:50%; background:var(--series-1); margin-top:5px; position:relative; z-index:1; box-shadow:0 0 0 3px var(--page); }
.tl-title { font-weight:700; }
.tl-desc { color:var(--ink-2); font-size:15px; margin-top:2px; max-width:66ch; }
table.cmp { width:100%; border-collapse:collapse; font-size:15px; }
table.cmp th, table.cmp td { padding:9px 12px; text-align:left; border-bottom:1px solid var(--grid); }
table.cmp th { color:var(--muted); font-size:12.5px; text-transform:uppercase; letter-spacing:.06em; }
table.cmp .num { font-variant-numeric:tabular-nums; }
table.cmp .ok { color:#0a7a2f; font-weight:650; }
table.cmp .muted { color:var(--muted); }
@media (prefers-color-scheme: dark) { table.cmp .ok { color:#54d97c; } }
:root[data-theme="dark"] table.cmp .ok { color:#54d97c; }
.tablewrap { overflow-x:auto; }
.curios { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; margin-top:16px; }
.curio { background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:16px; }
.curio-t { font-weight:700; margin-bottom:4px; }
.curio-d { color:var(--ink-2); font-size:14.5px; }
code { background:var(--grid); border-radius:4px; padding:1px 5px; font-size:.9em; }
footer { margin-top:64px; color:var(--muted); font-size:13.5px; border-top:1px solid var(--grid); padding-top:16px; }
#tip { position:fixed; pointer-events:none; background:var(--ink); color:var(--page); padding:6px 10px; border-radius:7px; font-size:13px; max-width:340px; opacity:0; transition:opacity .1s; z-index:10; }
#themeBtn { position:fixed; top:14px; right:14px; background:var(--surface-1); color:var(--ink); border:1px solid var(--border); border-radius:20px; padding:6px 14px; font-size:13px; cursor:pointer; }
@media print { #themeBtn { display:none; } }
</style>
</head>
<body>
<button id="themeBtn" onclick="tgl()">◐ tema</button>
<div id="tip"></div>
<div class="wrap">

<header class="hero">
  <div class="kicker">Bot Gambi · Teste da plataforma Minecraft · TCC de Jonathas Vinicius</div>
  <h1>A hora em que os agentes foram jogar Minecraft</h1>
  <p class="sub">O registro próprio que o relatório do 6º Encontro prometeu: entre <strong>~10h e 11h de 11/07/2026</strong>, a turma apontou seus modelos locais para um servidor de Minecraft e cada LLM virou um bot de verdade — percebendo o mundo, decidindo em JSON e executando a ação no pulso seguinte. Este é o experimento central do TCC: <em>os mesmos modelos, hardwares completamente diferentes, uma única pergunta — quem aguenta um loop de 3 segundos?</em></p>
  <div class="tiles"><div class="tile"><div class="tile-v">1.193</div><div class="tile-l">ciclos de decisão registrados</div></div><div class="tile"><div class="tile-v">${nModels}</div><div class="tile-l">modelos diferentes</div></div><div class="tile"><div class="tile-v">${nHw}</div><div class="tile-l">configurações de hardware</div></div><div class="tile"><div class="tile-v">${nSessData}</div><div class="tile-l">sessões com dados (${sessions.length} iniciadas)</div></div><div class="tile"><div class="tile-v">${peak.v}</div><div class="tile-l">ciclos/min no pico (${peak.t})</div></div><div class="tile"><div class="tile-v">${nReqs}</div><div class="tile-l">ordens de jogador (${reqCycles.length} ciclos sob ordem)</div></div><div class="tile"><div class="tile-v">1,1 s</div><div class="tile-l">decisão válida mais rápida (gemma3:1b)</div></div><div class="tile"><div class="tile-v">1</div><div class="tile-l">morte em combate (amarante, 10:50)</div></div></div>
</header>

<h2>O experimento, minuto a minuto</h2>
<p class="lede">Ciclos de decisão gravados no banco por minuto — cada ciclo é uma chamada de LLM que virou (ou tentou virar) uma ação no jogo. O vale no tráfego da Arena entre 10h e 11h era isto aqui.</p>
<div class="card">${lineChart()}</div>

<h2>Linha do tempo</h2>
<div style="margin-top:20px"><div class="tl-item"><div class="tl-time">10:15</div><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">Primeiros bots entram no servidor</div><div class="tl-desc">Carangueijo0 (granite4.1:8b numa GTX 1650) e almir (qwen3.5:4b numa RTX 2050) abrem os trabalhos. O granite levaria 77 segundos por decisão — e mesmo assim terminaria entre os mais obedientes do dia.</div></div></div><div class="tl-item"><div class="tl-time">10:16–10:35</div><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">A guerra das máquinas pequenas</div><div class="tl-desc">shaolin_matador_de_porco tenta <b>7 sessões</b> num notebook de 4 GB de RAM sem registrar um ciclo sequer. Erik insiste 5 vezes com o smollm2:135m e colhe 36 "Bad Gateway". Nem todo hardware quis cooperar.</div></div></div><div class="tl-item"><div class="tl-time">10:36–10:40</div><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">O pelotão principal chega</div><div class="tl-desc">almir (agora com gemma3:1b), GREC (llama3.2 num M2), gabs, FlavinduPneu, hatsune_miku e Bardo entram quase juntos — o tráfego salta para ${peak.v} ciclos/min às ${peak.t}.</div></div></div><div class="tl-item"><div class="tl-time">${firstReq}</div><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">jvras58 começa a dar ordens</div><div class="tl-desc">Seis pedidos via chat ("me segue", "GREC coleta madeira", "calegario pegue bife"…) ficam ativos por até 5 ciclos no prompt de cada bot — o teste de obediência do experimento.</div></div></div><div class="tl-item"><div class="tl-time">${hhmm(death.created_at)}</div><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">A morte do amarante ☠️</div><div class="tl-desc">No ciclo 15 da sessão do gemma3:4b, a vida do amarante chega a zero — o único óbito do experimento. O bot renasce e o modelo segue decidindo como se nada tivesse acontecido.</div></div></div><div class="tl-item"><div class="tl-time">11:00–11:03</div><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">Últimas cargas nas máquinas de 4 GB</div><div class="tl-desc">negromonte arranca <b>1 ciclo</b> do qwen3.5:0.8b (37 s) e 1 do lfm2.5-thinking (14 s) num notebook de 4 GB — os dois estouram o orçamento de tokens, mas provam que rodar, roda.</div></div></div><div class="tl-item"><div class="tl-time">11:06</div><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">Último ciclo — todo mundo pro World</div><div class="tl-desc">O experimento encerra e a turma volta para a Gambiarra Arena, onde a partida de World começa às 11:10. Almir, que aqui rodou o bot mais preciso do dia (96% de ações OK), lá devoraria 93 comidas.</div></div></div></div>

<h2>⏱️ Quem aguenta o loop de 3 segundos?</h2>
<p class="lede">Latência mediana por decisão nas configurações que produziram JSON válido (≥75%). O loop do bot pulsa a cada 3 s — só o gemma3:1b, em GPU dedicada ou Apple Silicon, fica do lado certo da linha.</p>
<div class="card">${latChart}</div>

<h2>⚡ Velocidade bruta: tokens por segundo</h2>
<p class="lede">Mediana de tokens/s medida no hub, todas as configurações com 20+ ciclos — incluindo os modelos "thinking" (🤔), cujo desempenho vale mesmo com as respostas descartadas. O mesmo gemma3:1b rende 60 tok/s no M3 Pro e 53 na RTX 2050; o granite4.1:8b, que não cabe nos 4 GB da GTX 1650, se arrasta a 2 tok/s.</p>
<div class="card">${tpsChart}</div>

<h2>📡 Desempenho em detalhe: o bot mede, o hub confirma</h2>
<p class="lede">Cada ciclo é cronometrado em dois pontos: no bot (<code>llm_response_time_ms</code>, que inclui rede e fila) e dentro do hub (<code>hub_duration_ms</code> e <code>hub_ttft_ms</code>, medidos no evento <code>llm.complete</code>, sem ruído de rede). A diferença entre os dois é o custo da infraestrutura — <b>mediana de 90 ms (p95: 362 ms)</b>, ou seja, a latência é quase toda inferência mesmo: o hub não é o gargalo. Tokens/s calculado nas duas pontas concorda; cada decisão consome ~1.300 tokens de contexto de entrada. Valores são medianas (p50).</p>
<div class="card tablewrap"><table class="cmp"><tr><th>Modelo</th><th>Hardware</th><th>Ciclos</th><th>Resposta (bot)</th><th>Duração (hub)</th><th>Overhead</th><th>TTFT (hub)</th><th>tok/s (bot)</th><th>tok/s (hub)</th><th>Tok. entrada</th><th>Tok. saída</th></tr>
${perfRows}
</table></div>

<h2>📋 A tabela completa</h2>
<p class="lede">Todas as configurações com 10+ ciclos. JSON válido mede aderência ao formato; ação OK mede se o comando decidido executou no jogo.</p>
<div class="card tablewrap"><table class="cmp"><tr><th>Modelo</th><th>Hardware</th><th>Ciclos</th><th>p50</th><th>tok/s</th><th>JSON válido</th><th>Ação OK</th><th>Observação</th></tr>
${tableRows}
</table></div>

<h2>🤔 A armadilha dos 256 tokens</h2>
<p class="lede">O achado mais importante do dia não estava no plano: <b>${emptyResp} ciclos voltaram com resposta vazia</b> — todos com exatamente 256 tokens de saída. Os modelos com raciocínio explícito (qwen3.5, gemma4:12b) gastaram o orçamento inteiro de <code>LLM_MAX_OUTPUT_TOKENS=256</code> pensando e nunca chegaram a falar. Sob restrição de tempo real, o "pensar antes de agir" custou a ação inteira. As métricas de velocidade deles valem; as de qualidade viraram um retrato do trade-off, não do modelo.</p>

<h2>🧾 Conformidade: quem fala JSON direito?</h2>
<p class="lede">Por modelo, sobre os ciclos em que o hub respondeu (erros de infraestrutura contados à parte). "Reparado" são respostas que chegaram como JSON quebrado e o <code>jsonrepair</code> salvou — elas contam como válidas. O contraste é brutal: ou o modelo acerta o formato quase sempre, ou nunca.</p>
<div class="card tablewrap"><table class="cmp"><tr><th>Modelo</th><th>Ciclos</th><th>Erro de hub</th><th>JSON válido</th><th>Reparado</th><th>Falha de parse</th></tr>
${confRows}
</table></div>

<h2>🫡 O teste de obediência</h2>
<p class="lede">Cada ordem do jvras58 ficou visível no prompt por até 5 ciclos. O placar moral: <b>obediência não correlacionou com velocidade.</b></p>
<div class="card tablewrap"><table class="cmp"><tr><th>Ordem</th><th>Quem obedeceu</th><th>Quem ignorou</th></tr>
<tr><td>"me segue"</td><td class="num ok">Carangueijo0 (SEGUIR ×3, a 77 s por decisão), Bardo, amarante</td><td class="num">almir — o bot mais rápido do dia preferiu EXPLORAR ×20</td></tr>
<tr><td>"GREC coleta madeira"</td><td class="num ok">Bardo, amarante e Carangueijo0 saíram coletando</td><td class="num">o próprio GREC, que ficou de OLHAR</td></tr>
<tr><td>"calegario pegue bife"</td><td class="num">calegario tentou (EXPLORAR → ANDAR → PAROU) — não havia bife</td><td class="num">almir, de novo</td></tr>
<tr><td>"GREC va seguir sua vida"</td><td class="num">Bardo e Carangueijo0 entenderam <i>literalmente</i>: SEGUIR ✕ 4</td><td class="num muted">a ironia passou batida por todos os modelos</td></tr>
</table></div>

<h2>🎮 O que os bots escolheram fazer</h2>
<p class="lede">Distribuição das ${totalValid} ações válidas (os ${emptyResp + 78} ciclos sem resposta utilizável caíram no fallback EXPLORAR, fora desta contagem). Um dia pacífico: 1 ATACAR contra ${actions[0][1]} EXPLORAR.</p>
<div class="card">${actChart}</div>

<h2>🎲 Variedade de comportamento: entropia de Shannon</h2>
<p class="lede">A entropia da distribuição de ações mede a variedade do comportamento de cada modelo, em bits: <b>0</b> = escolheu sempre a mesma ação; <b>3,32</b> = usou as 10 ações por igual. Calculada sobre as ações válidas dos modelos com 20+ decisões. Nem pouca nem muita entropia é "melhor" — mas um agente que só sabe EXPLORAR não está decidindo, está repetindo.</p>
<div class="card">${entChart}</div>
<p class="lede" style="margin-top:22px">O raio-x completo da qualidade de decisão por modelo:</p>
<div class="card tablewrap"><table class="cmp"><tr><th>Modelo</th><th>Ações válidas</th><th>Ação OK</th><th>Execução p50</th><th>Ação favorita</th><th>Entropia (bits)</th></tr>
${qualRows}
</table></div>

<h2>Curiosidades</h2>
<div class="curios"><div class="curio"><div class="curio-t">A tartaruga obediente</div><div class="curio-d"><b>Carangueijo0</b> (granite4.1:8b, 77 s por decisão) foi o único a responder "me segue" com SEGUIR três vezes seguidas. O bot mais lento do dia foi o mais leal — e ainda manteve 100% de JSON válido.</div></div><div class="curio"><div class="curio-t">O rebelde veloz</div><div class="curio-d"><b>almir</b> (gemma3:1b, RTX 2050) fez a maior sessão do dia — 187 ciclos, 96% de ações OK — e ignorou solenemente todas as ordens do jvras58. Rápido, correto e do contra.</div></div><div class="curio"><div class="curio-t">"Vá seguir sua vida"</div><div class="curio-d">A ordem irônica para o GREC parar de seguir foi lida ao pé da letra: Bardo e Carangueijo0 viram a palavra "seguir" e... SEGUIRAM. Sarcasmo ainda não cabe em 3 bilhões de parâmetros.</div></div><div class="curio"><div class="curio-t">O jsonrepair pagou o aluguel</div><div class="curio-d">${repaired} respostas chegaram como JSON quebrado e foram consertadas em voo pela biblioteca — ${repaired} ações que existiram por causa de um <code>}</code> que o modelo esqueceu.</div></div><div class="curio"><div class="curio-t">116 segundos para pensar</div><div class="curio-d">O ciclo mais longo do dia: qwen3.5:4b rodando em CPU levou 1 min 56 s para... estourar os 256 tokens e não dizer nada. O mais rápido com resposta válida: gemma3:1b, 1,1 s.</div></div><div class="curio"><div class="curio-t">Dupla jornada</div><div class="curio-d">Vários bots daqui jogaram o World logo depois — e o placar quase se repetiu: Almir dominou os dois, shaolin (que aqui não conseguiu registrar 1 ciclo no notebook de 4 GB) fez 75 comidas lá. Hardware ruim não é destino.</div></div></div>

<footer>
  <p><strong>Fontes:</strong> tabelas <code>sessions</code>, <code>participant_snapshots</code> e <code>cycle_responses</code> do Supabase do projeto (1.193 ciclos, 11/07/2026, sala TCVGNU), exportadas em <code>raw/</code> e processadas por <code>gera-relatorio.ts</code>. Horários em UTC−3. Métricas detalhadas em <code>metricas/</code> e interpretação em <code>ANALISE.md</code>. Complementa o relatório do 6º Encontro da Gambiarra Arena. 🤖⛏️</p>
</footer>
</div>

<script>
const tip = document.getElementById('tip');
document.addEventListener('mousemove', e => {
  const t = e.target.closest('[data-tip]');
  if (t) {
    tip.textContent = t.dataset.tip; tip.style.opacity = 1;
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 10);
    tip.style.left = x + 'px'; tip.style.top = (e.clientY + 16) + 'px';
  } else tip.style.opacity = 0;
});
function tgl() {
  const r = document.documentElement;
  const cur = r.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  r.dataset.theme = cur === 'dark' ? 'light' : 'dark';
}
</script>
</body>
</html>`;

const out = join(DIR, "relatorio-minecraft-2026-07-11.html");
writeFileSync(out, html, "utf8");
console.log(`✔ ${out} (${(html.length / 1024).toFixed(0)} KB)`);

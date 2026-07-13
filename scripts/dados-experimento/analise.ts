// Análise das métricas do experimento (dados do Supabase)
// Uso: bun run analise.ts
// Gera CSVs em ./metricas e um resumo em RESULTADOS.md

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const RAW = join(import.meta.dir, "raw");
const OUT = join(import.meta.dir, "metricas");
mkdirSync(OUT, { recursive: true });

type Cycle = {
  id: string; created_at: string; session_id: string; cycle_number: number;
  participant_id: string; model_name: string;
  llm_response_time_ms: number | null;
  llm_input_tokens: number | null; llm_output_tokens: number | null;
  llm_tokens_per_second: number | null;
  hub_ttft_ms: number | null; hub_duration_ms: number | null;
  hub_input_tokens: number | null; hub_output_tokens: number | null;
  hub_tokens_per_second: number | null;
  llm_raw_length: number | null; llm_json_repaired: boolean | null;
  llm_parse_error: boolean | null; llm_error: string | null;
  action: string | null; action_success: boolean | null;
  action_execution_time_ms: number | null; action_error: string | null;
  chat_request: string | null; chat_request_player: string | null;
};

type Snapshot = {
  session_id: string; participant_id: string; nickname: string;
  model_name: string; cpu: string | null; ram: string | null;
  gpu: string | null; vram: string | null; os: string | null;
};

type Session = {
  id: string; room_code: string; bot_username: string; participant_id: string | null;
  total_cycles: number | null; started_at: string; ended_at: string | null;
};

const cycles: Cycle[] = [
  ...JSON.parse(readFileSync(join(RAW, "cycles_p1.json"), "utf8")),
  ...JSON.parse(readFileSync(join(RAW, "cycles_p2.json"), "utf8")),
];
const snapshots: Snapshot[] = JSON.parse(readFileSync(join(RAW, "snapshots.json"), "utf8"));
const sessions: Session[] = JSON.parse(readFileSync(join(RAW, "sessions.json"), "utf8"));

// ── helpers ──────────────────────────────────────────────────
const nums = (xs: (number | null | undefined)[]) =>
  xs.filter((x): x is number => typeof x === "number" && isFinite(x));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (xs: number[], p: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const std = (xs: number[]) => {
  if (xs.length < 2) return NaN;
  const m = avg(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const r1 = (x: number) => (isNaN(x) ? "" : x.toFixed(1));
const r2 = (x: number) => (isNaN(x) ? "" : x.toFixed(2));
const csvEsc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const writeCsv = (name: string, header: string[], rows: unknown[][]) => {
  const txt = [header.join(","), ...rows.map((r) => r.map(csvEsc).join(","))].join("\n");
  writeFileSync(join(OUT, name), txt, "utf8");
  console.log(`✔ metricas/${name} (${rows.length} linhas)`);
};

// specs por sessão+participante (fallback: por participante)
const specByKey = new Map<string, Snapshot>();
const specByParticipant = new Map<string, Snapshot>();
for (const s of snapshots) {
  specByKey.set(`${s.session_id}|${s.participant_id}`, s);
  specByParticipant.set(s.participant_id, s);
}
const specOf = (c: Cycle) =>
  specByKey.get(`${c.session_id}|${c.participant_id}`) ?? specByParticipant.get(c.participant_id);

const hwLabel = (s?: Snapshot) => {
  if (!s) return "desconhecido";
  const gpu = s.gpu && s.gpu !== "Parsec Virtual Display Adapter" ? s.gpu : null;
  return `${gpu ?? "CPU only"} / ${s.ram ?? "?"}GB RAM`;
};

// ── agregação genérica ───────────────────────────────────────
function aggregate(group: Cycle[]) {
  const lat = nums(group.map((c) => c.llm_response_time_ms));
  const ttft = nums(group.map((c) => c.hub_ttft_ms));
  const tps = nums(group.map((c) => c.hub_tokens_per_second ?? c.llm_tokens_per_second));
  const inTok = nums(group.map((c) => c.hub_input_tokens ?? c.llm_input_tokens));
  const outTok = nums(group.map((c) => c.hub_output_tokens ?? c.llm_output_tokens));
  const n = group.length;
  const errors = group.filter((c) => c.llm_error != null).length;
  const answered = group.filter((c) => c.llm_error == null);
  const parseOk = answered.filter((c) => !c.llm_parse_error).length;
  const repaired = answered.filter((c) => c.llm_json_repaired).length;
  const executed = group.filter((c) => c.action_success != null);
  const succeeded = executed.filter((c) => c.action_success).length;
  return {
    n, errors,
    lat_avg: avg(lat), lat_p50: pct(lat, 0.5), lat_p95: pct(lat, 0.95), lat_std: std(lat),
    ttft_avg: avg(ttft), ttft_p50: pct(ttft, 0.5),
    tps_avg: avg(tps), tps_p50: pct(tps, 0.5),
    in_avg: avg(inTok), out_avg: avg(outTok),
    valid_json_pct: answered.length ? (100 * parseOk) / answered.length : NaN,
    repaired_pct: answered.length ? (100 * repaired) / answered.length : NaN,
    action_success_pct: executed.length ? (100 * succeeded) / executed.length : NaN,
    error_pct: n ? (100 * errors) / n : NaN,
  };
}

const aggRow = (a: ReturnType<typeof aggregate>) => [
  a.n, r1(a.lat_avg), r1(a.lat_p50), r1(a.lat_p95), r1(a.lat_std),
  r1(a.ttft_avg), r1(a.ttft_p50), r2(a.tps_avg), r2(a.tps_p50),
  r1(a.in_avg), r1(a.out_avg),
  r1(a.valid_json_pct), r1(a.repaired_pct), r1(a.action_success_pct), r1(a.error_pct),
];
const aggHeader = [
  "ciclos", "latencia_media_ms", "latencia_p50_ms", "latencia_p95_ms", "latencia_dp_ms",
  "ttft_medio_ms", "ttft_p50_ms", "tokens_s_medio", "tokens_s_p50",
  "tokens_entrada_medio", "tokens_saida_medio",
  "json_valido_pct", "json_reparado_pct", "acao_sucesso_pct", "erro_llm_pct",
];

// ── 1. por modelo × hardware ─────────────────────────────────
const byModelHw = new Map<string, Cycle[]>();
for (const c of cycles) {
  const key = `${c.model_name}|${hwLabel(specOf(c))}`;
  (byModelHw.get(key) ?? byModelHw.set(key, []).get(key)!).push(c);
}
writeCsv(
  "por_modelo_hardware.csv",
  ["modelo", "hardware", ...aggHeader],
  [...byModelHw.entries()]
    .map(([k, g]) => ({ k, g, a: aggregate(g) }))
    .sort((x, y) => y.g.length - x.g.length)
    .map(({ k, a }) => [...k.split("|"), ...aggRow(a)]),
);

// ── 2. por modelo (agregando hardware) ───────────────────────
const byModel = new Map<string, Cycle[]>();
for (const c of cycles) {
  (byModel.get(c.model_name) ?? byModel.set(c.model_name, []).get(c.model_name)!).push(c);
}
writeCsv(
  "por_modelo.csv",
  ["modelo", ...aggHeader],
  [...byModel.entries()]
    .sort((x, y) => y[1].length - x[1].length)
    .map(([m, g]) => [m, ...aggRow(aggregate(g))]),
);

// ── 3. por sessão ────────────────────────────────────────────
const bySession = new Map<string, Cycle[]>();
for (const c of cycles) {
  (bySession.get(c.session_id) ?? bySession.set(c.session_id, []).get(c.session_id)!).push(c);
}
const sessById = new Map(sessions.map((s) => [s.id, s]));
writeCsv(
  "por_sessao.csv",
  ["session_id", "bot", "modelo", "hardware", "inicio", "fim", ...aggHeader],
  [...bySession.entries()]
    .map(([id, g]) => {
      const s = sessById.get(id);
      const sp = specOf(g[0]);
      return [id, s?.bot_username ?? "", g[0].model_name, hwLabel(sp),
        s?.started_at ?? "", s?.ended_at ?? "", ...aggRow(aggregate(g))];
    })
    .sort((a, b) => String(a[4]).localeCompare(String(b[4]))),
);

// ── 4. distribuição de ações por modelo ──────────────────────
const actionCount = new Map<string, Map<string, number>>();
const allActions = new Set<string>();
for (const c of cycles) {
  const act = c.action ?? (c.llm_parse_error ? "(parse_error)" : "(nenhuma)");
  allActions.add(act);
  const m = actionCount.get(c.model_name) ?? actionCount.set(c.model_name, new Map()).get(c.model_name)!;
  m.set(act, (m.get(act) ?? 0) + 1);
}
const actionCols = [...allActions].sort();
writeCsv(
  "distribuicao_acoes.csv",
  ["modelo", "total", ...actionCols],
  [...actionCount.entries()]
    .sort((x, y) => (byModel.get(y[0])?.length ?? 0) - (byModel.get(x[0])?.length ?? 0))
    .map(([m, counts]) => {
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      return [m, total, ...actionCols.map((a) => counts.get(a) ?? 0)];
    }),
);

// ── 5. pedidos de jogador (obediência — base qualitativa) ────
writeCsv(
  "pedidos_jogador.csv",
  ["modelo", "session_id", "ciclo", "jogador", "pedido", "acao", "acao_sucesso"],
  cycles
    .filter((c) => c.chat_request != null)
    .map((c) => [c.model_name, c.session_id, c.cycle_number, c.chat_request_player,
      c.chat_request, c.action, c.action_success]),
);

// ── 6. erros mais comuns por modelo ──────────────────────────
const errCount = new Map<string, number>();
for (const c of cycles) {
  if (c.llm_error) {
    const key = `${c.model_name}|${c.llm_error.slice(0, 120)}`;
    errCount.set(key, (errCount.get(key) ?? 0) + 1);
  }
  if (c.action_error) {
    const key = `${c.model_name}|[ação] ${c.action_error.slice(0, 120)}`;
    errCount.set(key, (errCount.get(key) ?? 0) + 1);
  }
}
writeCsv(
  "erros.csv",
  ["modelo", "erro", "ocorrencias"],
  [...errCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => [...k.split("|"), n]),
);

// ── 7. desempenho detalhado bot × hub (p50 por modelo × hardware) ─
writeCsv(
  "desempenho_detalhado.csv",
  ["modelo", "hardware", "ciclos",
    "resposta_bot_p50_ms", "duracao_hub_p50_ms", "overhead_infra_p50_ms", "ttft_hub_p50_ms",
    "tokens_s_bot_p50", "tokens_s_hub_p50", "tokens_entrada_p50", "tokens_saida_p50"],
  [...byModelHw.entries()]
    .sort((x, y) => y[1].length - x[1].length)
    .map(([k, g]) => {
      const overhead = nums(g.filter((c) => c.llm_response_time_ms != null && c.hub_duration_ms != null)
        .map((c) => (c.llm_response_time_ms as number) - (c.hub_duration_ms as number)));
      return [...k.split("|"), g.length,
        r1(pct(nums(g.map((c) => c.llm_response_time_ms)), 0.5)),
        r1(pct(nums(g.map((c) => c.hub_duration_ms)), 0.5)),
        r1(pct(overhead, 0.5)),
        r1(pct(nums(g.map((c) => c.hub_ttft_ms)), 0.5)),
        r2(pct(nums(g.map((c) => c.llm_tokens_per_second)), 0.5)),
        r2(pct(nums(g.map((c) => c.hub_tokens_per_second)), 0.5)),
        r1(pct(nums(g.map((c) => c.hub_input_tokens ?? c.llm_input_tokens)), 0.5)),
        r1(pct(nums(g.map((c) => c.hub_output_tokens ?? c.llm_output_tokens)), 0.5))];
    }),
);

// ── 8. conformidade por modelo ───────────────────────────────
writeCsv(
  "conformidade.csv",
  ["modelo", "ciclos", "erro_hub_pct", "json_valido_pct", "reparado_pct", "falha_parse_pct"],
  [...byModel.entries()]
    .sort((x, y) => y[1].length - x[1].length)
    .map(([m, g]) => {
      const answered = g.filter((c) => c.llm_error == null);
      const valid = answered.filter((c) => !c.llm_parse_error).length;
      const rep = answered.filter((c) => c.llm_json_repaired).length;
      const p = (x: number) => (answered.length ? r1((100 * x) / answered.length) : "");
      return [m, g.length, r1((100 * g.filter((c) => c.llm_error != null).length) / g.length),
        p(valid), p(rep), p(answered.length - valid)];
    }),
);

// ── 9. qualidade de decisão por modelo (inclui entropia de Shannon) ─
writeCsv(
  "qualidade_decisao.csv",
  ["modelo", "acoes_validas", "acao_sucesso_pct", "execucao_p50_ms", "acao_favorita", "favorita_pct", "entropia_bits"],
  [...byModel.entries()]
    .sort((x, y) => y[1].length - x[1].length)
    .map(([m, g]) => {
      const acts = g.filter((c) => c.action != null);
      const counts = new Map<string, number>();
      for (const c of acts) counts.set(c.action!, (counts.get(c.action!) ?? 0) + 1);
      let entropy = NaN, fav = "", favPct = NaN;
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
      return [m, acts.length,
        executed.length ? r1((100 * executed.filter((c) => c.action_success).length) / executed.length) : "",
        r1(pct(nums(g.map((c) => c.action_execution_time_ms)), 0.5)),
        fav, r1(favPct), isNaN(entropy) ? "" : entropy.toFixed(4)];
    }),
);

// ── resumo em markdown ───────────────────────────────────────
const totalSessions = new Set(cycles.map((c) => c.session_id)).size;
const models = [...byModel.keys()];
const machines = new Set(snapshots.map((s) => hwLabel(s))).size;

let md = `# Resultados do experimento — ${cycles[0]?.created_at.slice(0, 10)}\n\n`;
md += `- **Ciclos registrados:** ${cycles.length}\n`;
md += `- **Sessões com dados:** ${totalSessions} (de ${sessions.length} iniciadas)\n`;
md += `- **Modelos:** ${models.length} (${models.join(", ")})\n`;
md += `- **Configurações de hardware:** ${machines}\n\n`;
md += `## Métricas por modelo × hardware (ordenado por nº de ciclos)\n\n`;
md += `| Modelo | Hardware | Ciclos | Lat. média (ms) | p50 | p95 | TTFT p50 (ms) | tok/s p50 | JSON válido % | Ação OK % | Erro LLM % |\n`;
md += `|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const { k, g, a } of [...byModelHw.entries()]
  .map(([k, g]) => ({ k, g, a: aggregate(g) }))
  .sort((x, y) => y.g.length - x.g.length)) {
  const [model, hw] = k.split("|");
  md += `| ${model} | ${hw} | ${a.n} | ${r1(a.lat_avg)} | ${r1(a.lat_p50)} | ${r1(a.lat_p95)} | ${r1(a.ttft_p50)} | ${r2(a.tps_p50)} | ${r1(a.valid_json_pct)} | ${r1(a.action_success_pct)} | ${r1(a.error_pct)} |\n`;
}
md += `\nArquivos detalhados em \`metricas/\`.\n`;
writeFileSync(join(import.meta.dir, "RESULTADOS.md"), md, "utf8");
console.log("✔ RESULTADOS.md");

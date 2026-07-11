-- ============================================================
-- Schema para coleta de dados do experimento
-- Três tabelas: sessions, participant_snapshots, cycle_responses
-- Cada bot (1 LLM) gera 1 linha por ciclo em cycle_responses
-- ============================================================

-- 1. Metadados de cada sessão (1 sessão = 1 execução do bot)
CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  room_code text NOT NULL,
  bot_username text NOT NULL,
  participant_id text,
  total_cycles integer,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

-- 2. Snapshot das specs da máquina no início da sessão
--    Capturado via gambi.listParticipants() que retorna specs (CPU, RAM, GPU)
CREATE TABLE participant_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id),
  participant_id text NOT NULL,
  nickname text NOT NULL,
  model_name text NOT NULL,
  endpoint text,
  -- Specs da máquina (preenchidas automaticamente pelo Gambi CLI)
  cpu text,
  ram text,
  gpu text,
  vram text,
  os text,
  -- JSON completo das specs caso haja campos extras
  specs_raw jsonb,
  captured_at timestamptz DEFAULT now(),
  UNIQUE(session_id, participant_id)
);

-- 3. Uma linha por ciclo por bot (~3s cada)
CREATE TABLE cycle_responses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),

  -- ─── Sessão & Ciclo ──────────────────────────────────────
  session_id uuid NOT NULL REFERENCES sessions(id),
  cycle_number integer NOT NULL,
  room_code text NOT NULL,

  -- ─── Participante ────────────────────────────────────────
  participant_id text NOT NULL,
  participant_nickname text NOT NULL,
  model_name text NOT NULL,

  -- ─── Resposta LLM ────────────────────────────────────────
  llm_response_time_ms numeric,

  -- ─── Métricas de inferência — medidas no bot (AI SDK usage) ─
  llm_ttft_ms numeric,            -- sempre NULL fora de streaming
  llm_input_tokens integer,
  llm_output_tokens integer,
  llm_total_tokens integer,
  llm_tokens_per_second numeric,

  -- ─── Métricas de inferência — medidas no hub (evento SSE llm.complete) ─
  hub_ttft_ms numeric,
  hub_duration_ms numeric,
  hub_input_tokens integer,
  hub_output_tokens integer,
  hub_total_tokens integer,
  hub_tokens_per_second numeric,

  llm_raw_length integer,
  llm_json_repaired boolean DEFAULT false,
  llm_parse_error boolean DEFAULT false,
  llm_error text,

  -- ─── Ação Parseada ───────────────────────────────────────
  action text,
  reasoning text,
  direction text,
  target text,
  content text,
  raw_response text,

  -- ─── Execução ────────────────────────────────────────────
  action_success boolean,
  action_execution_time_ms numeric,
  action_error text,

  -- ─── Prompt enviado (contexto + memória deste ciclo) ─────
  prompt_sent text,

  -- ─── Pedido de jogador via chat ──────────────────────────
  -- Preenchidos quando havia um "PEDIDO DE JOGADOR" em destaque no
  -- prompt deste ciclo (mensagem de humano no chat, dura até 5 ciclos).
  -- Base para métrica de obediência: pedido ativo × ação escolhida.
  chat_request text,
  chat_request_player text,

  -- ─── Contexto do Jogo ────────────────────────────────────
  health numeric,
  food numeric,
  pos_x numeric,
  pos_y numeric,
  pos_z numeric,
  biome text,
  weather text,
  time_of_day integer,
  is_moving boolean,
  nearby_players integer,
  nearby_entities integer,
  nearby_blocks integer,
  inventory_items integer
);

-- ─── Índices para consultas comuns ─────────────────────────
CREATE INDEX idx_cr_session ON cycle_responses(session_id);
CREATE INDEX idx_cr_cycle ON cycle_responses(session_id, cycle_number);
CREATE INDEX idx_cr_participant ON cycle_responses(participant_id);
CREATE INDEX idx_cr_model ON cycle_responses(model_name);
CREATE INDEX idx_cr_action ON cycle_responses(action);
CREATE INDEX idx_cr_created ON cycle_responses(created_at);
CREATE INDEX idx_cr_chat_request ON cycle_responses(session_id, cycle_number) WHERE chat_request IS NOT NULL;
CREATE INDEX idx_ps_session ON participant_snapshots(session_id);

-- ─── RLS (acesso anônimo para o bot enviar dados) ─────────
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_sessions" ON sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select_sessions" ON sessions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_sessions" ON sessions FOR UPDATE TO anon USING (true);

CREATE POLICY "anon_insert_snapshots" ON participant_snapshots FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select_snapshots" ON participant_snapshots FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_responses" ON cycle_responses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select_responses" ON cycle_responses FOR SELECT TO anon USING (true);

-- ─── Views úteis para análise ──────────────────────────────

-- Latência média por modelo × hardware
CREATE VIEW v_latency_by_setup AS
SELECT
  cr.model_name,
  ps.gpu,
  ps.vram,
  ps.ram,
  COUNT(*) AS total_cycles,
  ROUND(AVG(cr.llm_response_time_ms)::numeric, 1) AS avg_latency_ms,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cr.llm_response_time_ms)::numeric, 1) AS p50_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY cr.llm_response_time_ms)::numeric, 1) AS p95_ms,
  ROUND(AVG(CASE WHEN cr.llm_parse_error THEN 0 ELSE 1 END)::numeric * 100, 1) AS valid_json_pct,
  ROUND(AVG(CASE WHEN cr.action_success THEN 1 ELSE 0 END)::numeric * 100, 1) AS action_success_pct
FROM cycle_responses cr
JOIN participant_snapshots ps
  ON cr.session_id = ps.session_id
  AND cr.participant_id = ps.participant_id
WHERE cr.llm_error IS NULL
GROUP BY cr.model_name, ps.gpu, ps.vram, ps.ram;

-- Ciclos com pedido de jogador ativo — base para medir obediência
-- (pedido × ação escolhida × quantos ciclos desde o pedido)
CREATE VIEW v_chat_requests AS
SELECT
  cr.model_name,
  cr.participant_id,
  cr.session_id,
  cr.cycle_number,
  cr.chat_request_player,
  cr.chat_request,
  cr.action,
  cr.reasoning,
  cr.action_success,
  cr.llm_response_time_ms,
  cr.created_at
FROM cycle_responses cr
WHERE cr.chat_request IS NOT NULL
ORDER BY cr.session_id, cr.cycle_number;

-- Resumo por sessão (útil pra comparar execuções)
CREATE VIEW v_session_summary AS
SELECT
  s.id AS session_id,
  s.room_code,
  s.bot_username,
  s.participant_id,
  ps.model_name,
  ps.gpu,
  ps.ram,
  s.total_cycles,
  s.started_at,
  s.ended_at,
  ROUND(AVG(cr.llm_response_time_ms)::numeric, 1) AS avg_latency_ms,
  ROUND(AVG(CASE WHEN cr.llm_parse_error THEN 0 ELSE 1 END)::numeric * 100, 1) AS valid_json_pct,
  ROUND(AVG(CASE WHEN cr.action_success THEN 1 ELSE 0 END)::numeric * 100, 1) AS action_success_pct,
  COUNT(cr.id) AS logged_cycles
FROM sessions s
LEFT JOIN participant_snapshots ps
  ON s.id = ps.session_id
LEFT JOIN cycle_responses cr
  ON s.id = cr.session_id
GROUP BY s.id, s.room_code, s.bot_username, s.participant_id,
         ps.model_name, ps.gpu, ps.ram, s.total_cycles, s.started_at, s.ended_at;

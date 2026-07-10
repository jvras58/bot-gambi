-- Migração: colunas de pedido de jogador via chat
-- Rode este SQL no SQL Editor do Supabase se o banco JÁ foi criado
-- com o schema.sql antigo. (Bancos novos: use só o schema.sql.)

ALTER TABLE cycle_responses ADD COLUMN chat_request text;
ALTER TABLE cycle_responses ADD COLUMN chat_request_player text;

CREATE INDEX idx_cr_chat_request ON cycle_responses(session_id, cycle_number) WHERE chat_request IS NOT NULL;

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

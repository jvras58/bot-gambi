#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

ROOM_NAME="Experimento 1"
HUB_PORT="3000"
HUB_URL=""
PARTICIPANT_ID="${GAMBIARRA_PARTICIPANT_ID:-}"
MODEL="${GAMBIARRA_MODEL:-}"
MDNS_FLAG="--mdns"

print_usage() {
  cat <<'EOF'
Uso:
  bun run local -- --participant-id joao-1 --model llama3.2:latest

Opcoes:
  --participant-id, -p  ID/nome do participante e do bot no Minecraft
  --model, -m           Nome exato do modelo, igual aparece no `ollama list`
  --name, -n            Nome da sala (default: "Experimento 1")
  --hub-port            Porta do hub local (default: 3000)
  --hub                 URL do hub (default: http://localhost:<hub-port>)
  --no-mdns             Inicia o hub sem --mdns
  --help, -h            Mostra esta ajuda

Exemplo:
  bun run local -- -p joao-1 -m llama3.2:latest
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --participant-id|-p)
      PARTICIPANT_ID="${2:-}"
      shift 2
      ;;
    --model|-m)
      MODEL="${2:-}"
      shift 2
      ;;
    --name|-n)
      ROOM_NAME="${2:-}"
      shift 2
      ;;
    --hub-port)
      HUB_PORT="${2:-}"
      shift 2
      ;;
    --hub)
      HUB_URL="${2:-}"
      shift 2
      ;;
    --no-mdns)
      MDNS_FLAG=""
      shift
      ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    *)
      echo "Opcao desconhecida: $1" >&2
      print_usage
      exit 1
      ;;
  esac
done

if [[ -z "$HUB_URL" ]]; then
  HUB_URL="http://localhost:${HUB_PORT}"
fi

if [[ -z "$PARTICIPANT_ID" ]]; then
  echo "Erro: informe --participant-id, exemplo: --participant-id joao-1" >&2
  exit 1
fi

if [[ -z "$MODEL" || "$MODEL" == "*" ]]; then
  echo "Erro: informe --model com o nome exato do modelo, exemplo: --model llama3.2:latest" >&2
  exit 1
fi

if ! command -v gambi >/dev/null 2>&1; then
  echo "Comando 'gambi' nao encontrado. Instalando..."
  curl -fsSL https://raw.githubusercontent.com/arthurbm/gambi/main/scripts/install.sh | bash
  hash -r 2>/dev/null || true
  if ! command -v gambi >/dev/null 2>&1; then
    echo "Erro: falha ao instalar 'gambi'. Instale manualmente: https://www.gambi.sh/guides/quickstart/" >&2
    exit 1
  fi
fi

if command -v bun >/dev/null 2>&1; then
  BUN_BIN="bun"
elif [[ -x "$HOME/.bun/bin/bun" ]]; then
  BUN_BIN="$HOME/.bun/bin/bun"
  export PATH="$HOME/.bun/bin:$PATH"
else
  echo "Comando 'bun' nao encontrado. Instalando..."
  curl -fsSL https://bun.sh/install | bash
  if command -v bun >/dev/null 2>&1; then
    BUN_BIN="bun"
  elif [[ -x "$HOME/.bun/bin/bun" ]]; then
    BUN_BIN="$HOME/.bun/bin/bun"
    export PATH="$HOME/.bun/bin:$PATH"
  else
    echo "Erro: falha ao instalar o Bun. Instale manualmente: https://bun.sh" >&2
    exit 1
  fi
fi

mkdir -p .tmp
HUB_LOG=".tmp/gambi-hub.log"
PARTICIPANT_LOG=".tmp/gambi-participant.log"
MEMORY_LOG=".tmp/memory.log"
BOT_LOG=".tmp/bot.log"
HUB_PID=""
PARTICIPANT_PID=""
MEMORY_PID=""

cleanup() {
  local exit_code=$?

  if [[ -n "$PARTICIPANT_PID" ]] && kill -0 "$PARTICIPANT_PID" >/dev/null 2>&1; then
    kill "$PARTICIPANT_PID" >/dev/null 2>&1 || true
    wait "$PARTICIPANT_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$MEMORY_PID" ]] && kill -0 "$MEMORY_PID" >/dev/null 2>&1; then
    kill "$MEMORY_PID" >/dev/null 2>&1 || true
    wait "$MEMORY_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$HUB_PID" ]] && kill -0 "$HUB_PID" >/dev/null 2>&1; then
    kill "$HUB_PID" >/dev/null 2>&1 || true
    wait "$HUB_PID" >/dev/null 2>&1 || true
  fi

  exit "$exit_code"
}
trap cleanup EXIT INT TERM

wait_for_hub() {
  for _ in $(seq 1 40); do
    if gambi room list --hub "$HUB_URL" --format json >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

extract_room_code() {
  tr -d '\n' | sed -E 's/.*"code"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/'
}

echo ""
echo "== Gambi local =="
echo "Hub:          $HUB_URL"
echo "Sala:         $ROOM_NAME"
echo "Participante: $PARTICIPANT_ID"
echo "Modelo:       $MODEL"
echo ""

>"$HUB_LOG"
>"$PARTICIPANT_LOG"
>"$MEMORY_LOG"
>"$BOT_LOG"

if gambi room list --hub "$HUB_URL" --format json >/dev/null 2>&1; then
  echo "Hub ja esta rodando em $HUB_URL"
else
  echo "Iniciando hub..."
  # shellcheck disable=SC2086
  gambi hub serve --port "$HUB_PORT" $MDNS_FLAG >"$HUB_LOG" 2>&1 &
  HUB_PID="$!"

  if ! wait_for_hub; then
    echo "Erro: hub nao respondeu em $HUB_URL. Log: $HUB_LOG" >&2
    exit 1
  fi
fi

echo "Criando sala..."
ROOM_JSON="$(gambi room create --hub "$HUB_URL" --name "$ROOM_NAME" --format json)"
ROOM_CODE="$(printf '%s' "$ROOM_JSON" | extract_room_code)"

if [[ -z "$ROOM_CODE" || "$ROOM_CODE" == "$ROOM_JSON" ]]; then
  echo "Erro: nao consegui extrair o codigo da sala." >&2
  echo "$ROOM_JSON" >&2
  exit 1
fi

echo "Sala criada: $ROOM_CODE"

echo "Monitorando memoria em $MEMORY_LOG"
scripts/watch-memory.sh 2 "$MEMORY_LOG" &
MEMORY_PID="$!"

echo "Entrando como participante..."
gambi participant join \
  --hub "$HUB_URL" \
  --room "$ROOM_CODE" \
  --participant-id "$PARTICIPANT_ID" \
  --model "$MODEL" >"$PARTICIPANT_LOG" 2>&1 &
PARTICIPANT_PID="$!"

sleep 1
if ! kill -0 "$PARTICIPANT_PID" >/dev/null 2>&1; then
  echo "Erro: participante encerrou ao entrar na sala. Log: $PARTICIPANT_LOG" >&2
  exit 1
fi

echo "Iniciando bot..."
"$BUN_BIN" run start -- --room "$ROOM_CODE" --participant "$PARTICIPANT_ID" --hub "$HUB_URL" 2>&1 | tee "$BOT_LOG"

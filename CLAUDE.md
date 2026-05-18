# Minecraft Bot - Development Context

Bot autônomo de Minecraft onde cada instância controla 1 bot com 1 LLM via Gambi Hub.

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Bun | TypeScript execution, .env loading |
| Minecraft | mineflayer | Bot control, world interaction |
| LLM | Gambi Hub (HTTP) | OpenAI-compatible chat/completions |
| Validation | Zod | Action schema validation |
| JSON repair | jsonrepair | Fix malformed LLM outputs |
| Metrics | Supabase (REST) | Collect experiment data |

## Architecture

```
AgentLoop (3s cycle)
  ├── PerceptionManager.getContextString()  → game state as text
  ├── MemoryManager.toPromptString()        → last 15 events
  ├── GambiLLM.invoke(messages)             → single participant call
  ├── safeParseJSON + botActionSchema.parse  → validate LLM response
  ├── ActionExecutor.executar(action)        → mineflayer commands
  ├── MemoryManager.recordAction()           → update ring buffer
  └── DataLogger.log(cycleData)              → metrics to Supabase
```

## Running

```bash
# 1. Join a Gambi room with your LLM
gambi join --code ABC123 --model llama3.2:latest

# 2. Run the bot (auto-detects participant)
bun run dev -- --room ABC123

# Or specify participant explicitly
bun run dev -- --room ABC123 --participant meu-pc
```

## Prerequisites

1. Minecraft Java server running
2. Gambi Hub running with at least one LLM participant in a room

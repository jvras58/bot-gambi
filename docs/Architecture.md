
# Arquitetura — Minecraft Bot via Gambi

## Visão Geral

O projeto é um **bot autônomo de Minecraft** controlado por LLM. Cada participante roda sua própria instância: 1 bot = 1 LLM. Múltiplos bots entram no mesmo servidor Minecraft, cada um tomando decisões independentes com sua própria LLM. Métricas são coletadas no Supabase para comparação.

O bot se conecta ao **Gambi** — um hub open-source que interliga LLMs em rede local — para acessar o modelo rodando na máquina do participante.

```mermaid
flowchart TD
    MC[Servidor Minecraft]

    subgraph Bots [AgentLoop]
        B1["🤖 Bot PC1"]
        B2["🤖 Bot PC2"]
        B3["🤖 Bot PC3"]
    end

    MC <--> B1 & B2 & B3

    Hub{"GAMBI HUB (HTTP)\nSala: ABC123"}

    B1 & B2 & B3 <--> Hub

    subgraph Maquinas Locais [Cada bot fala APENAS com sua própria LLM]
        L1["💻 joao (Ollama)\nllama3 @ 192.168.1.50\n(RTX 4090)"]
        L2["💻 maria (LM Studio)\nmistral @ 192.168.1.51\n(GTX 1080)"]
        L3["💻 pedro (Ollama)\nqwen2 @ 192.168.1.52\n(M2 Pro)"]
    end

    Hub <--> L1
    Hub <--> L2
    Hub <--> L3

    DB[("Supabase\n- sessions\n- participant_snapshots\n- cycle_responses")]

    B1 & B2 & B3 --> DB

```

## Componentes

### 1. Bot Minecraft (este repositório)

Aplicação TypeScript/Bun que se conecta a:

* **Servidor Minecraft** via Mineflayer (protocolo nativo)
* **Gambi Hub** via SDK (HTTP REST, API compatível com OpenAI)

O bot **não** roda nenhum LLM. Os prompts são definidos localmente em `botPrompts.ts` e enviados a cada ciclo via SDK. A inferência acontece na máquina do participante.

### 2. Gambi Hub

Servidor HTTP central que gerencia salas e redireciona requisições LLM. O hub **não** processa inferência — é um proxy transparente que:

* Mantém registro de quais máquinas estão online e quais modelos oferecem
* Redireciona requisições para o endpoint da máquina correspondente
* Retorna a resposta sem modificar o conteúdo

> Link: https://github.com/arthurbm/gambi

### 3. Supabase (Coleta de Dados)

Banco Postgres com 3 tabelas:

| Tabela | Descrição | Quando insere |
| --- | --- | --- |
| `sessions` | Metadados da sessão (room, bot, participante) | Uma vez no início |
| `participant_snapshots` | Specs da máquina (CPU, RAM, GPU, VRAM, OS) | Uma vez no início |
| `cycle_responses` | Uma linha por ciclo — latência, ação, resultado, prompt | A cada ciclo (~3s) |

Configuração opcional — sem `SUPABASE_URL` e `SUPABASE_ANON_KEY`, o bot funciona normalmente.

---

## Ciclo de Decisão (AgentLoop)

```mermaid
flowchart TD
    S1["1. PERCEPÇÃO\nPerceptionManager.getGameContext()\n→ vida, fome, posição, entidades, blocos, inventário..."]
    S2["2. PROMPT\nsystem + contexto + memória (15 eventos)\nDefinidos em botPrompts.ts (local)"]
    S3["3. LLM\nGambiLLM.invoke(messages)\n→ 1 chamada para 1 participante\n→ timeout configurável (120s)"]
    S4["4. PARSE\nsafeParseJSON() + normalizeAction() + Zod\nSe falhar → fallback EXPLORAR"]
    S5["5. EXECUÇÃO\nActionExecutor.executar(ação)\n→ mineflayer: andar, falar, coletar..."]
    S6["6. LOG\nDataLogger.log(cycleData)\n→ 1 linha no Supabase por ciclo"]

    S1 --> S2 --> S3 --> S4 --> S5 --> S6

```

---

## Fluxo de Comunicação

```mermaid
sequenceDiagram
    participant Bot as Bot (PC1)
    participant Hub as Gambi Hub
    participant LLM as Máquina PC1 (Ollama)

    Bot->>Hub: listParticipants()
    Hub-->>Bot: [{joao, ...}]
    
    Note over Bot: Resolve: "joao" é meu participante
    
    Bot->>Hub: POST participant:joao
    Hub->>LLM: forward (inferência LLM)
    LLM-->>Hub: resposta (842ms)
    Hub-->>Bot: resposta
    
    Note over Bot: Parse JSON + executa ação no Minecraft
    Note over Bot: Loga métricas no Supabase

```

---

## Pipeline de Coleta de Dados

### Início da sessão

```mermaid
flowchart LR
    M[main] --> R[resolveParticipant]
    R --> P[llm.getOnlineParticipants]
    R --> LS[logger.logSession\nINSERT em sessions]
    R --> LP[logger.logParticipantSnapshot\nINSERT em participant_snapshots]
    
    LP -.-> Specs["Specs capturadas:\n{ cpu: 'Ryzen 7', ram: '32GB', gpu: 'RTX 4090' }"]

```

### A cada ciclo

```mermaid
flowchart TD
    AL((AgentLoop)) --> I[Invoke LLM → 1 resposta]
    AL --> P[Parse + executa ação]
    AL --> S[sleep 3000ms]
    AL --> DL["DataLogger.log({\n participant: 'joao',\n time: 842ms,\n action: 'EXPLORAR'\n})"]
    
    DL --> B[Acumula em buffer\naté 20 registros]
    B --> F[Quando cheio → batch POST\npara Supabase fire-and-forget]

```

### O que é coletado por ciclo

| Categoria | Campos | Origem |
| --- | --- | --- |
| Sessão | `session_id`, `cycle_number`, `room_code` | AgentLoop |
| Participante | `participant_id`, `participant_nickname`, `model_name` | Startup |
| LLM | `llm_response_time_ms`, `llm_raw_length`, `llm_json_repaired`, `llm_parse_error`, `llm_error` | GambiLLM + jsonParser |
| Ação | `action`, `reasoning`, `direction`, `target`, `content`, `raw_response` | Parse |
| Execução | `action_success`, `action_execution_time_ms`, `action_error` | ActionExecutor |
| Prompt | `prompt_sent` | buildMessages() |
| Jogo | `health`, `food`, `pos_x/y/z`, `biome`, `weather`, `nearby_*`, `inventory_items` | PerceptionManager |

---

## Decisões de Design

### Por que 1 bot = 1 LLM?

Cada participante roda o bot na sua própria máquina. O bot se conecta ao Minecraft e usa a LLM local (via Gambi Hub) para tomar decisões. Isso garante que as métricas de cada LLM × hardware reflitam o desempenho real — latência inclui a inferência local, não rede entre máquinas.

### Por que Gambi Hub como intermediário?

O hub centraliza a descoberta de participantes e suas specs de hardware. Sem ele, cada bot precisaria saber o endpoint direto da LLM. Com o hub, basta entrar na sala (`gambi join`) e o bot descobre automaticamente quem é o participante local.

### Por que 3 tabelas e não 1?

* `sessions` — metadados da sessão (1 linha por execução do bot)
* `participant_snapshots` — specs de hardware, estáticas dentro de uma sessão
* `cycle_responses` — dados variáveis, 1 linha por ciclo (~3s)

### Por que Supabase?

* **Centralizado** — todos os bots logam no mesmo banco
* **Zero dependência** — é um `fetch` POST, sem drivers
* **Grátis** — free tier com 500MB
* **SQL** — queries analíticas diretas com JOINs e agregações

### Por que fire-and-forget no log?

O loop roda a cada 3s. O log não pode adicionar latência. O `DataLogger` acumula em buffer e envia em batch — se falhar, tenta no próximo flush.

### Por que salvar o prompt enviado?

O prompt muda a cada ciclo (contexto do jogo + memória são dinâmicos). Salvar permite reproduzir o experimento e analisar se determinado contexto causa mais erros em certos modelos.
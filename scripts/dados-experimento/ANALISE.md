# Análise do experimento de 2026-07-11 (sala TCVGNU)

Interpretação dos dados coletados no Supabase. As tabelas completas estão em
`metricas/` (CSVs) e `RESULTADOS.md` (gerados por `analise.ts` — re-execute com
`bun run analise.ts` se os dados mudarem; este arquivo é análise manual e não é
sobrescrito).

## Visão geral

- **1.193 ciclos** registrados em **32 sessões com dados** (47 iniciadas — 15
  abortaram antes de registrar ciclos).
- **17 modelos** em **15 configurações de hardware** (NVIDIA RTX 2050 e GTX 1650,
  Apple M2/M2 Pro/M3 Pro, Intel Iris Xe, AMD Radeon integrada e CPU-only de 4 a
  24 GB de RAM).
- **267 ciclos** ocorreram com pedido de jogador ativo (`pedidos_jogador.csv`) —
  base para a métrica qualitativa de obediência.

## Configurações viáveis (JSON válido ≥ 75%)

Ordenadas por latência mediana — o requisito do loop do bot é ~3 s por ciclo:

| Modelo | Hardware | p50 (ms) | tok/s p50 | JSON válido | Ação OK |
|---|---|---|---|---|---|
| gemma3:1b | Apple M3 Pro / 18GB | 1.716 | 60,1 | 90,9% | 95,0% |
| gemma3:1b | RTX 2050 / 16GB | 2.443 | 52,6 | 100% | 96,3% |
| gemma3:4b | Apple M2 Pro / 16GB | 4.217 | 25,8 | 100% | 89,4% |
| llama3.2 (3b) | Apple M2 / 8GB | 5.729 | 18,3 | 99,2% | 95,9% |
| qwen2.5:0.5b | Radeon iGPU / 7GB | 9.691 | 12,1 | 76,5% | 71,6% |
| granite4.1:3b | CPU only / 10GB | 24.322 | 5,5 | 96,6% | 89,3% |
| granite4.1:8b | GTX 1650 / 14GB | 76.753 | 2,2 | 100% | 79,3% |

Leituras principais:

1. **Só GPUs dedicadas/Apple Silicon sustentam o ciclo de 3 s** — e apenas com
   modelos de 1–4B. gemma3:1b no M3 Pro é a única configuração abaixo de 2 s.
2. **Tamanho do modelo importa menos que o hardware**: gemma3:1b rende 60 tok/s
   no M3 Pro e o mesmo modelo cai para ~52 tok/s na RTX 2050; granite4.1:8b na
   GTX 1650 (4 GB VRAM, modelo não cabe inteiro) despenca para 2,2 tok/s.
3. **Qualidade não degrada com hardware fraco, só a latência**: granite4.1:3b em
   CPU pura mantém 96,6% de JSON válido a 24 s/ciclo — inutilizável em tempo
   real, mas correto.
4. **qwen2.5:0.5b** mostra o limite inferior de capacidade: rápido o bastante,
   mas 23,5% das respostas são JSON inválido e só 71,6% das ações executam.

## Falhas sistemáticas descobertas (importante para o capítulo de resultados)

### 1. Modelos "thinking" × limite de 256 tokens de saída

Todos os ciclos com falha de parse dos modelos qwen3.5 (2b, 2b-mlx, 4b) e
gemma4:12b têm **exatamente 256 tokens de saída e conteúdo vazio** — bateram no
`LLM_MAX_OUTPUT_TOKENS=256` (`src/config/settings.ts:28` do bot) gastando todo o
orçamento em raciocínio interno (thinking) antes de emitir o JSON final.

Consequências:
- As métricas de **desempenho** (latência, tok/s) desses modelos são válidas —
  eles geraram 256 tokens de verdade.
- As métricas de **qualidade** (JSON válido, sucesso de ação) são 0% por
  artefato de configuração, **não** por incapacidade do modelo.
- Achado legítimo para o TCC: *sob orçamento de tokens apertado, exigido por
  loops de tempo real, modelos com raciocínio explícito são inviáveis* — mas
  deixe claro que é um trade-off de configuração, não ranking de qualidade.
- Se quiser medir a qualidade real do qwen3.5/gemma4:12b, é preciso re-executar
  com `LLM_MAX_OUTPUT_TOKENS` maior (ex.: 2048) ou thinking desativado.

### 2. Sessões 100% perdidas por infraestrutura

- **smollm2:135m** (36 ciclos): 100% "Bad Gateway" — o participante no hub não
  respondia; nenhum dado de inferência foi coletado.
- **qwen3.5:latest** (15 ciclos): 100% "Conflict"/timeout de 120 s — idem.
- Essas sessões devem ser excluídas da análise (o script já as isola via
  `erro_llm_pct = 100`).

### 3. Erros de execução ≠ erros do modelo

Os `action_error` mais comuns ("jogador fora do alcance", "drop não chegou ao
inventário", timeout de pathfinding) são limitações do ambiente/mineflayer, não
decisões erradas do LLM. Vale separar isso na discussão: a taxa de sucesso de
ação mede o *sistema completo*, não só o modelo.

## Mapeamento para as métricas planejadas do TCC

| Métrica planejada | Onde está | Situação |
|---|---|---|
| Latência (média/p50/p95) | `por_modelo_hardware.csv` | ✅ completa |
| TTFT | idem (medido no hub, sem ruído de rede) | ✅ completa |
| Tokens/s | idem (hub e bot concordam) | ✅ completa |
| Aderência ao formato | `json_valido_pct`, `json_reparado_pct` | ✅ (ver ressalva thinking) |
| Taxa de sucesso de ação | `acao_sucesso_pct` | ✅ (ver ressalva ambiente) |
| Tokens por tarefa | `tokens_entrada/saida_medio` | ✅ completa |
| Obediência a pedidos | `pedidos_jogador.csv` (267 ciclos) | ⚠️ requer análise qualitativa manual |
| VRAM/energia por ciclo | — | ❌ não coletado neste experimento |

## Arquivos

```
dados-experimento/
├── raw/                      # JSON bruto exportado do Supabase (2026-07-11)
├── metricas/
│   ├── por_modelo_hardware.csv   # tabela principal do TCC
│   ├── por_modelo.csv
│   ├── por_sessao.csv
│   ├── distribuicao_acoes.csv    # que ações cada modelo escolheu
│   ├── pedidos_jogador.csv       # base p/ obediência
│   └── erros.csv                 # erros por tipo/modelo
├── analise.ts                # regenera metricas/ e RESULTADOS.md
├── RESULTADOS.md             # tabela-resumo autogerada
└── ANALISE.md                # este arquivo (interpretação)
```

# Resultados do experimento — 2026-07-11

- **Ciclos registrados:** 1193
- **Sessões com dados:** 32 (de 47 iniciadas)
- **Modelos:** 17 (qwen3.5:4b, qwen3.5:2b, ministral-3:8b, granite4.1:8b, gemma4:12b, qwen3.5:2b-mlx, ornith:9b, smollm2:135m, qwen2.5:0.5b, gemma3:1b, llama3.2:latest, granite4.1:3b, gemma3:4b, qwen3.5:latest, pdevine/lfm2.5:8b-a1b-q4_K_M, lfm2.5-thinking:latest, qwen3.5:0.8b)
- **Configurações de hardware:** 15

## Métricas por modelo × hardware (ordenado por nº de ciclos)

| Modelo | Hardware | Ciclos | Lat. média (ms) | p50 | p95 | TTFT p50 (ms) | tok/s p50 | JSON válido % | Ação OK % | Erro LLM % |
|---|---|---|---|---|---|---|---|---|---|---|
| gemma3:1b | NVIDIA GeForce RTX 2050 / 16GB RAM | 187 | 2700.7 | 2443.0 | 3116.0 | 2341.0 | 52.55 | 100.0 | 96.3 | 0.0 |
| llama3.2:latest | Apple M2 / 8GB RAM | 124 | 6942.0 | 5728.7 | 10076.7 | 5566.0 | 18.34 | 99.2 | 95.9 | 0.0 |
| qwen2.5:0.5b | AMD Radeon(TM) Graphics / 7GB RAM | 116 | 9891.7 | 9691.4 | 14001.0 | 9537.0 | 12.08 | 76.5 | 71.6 | 0.9 |
| gemma3:1b | Apple M3 Pro / 18GB RAM | 110 | 1849.9 | 1715.5 | 2176.9 | 1588.5 | 60.09 | 90.9 | 95.0 | 0.0 |
| qwen3.5:2b-mlx | Apple M2 Pro / 16GB RAM | 107 | 5096.0 | 4831.3 | 7768.2 | 4689.0 | 54.60 | 0.0 |  | 0.0 |
| gemma3:4b | Apple M2 Pro / 16GB RAM | 94 | 4280.8 | 4216.6 | 4822.7 | 4151.0 | 25.80 | 100.0 | 89.4 | 0.0 |
| qwen3.5:2b | CPU only / 24GB RAM | 77 | 14748.4 | 14543.1 | 15882.2 | 14480.0 | 17.68 | 0.0 |  | 0.0 |
| qwen3.5:2b | Intel(R) Iris(R) Xe Graphics / 16GB RAM | 60 | 37697.1 | 37227.4 | 45976.1 | 37087.5 | 6.90 | 0.0 |  | 0.0 |
| gemma4:12b | Apple M3 Pro / 18GB RAM | 52 | 19985.2 | 19741.4 | 21262.4 | 19642.0 | 13.02 | 0.0 |  | 7.7 |
| qwen3.5:4b | NVIDIA GeForce RTX 2050 / 16GB RAM | 50 | 25090.1 | 22744.3 | 35553.4 | 22647.0 | 11.30 | 0.0 |  | 0.0 |
| granite4.1:3b | CPU only / 10GB RAM | 38 | 24366.4 | 24321.5 | 31595.1 | 24052.0 | 5.53 | 96.6 | 89.3 | 23.7 |
| smollm2:135m | Intel(R) Iris(R) Xe Graphics / 8GB RAM | 36 |  |  |  |  |  |  |  | 100.0 |
| qwen3.5:2b | Apple M3 Pro / 18GB RAM | 30 | 6265.6 | 5987.3 | 7250.6 | 5743.0 | 44.58 | 0.0 |  | 36.7 |
| granite4.1:8b | NVIDIA GeForce GTX 1650 / 14GB RAM | 29 | 74343.8 | 76753.0 | 107656.0 | 76695.0 | 2.17 | 100.0 | 79.3 | 0.0 |
| qwen3.5:4b | CPU only / 15GB RAM | 26 | 96249.6 | 99225.8 | 113597.0 | 99190.5 | 2.58 | 0.0 |  | 0.0 |
| qwen3.5:2b | CPU only / 16GB RAM | 24 | 38558.1 | 37423.2 | 58259.4 | 37131.0 | 6.90 | 0.0 |  | 0.0 |
| qwen3.5:latest | CPU only / 7GB RAM | 15 |  |  |  |  |  |  |  | 100.0 |
| qwen3.5:2b | CPU only / 10GB RAM | 10 | 36437.6 | 35657.9 | 41034.2 | 35591.0 | 7.19 | 0.0 |  | 0.0 |
| ornith:9b | CPU only / 10GB RAM | 3 | 87575.1 | 87575.1 | 87575.1 | 81498.0 | 3.14 | 0.0 |  | 66.7 |
| ministral-3:8b | NVIDIA GeForce GTX 1650 / 14GB RAM | 2 | 69874.7 | 69874.7 | 77476.2 | 69603.5 | 3.68 | 50.0 | 100.0 | 0.0 |
| pdevine/lfm2.5:8b-a1b-q4_K_M | CPU only / 18GB RAM | 1 | 56797.2 | 56797.2 | 56797.2 | 56567.0 | 4.53 | 0.0 |  | 0.0 |
| lfm2.5-thinking:latest | CPU only / 4GB RAM | 1 | 14476.3 | 14476.3 | 14476.3 | 15100.0 | 16.95 | 0.0 |  | 0.0 |
| qwen3.5:0.8b | CPU only / 4GB RAM | 1 | 36807.3 | 36807.3 | 36807.3 | 38331.0 | 6.68 | 0.0 |  | 0.0 |

Arquivos detalhados em `metricas/`.

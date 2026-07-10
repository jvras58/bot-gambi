# 🤖 Guia do PARTICIPANTE — entrar com seu bot

Você vai receber do host **2 informações**: o **código da sala** (ex.: `ABC123`) e o **endereço do hub** (ex.: `http://192.168.1.13:3000`). Substitua nos comandos abaixo.

## 0. O que você precisa ter

- **Ollama** (ou LM Studio) rodando com um modelo baixado. Confira o nome exato do seu modelo:

  ```bash
  ollama list
  ```

  > Use o nome **exato** (ex.: `llama3.2:latest` — só `llama3` dá erro).

- **gambi** instalado:

  ```bash
  npm install -g gambi
  ```

## 1. Instale o bot (uma linha, só na primeira vez)

**Windows** (PowerShell):

```powershell
powershell -c "irm https://raw.githubusercontent.com/jvras58/bot-gambi/main/install.ps1 | iex"
```

**Linux / macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/jvras58/bot-gambi/main/install.sh | bash
```

> Depois de instalar, **abra um terminal novo**.

## 2. Entre na sala com sua LLM

Escolha um nome único pra você (vai ser o nome do seu bot no Minecraft):

```bash
gambi participant join --room ABC123 --participant-id SEU-NOME --model llama3.2:latest --hub http://192.168.1.13:3000
```

> Deixe esse terminal **aberto** — é ele que conecta sua LLM ao experimento.

## 3. Rode o bot (em OUTRO terminal)

```bash
minecraft-bot --room ABC123 --hub http://192.168.1.13:3000
```

Pronto! 🎉 O bot entra no servidor de Minecraft com o seu nome e começa a jogar sozinho. Você vai ver os ciclos no terminal:

```
━━━ Ciclo #1 ━━━
✅ EXPLORAR (842ms)
💭 Estou num lugar novo, vou explorar para encontrar recursos
```

O servidor de Minecraft e a coleta de métricas já vêm configurados dentro do bot — não precisa de mais nada.

## Para encerrar

`Ctrl+C` nos dois terminais (bot e gambi).

---

## Deu erro?

| Erro | O que fazer |
|---|---|
| `Unable to connect` / `hub não respondeu` | Confira o IP com o host e se vocês estão na **mesma rede** (Wi-Fi). |
| `Model 'xxx' not found` | O nome do modelo não bate — use o nome exato do `ollama list`. |
| `Nenhum participante online na sala` | O terminal do passo 2 fechou — rode o `gambi participant join` de novo e deixe aberto. |
| `minecraft-bot` não é reconhecido | Abra um terminal **novo** (o instalador acabou de mexer no PATH). |
| Código de sala inválido | O código muda a cada experimento — confirme com o host o código de **hoje**. |

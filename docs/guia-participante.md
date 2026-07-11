# 🤖 Guia do PARTICIPANTE — entrar com seu bot

Você vai receber do host **2 informações**: o **código da sala** (ex.: `ABC123`) e o **endereço do hub** (ex.: `http://192.168.1.13:3000`). Substitua nos comandos abaixo.

## 0. O que você precisa ter

- **Uma LLM rodando na sua máquina.** O gambi aceita vários provedores — **Ollama, LM Studio, vLLM, OpenRouter**, entre outros. O mais fácil é o **Ollama**, então os exemplos abaixo usam ele:

  ```bash
  ollama list
  ```

  > Use o nome **exato** que aparecer (ex.: `llama3.2:latest` — só `llama3` dá erro).
  >
  > Usando outro provedor? Passe o endpoint dele no passo 2 com `--endpoint`
  > (ex.: LM Studio: `--endpoint http://localhost:1234`). Veja a
  > [documentação do gambi](https://www.gambi.sh/guides/quickstart/).

- **gambi** instalado — escolha UM jeito ([quickstart oficial](https://www.gambi.sh/guides/quickstart/)):

  **Windows** (PowerShell):

  ```powershell
  irm https://raw.githubusercontent.com/arthurbm/gambi/main/scripts/install.ps1 | iex
  ```

  **Linux / macOS:**

  ```bash
  curl -fsSL https://raw.githubusercontent.com/arthurbm/gambi/main/scripts/install.sh | bash
  ```

  **Ou via npm/bun** (se já tiver Node ou Bun):

  ```bash
  npm install -g gambi
  # ou
  bun add -g gambi
  ```

  Confira com `gambi --version` (abra um terminal novo se não for encontrado).

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

Use o **mesmo nome** do passo 2 em `--participant` (com vários participantes na sala, o bot precisa saber qual é o seu):

```bash
minecraft-bot --room ABC123 --hub http://192.168.1.13:3000 --participant SEU-NOME
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

## Atualizar para uma nova versão

Não precisa desinstalar — o instalador **sempre baixa a versão mais recente** e sobrescreve a antiga. Feche o bot (`Ctrl+C`) e rode o mesmo comando do passo 1 de novo:

**Windows** (PowerShell):

```powershell
powershell -c "irm https://raw.githubusercontent.com/jvras58/bot-gambi/main/install.ps1 | iex"
```

**Linux / macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/jvras58/bot-gambi/main/install.sh | bash
```

> ⚠️ O bot precisa estar **fechado** durante a atualização (arquivo em uso não pode ser sobrescrito, principalmente no Windows). Na dúvida se sua versão está velha, rode o instalador — se já estiver atualizado, não muda nada.

## Desinstalar

**Windows** (PowerShell) — remove os arquivos e a entrada do PATH:

```powershell
$dir = "$env:LOCALAPPDATA\minecraft-bot\bin"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\minecraft-bot"
$p = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", (($p -split ';' | Where-Object { $_ -and $_ -ne $dir }) -join ';'), "User")
```

**Linux / macOS** — remove os arquivos e a linha do PATH do seu shell:

```bash
rm -rf ~/.minecraft-bot
sed -i.bak '/minecraft-bot/d' ~/.bashrc   # zsh: troque por ~/.zshrc
```

Abra um terminal novo depois, e pronto — não sobra nada (o bot não grava nada fora dessa pasta).

---

## Deu erro?

| Erro | O que fazer |
|---|---|
| `Unable to connect` / `hub não respondeu` | Confira o IP com o host e se vocês estão na **mesma rede** (Wi-Fi). |
| `Model 'xxx' not found` | O nome do modelo não bate — use o nome exato (no Ollama: `ollama list`; em outro provedor, o nome que ele expõe). |
| `Nenhum participante online na sala` | O terminal do passo 2 fechou — rode o `gambi participant join` de novo e deixe aberto. |
| `N participantes online — especifique qual usar` | Faltou o `--participant SEU-NOME` no comando do bot (o mesmo nome do passo 2). |
| `minecraft-bot` não é reconhecido | Abra um terminal **novo** (o instalador acabou de mexer no PATH). |
| Código de sala inválido | O código muda a cada experimento — confirme com o host o código de **hoje**. |

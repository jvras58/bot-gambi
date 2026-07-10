# 🎮 Comandos do Minecraft — operar o servidor do experimento

Comandos pra você (host) administrar o servidor durante o experimento. Os 3 essenciais, em ordem de dependência: **virar admin primeiro**, porque teleporte e criativo exigem OP.

## 1. Virar admin (OP) — pré-requisito de tudo

Comandos de admin no chat **só funcionam se você já for OP**, e ninguém consegue se dar OP pelo chat (senão qualquer um viraria admin). A primeira vez tem que ser pelo **console do servidor**:

**No painel da BedHosting:**

1. Entre no painel da BedHosting e abra o seu servidor
2. Vá na aba **Console**
3. Digite (SEM a barra `/` — console não usa barra):

```
op SEU-NICK
```

Vai aparecer `Made SEU-NICK a server operator`. Pronto — a partir daqui **tudo funciona pelo chat do jogo**.

> 💡 Depois de OP, você pode dar OP pra outra pessoa direto do chat: `/op NICK-DELA`. E tirar: `/deop NICK`.

## 2. Teleportar para perto de alguém

Já sendo OP, no chat do jogo:

```
/tp SEU-NICK NICK-DESTINO
```

Ou a forma curta (teleporta **você** até a pessoa):

```
/tp NICK-DESTINO
```

Exemplos úteis no experimento:

| Quero... | Comando |
|---|---|
| Ir até o bot da maria | `/tp maria-3` |
| Trazer o bot do joao até mim | `/tp joao-1 SEU-NICK` |
| Juntar todos os jogadores/bots em você | `/tp @a SEU-NICK` |
| Ir para coordenadas exatas | `/tp 85 77 -35` |

> Os bots usam o `participant-id` como nick — é esse nome que você usa no `/tp`.

## 3. Modo criativo

**Para você mesmo:**

```
/gamemode creative
```

**Para uma pessoa específica:**

```
/gamemode creative NICK-DELA
```

**Voltar pro survival:**

```
/gamemode survival
/gamemode survival NICK-DELA
```

> ⚠️ **Não coloque os BOTS em criativo durante a coleta de dados!** Em criativo, quebrar bloco não gera drop — o COLETAR dos bots falha sempre e as métricas do experimento ficam contaminadas. Criativo é pra você observar/montar cenário, não pros bots.

---

## Extras úteis pro experimento

| Comando | O que faz |
|---|---|
| `/time set day` | Vira dia (bons pra observar os bots) |
| `/weather clear` | Para a chuva |
| `/gamerule doDaylightCycle false` | Congela o horário (condições iguais a sessão toda) |
| `/gamerule doMobSpawning false` | Sem mobs hostis (menos ruído nas métricas de FUGIR/ATACAR) |
| `/gamerule keepInventory true` | Ninguém perde itens ao morrer |
| `/kill NICK` | Mata um bot travado (ele respawna) |
| `/whitelist add NICK` | Libera alguém se o servidor tiver whitelist |

> Dica: rode `/gamerule` e `/time` **antes** de começar a sessão de coleta — mudar as condições no meio cria diferença entre os primeiros e últimos ciclos.

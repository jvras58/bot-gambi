# 🎛️ Guia do HOST — iniciar o Gambi

Você (host) sobe o hub, cria a sala e compartilha **2 informações** com os participantes: o **código da sala** e o **seu IP**.

## 1. Inicie o hub (com mDNS, aceitando conexões da rede)

```bash
gambi hub serve --port 3000 --mdns
```

> Deixe esse terminal **aberto** durante todo o experimento.
> O hub já escuta em `0.0.0.0` — ou seja, aceita requisições de todas as máquinas da rede.

⚠️ **Windows:** na primeira vez, o Firewall vai pedir permissão — clique em **Permitir** (rede Privada). Se não aparecer o aviso, libere a porta manualmente (PowerShell **como Administrador**):

```powershell
New-NetFirewallRule -DisplayName "Gambi Hub 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

## 2. Crie a sala (em OUTRO terminal)

```bash
gambi room create --name "Experimento TCC"
```

Vai aparecer algo como:

```
Room code: ABC123    ← anote este código
```

## 3. Descubra o seu IP

```powershell
ipconfig
```

Procure o **Endereço IPv4** do seu Wi-Fi/Ethernet (ex.: `192.168.1.13`). Ignore os IPs `172.x` de `vEthernet (WSL)`.

*(Linux/macOS: `hostname -I` ou `ip addr`)*

## 4. Compartilhe com os participantes

Mande no grupo:

```
Sala:  ABC123
Hub:   http://192.168.1.13:3000
Guia:  https://github.com/jvras58/bot-gambi/blob/main/docs/guia-participante.md
```

## 5. (Opcional) Entre você também com seu bot

Igual a qualquer participante — siga o [guia do participante](guia-participante.md) usando `http://localhost:3000` como hub.

---

✅ **Checklist antes de liberar a galera:**

- [ ] Terminal do hub aberto e rodando (`gambi hub serve --port 3000 --mdns`)
- [ ] Firewall liberado na porta 3000
- [ ] Código da sala + IP compartilhados

> Deu problema? Veja o [guia detalhado da LAN](rodar-experimento-lan.md#solução-de-problemas).

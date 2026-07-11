#!/usr/bin/env bash
# Instalador do minecraft-bot para Linux e macOS.
# Uso: curl -fsSL https://raw.githubusercontent.com/jvras58/bot-gambi/main/install.sh | bash
set -euo pipefail

REPO="jvras58/bot-gambi"
INSTALL_DIR="$HOME/.minecraft-bot/bin"

case "$(uname -s)" in
  Linux)  os="linux" ;;
  Darwin) os="darwin" ;;
  *) echo "❌ Sistema não suportado: $(uname -s)"; exit 1 ;;
esac

case "$(uname -m)" in
  x86_64|amd64)  arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *) echo "❌ Arquitetura não suportada: $(uname -m)"; exit 1 ;;
esac

if [ "$os" = "linux" ] && [ "$arch" = "arm64" ]; then
  echo "❌ Ainda não publicamos binário para linux-arm64. Rode a partir do repositório com Bun."
  exit 1
fi

asset="minecraft-bot-$os-$arch.tar.gz"
url="https://github.com/$REPO/releases/latest/download/$asset"

echo ""
echo "🤖 Minecraft Bot — instalador ($os-$arch)"
echo "   Baixando $url ..."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fSL --progress-bar "$url" -o "$tmp/$asset"

mkdir -p "$INSTALL_DIR"
tar -xzf "$tmp/$asset" -C "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/minecraft-bot"

# Adiciona ao PATH no rc do shell, se ainda não estiver
path_line="export PATH=\"\$HOME/.minecraft-bot/bin:\$PATH\""
case "${SHELL:-}" in
  */zsh) rc="$HOME/.zshrc" ;;
  *)     rc="$HOME/.bashrc" ;;
esac
if ! grep -qs '.minecraft-bot/bin' "$rc"; then
  printf '\n# minecraft-bot\n%s\n' "$path_line" >> "$rc"
  echo "   PATH adicionado em $rc"
fi

echo ""
echo "✅ Instalado em $INSTALL_DIR"
echo ""
echo "Próximos passos:"
echo "  1. Instale o gambi (se ainda não tiver): curl -fsSL https://raw.githubusercontent.com/arthurbm/gambi/main/scripts/install.sh | bash"
echo "  2. Entre na sala:    gambi participant join --room <CODIGO> --model <MODELO> --hub http://<IP-DO-HOST>:3000"
echo "  3. Rode o bot:       minecraft-bot --room <CODIGO> --hub http://<IP-DO-HOST>:3000 --participant <SEU-NOME>"
echo "     (o servidor Minecraft do experimento já vem configurado; use --mc-host para trocar)"
echo ""
echo "Abra um novo terminal (ou rode: source $rc) se o comando não for encontrado."
echo ""

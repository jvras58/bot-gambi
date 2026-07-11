# Instalador do minecraft-bot para Windows.
# Uso: powershell -c "irm https://raw.githubusercontent.com/jvras58/bot-gambi/main/install.ps1 | iex"

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = "jvras58/bot-gambi"
$Asset = "minecraft-bot-windows-x64.zip"
$Url = "https://github.com/$Repo/releases/latest/download/$Asset"
$InstallDir = Join-Path $env:LOCALAPPDATA "minecraft-bot\bin"
$TmpZip = Join-Path $env:TEMP "minecraft-bot-install.zip"

Write-Host ""
Write-Host "Minecraft Bot - instalador (Windows x64)" -ForegroundColor Cyan
Write-Host "   Baixando $Url ..."

Invoke-WebRequest -Uri $Url -OutFile $TmpZip -UseBasicParsing

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Expand-Archive -Path $TmpZip -DestinationPath $InstallDir -Force
Remove-Item $TmpZip -Force

# Adiciona ao PATH do usuário, se ainda não estiver
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($null -eq $UserPath) { $UserPath = "" }
if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$InstallDir;$UserPath", "User")
    $env:Path = "$InstallDir;$env:Path"
    Write-Host "   PATH do usuario atualizado."
}

Write-Host ""
Write-Host "Instalado em $InstallDir" -ForegroundColor Green
Write-Host ""
Write-Host "Proximos passos:"
Write-Host "  1. Instale o gambi (se ainda nao tiver): irm https://raw.githubusercontent.com/arthurbm/gambi/main/scripts/install.ps1 | iex"
Write-Host "  2. Entre na sala:    gambi participant join --room <CODIGO> --model <MODELO> --hub http://<IP-DO-HOST>:3000"
Write-Host "  3. Rode o bot:       minecraft-bot --room <CODIGO> --hub http://<IP-DO-HOST>:3000 --participant <SEU-NOME>"
Write-Host "     (o servidor Minecraft do experimento ja vem configurado; use --mc-host para trocar)"
Write-Host ""
Write-Host "Se o comando 'minecraft-bot' nao for encontrado, abra um NOVO terminal."
Write-Host ""

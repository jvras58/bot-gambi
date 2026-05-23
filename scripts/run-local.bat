@echo off
setlocal EnableDelayedExpansion

rem cd para a raiz do projeto (pasta acima de scripts)
cd /d "%~dp0.."

set "ROOM_NAME=Experimento 1"
set "HUB_PORT=3000"
set "HUB_URL="
set "PARTICIPANT_ID=%GAMBIARRA_PARTICIPANT_ID%"
set "MODEL=%GAMBIARRA_MODEL%"
set "MDNS_FLAG=--mdns"

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--participant-id" ( set "PARTICIPANT_ID=%~2" & shift & shift & goto parse_args )
if /i "%~1"=="-p"               ( set "PARTICIPANT_ID=%~2" & shift & shift & goto parse_args )
if /i "%~1"=="--model"          ( set "MODEL=%~2"          & shift & shift & goto parse_args )
if /i "%~1"=="-m"               ( set "MODEL=%~2"          & shift & shift & goto parse_args )
if /i "%~1"=="--name"           ( set "ROOM_NAME=%~2"      & shift & shift & goto parse_args )
if /i "%~1"=="-n"               ( set "ROOM_NAME=%~2"      & shift & shift & goto parse_args )
if /i "%~1"=="--hub-port"       ( set "HUB_PORT=%~2"       & shift & shift & goto parse_args )
if /i "%~1"=="--hub"            ( set "HUB_URL=%~2"        & shift & shift & goto parse_args )
if /i "%~1"=="--no-mdns"        ( set "MDNS_FLAG="         & shift & goto parse_args )
if /i "%~1"=="--help"           ( call :print_usage & exit /b 0 )
if /i "%~1"=="-h"               ( call :print_usage & exit /b 0 )
echo Opcao desconhecida: %~1 1>&2
call :print_usage
exit /b 1

:args_done

if "%HUB_URL%"=="" set "HUB_URL=http://localhost:%HUB_PORT%"

if "%PARTICIPANT_ID%"=="" (
  echo Erro: informe --participant-id, exemplo: --participant-id joao-1 1>&2
  exit /b 1
)

if "%MODEL%"=="" (
  echo Erro: informe --model com o nome exato do modelo, exemplo: --model llama3.2:latest 1>&2
  exit /b 1
)
if "%MODEL%"=="*" (
  echo Erro: informe --model com o nome exato do modelo, exemplo: --model llama3.2:latest 1>&2
  exit /b 1
)

where gambi >nul 2>&1
if not errorlevel 1 goto gambi_ok
echo Comando 'gambi' nao encontrado. Instalando...
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/arthurbm/gambi/main/scripts/install.ps1 | iex"
if exist "%LOCALAPPDATA%\gambi\gambi.exe" set "PATH=%LOCALAPPDATA%\gambi;%PATH%"
where gambi >nul 2>&1
if not errorlevel 1 goto gambi_ok
echo Erro: falha ao instalar 'gambi'. Feche e reabra o terminal e tente de novo, ou instale manualmente: https://www.gambi.sh/guides/quickstart/ 1>&2
exit /b 1
:gambi_ok

set "BUN_BIN="
where bun >nul 2>&1
if not errorlevel 1 ( set "BUN_BIN=bun" & goto bun_ok )
if exist "%USERPROFILE%\.bun\bin\bun.exe" (
  set "BUN_BIN=%USERPROFILE%\.bun\bin\bun.exe"
  set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
  goto bun_ok
)
echo Comando 'bun' nao encontrado. Instalando...
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
where bun >nul 2>&1
if not errorlevel 1 ( set "BUN_BIN=bun" & goto bun_ok )
if exist "%USERPROFILE%\.bun\bin\bun.exe" (
  set "BUN_BIN=%USERPROFILE%\.bun\bin\bun.exe"
  set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
  goto bun_ok
)
echo Erro: falha ao instalar o Bun. Feche e reabra o terminal e tente de novo, ou instale manualmente: https://bun.sh 1>&2
exit /b 1
:bun_ok

if not exist ".tmp" mkdir ".tmp"
set "HUB_LOG=.tmp\gambi-hub.log"
set "PARTICIPANT_LOG=.tmp\gambi-participant.log"
set "MEMORY_LOG=.tmp\memory.log"
set "BOT_LOG=.tmp\bot.log"
set "HUB_PID="
set "PARTICIPANT_PID="
set "MEMORY_PID="

echo.
echo == Gambi local ==
echo Hub:          %HUB_URL%
echo Sala:         %ROOM_NAME%
echo Participante: %PARTICIPANT_ID%
echo Modelo:       %MODEL%
echo.

type nul > "%HUB_LOG%"
type nul > "%PARTICIPANT_LOG%"
type nul > "%MEMORY_LOG%"
type nul > "%BOT_LOG%"

gambi room list --hub "%HUB_URL%" --format json >nul 2>&1
if not errorlevel 1 (
  echo Hub ja esta rodando em %HUB_URL%
  goto hub_ready
)
echo Iniciando hub...
for /f "delims=" %%P in ('powershell -NoProfile -Command "(Start-Process -FilePath cmd.exe -ArgumentList '/c',('gambi hub serve --port %HUB_PORT% %MDNS_FLAG% > '+[char]34+'%HUB_LOG%'+[char]34+' 2^>^&1') -WindowStyle Hidden -PassThru).Id"') do set "HUB_PID=%%P"
call :wait_for_hub
if errorlevel 1 (
  echo Erro: hub nao respondeu em %HUB_URL%. Log: %HUB_LOG% 1>&2
  goto fail
)
:hub_ready

echo Criando sala...
gambi room create --hub "%HUB_URL%" --name "%ROOM_NAME%" --format json > ".tmp\room.json"
for /f "usebackq delims=" %%C in (`powershell -NoProfile -Command "$j=Get-Content -Raw '.tmp\room.json'; $q=[char]34; if ($j -match ($q+'code'+$q+'\s*:\s*'+$q+'([^'+$q+']+)'+$q)) { $matches[1] }"`) do set "ROOM_CODE=%%C"

if "%ROOM_CODE%"=="" (
  echo Erro: nao consegui extrair o codigo da sala. 1>&2
  type ".tmp\room.json" 1>&2
  goto fail
)

echo Sala criada: %ROOM_CODE%

echo Monitorando memoria em %MEMORY_LOG%
for /f "delims=" %%P in ('powershell -NoProfile -Command "(Start-Process -FilePath cmd.exe -ArgumentList '/c',([char]34+'%~dp0watch-memory.bat'+[char]34+' 2 '+[char]34+'%MEMORY_LOG%'+[char]34) -WindowStyle Hidden -PassThru).Id"') do set "MEMORY_PID=%%P"

echo Entrando como participante...
for /f "delims=" %%P in ('powershell -NoProfile -Command "(Start-Process -FilePath cmd.exe -ArgumentList '/c',('gambi participant join --hub '+[char]34+'%HUB_URL%'+[char]34+' --room '+[char]34+'%ROOM_CODE%'+[char]34+' --participant-id '+[char]34+'%PARTICIPANT_ID%'+[char]34+' --model '+[char]34+'%MODEL%'+[char]34+' > '+[char]34+'%PARTICIPANT_LOG%'+[char]34+' 2^>^&1') -WindowStyle Hidden -PassThru).Id"') do set "PARTICIPANT_PID=%%P"

powershell -NoProfile -Command "Start-Sleep -Seconds 1" >nul 2>&1
powershell -NoProfile -Command "if (Get-Process -Id %PARTICIPANT_PID% -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo Erro: participante encerrou ao entrar na sala. Log: %PARTICIPANT_LOG% 1>&2
  goto fail
)

echo Iniciando bot...
"%BUN_BIN%" run start -- --room "%ROOM_CODE%" --participant "%PARTICIPANT_ID%" --hub "%HUB_URL%" 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%BOT_LOG%'"

call :cleanup
exit /b 0

:fail
call :cleanup
exit /b 1

:wait_for_hub
for /l %%i in (1,1,40) do (
  gambi room list --hub "%HUB_URL%" --format json >nul 2>&1
  if not errorlevel 1 exit /b 0
  powershell -NoProfile -Command "Start-Sleep -Milliseconds 250" >nul 2>&1
)
exit /b 1

:cleanup
if defined PARTICIPANT_PID call :kill_pid %PARTICIPANT_PID%
if defined MEMORY_PID      call :kill_pid %MEMORY_PID%
if defined HUB_PID         call :kill_pid %HUB_PID%
exit /b

:kill_pid
taskkill /PID %1 /T /F >nul 2>&1
exit /b

:print_usage
echo Uso:
echo   bun run local -- --participant-id joao-1 --model llama3.2:latest
echo.
echo Opcoes:
echo   --participant-id, -p  ID/nome do participante e do bot no Minecraft
echo   --model, -m           Nome exato do modelo, igual aparece no `ollama list`
echo   --name, -n            Nome da sala (default: "Experimento 1")
echo   --hub-port            Porta do hub local (default: 3000)
echo   --hub                 URL do hub (default: http://localhost:^<hub-port^>)
echo   --no-mdns             Inicia o hub sem --mdns
echo   --help, -h            Mostra esta ajuda
echo.
echo Exemplo:
echo   bun run local -- -p joao-1 -m llama3.2:latest
exit /b 0

@echo off
setlocal

set "INTERVAL=%~1"
if "%INTERVAL%"=="" set "INTERVAL=2"
set "LOG_FILE=%~2"
if "%LOG_FILE%"=="" set "LOG_FILE=.tmp\memory.log"

rem garante que o diretorio do log existe
for %%F in ("%LOG_FILE%") do set "LOG_DIR=%%~dpF"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:loop
powershell -NoProfile -Command "$f='%LOG_FILE%'; $ts=Get-Date -Format 'yyyy-MM-dd HH:mm:ss'; Add-Content $f ('===== '+$ts+' ====='); $os=Get-CimInstance Win32_OperatingSystem; $tot=[math]::Round($os.TotalVisibleMemorySize/1MB,2); $free=[math]::Round($os.FreePhysicalMemory/1MB,2); $used=[math]::Round(($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)/1MB,2); Add-Content $f ('Mem  total: '+$tot+' GB   used: '+$used+' GB   free: '+$free+' GB'); Add-Content $f ''; (Get-Process | Sort-Object WS -Descending | Select-Object -First 20 Id,ProcessName,@{N='MEM_MB';E={[math]::Round($_.WS/1MB,1)}} | Format-Table -AutoSize | Out-String).TrimEnd() | Add-Content $f; if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) { Add-Content $f ''; nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu --format=csv,noheader,nounits | Add-Content $f; nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits 2>$null | Add-Content $f }; Add-Content $f ''"
powershell -NoProfile -Command "Start-Sleep -Seconds %INTERVAL%"
goto loop

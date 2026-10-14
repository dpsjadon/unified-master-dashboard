@echo off
title IntelliSmart SBPDCL - Unified Smart Meter Intelligence Platform (Port 8095)
echo ======================================================================
echo   Starting IntelliSmart SBPDCL Unified Intelligence Platform
echo   Port: 8095 | Master 1.124M DB + Daily 4k Reports + ULA Tracker
echo ======================================================================

set "D_DIR=%~dp0"
set "PYTHON_EXE=C:\Users\Dharmendra Pal Singh\AppData\Local\Python\bin\python.exe"

:: Check if server is already running on port 8095
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8095/api/summary' -UseBasicParsing -TimeoutSec 1; exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [+] Unified Platform is ALREADY running and healthy on port 8095.
) else (
    echo [*] Starting Unified Server in background...
    powershell -Command "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = 'cmd.exe /c ""%PYTHON_EXE%" server.py"'; CurrentDirectory = '%D_DIR%' }" >nul 2>&1
    
    echo [*] Waiting for server to initialize...
    for /L %%i in (1,1,15) do (
        powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8095/api/summary' -UseBasicParsing -TimeoutSec 1; exit 0 } catch { exit 1 }" >nul 2>&1
        if not errorlevel 1 goto srv_ready
        timeout /t 1 /nobreak >nul
    )
)

:srv_ready
echo [+] Server is LIVE! Opening browser at http://localhost:8095/ ...
start http://localhost:8095/
timeout /t 2 /nobreak >nul

@echo off
chcp 65001 >nul
rem Gelistirme modu: backend (5080) + React dev sunucusu (5173, anlik yenileme)
start "Kokpit API" cmd /k "cd /d %~dp0backend\MeosKokpit.Api && dotnet watch run --launch-profile http"
start "Kokpit Web" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 6 >nul
start "" http://localhost:5173

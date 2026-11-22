@echo off
chcp 65001 >nul
set "DOTNET=C:\Program Files\dotnet\dotnet.exe"
if not exist "%DOTNET%" (
  echo .NET SDK bulunamadi: %DOTNET%
  pause
  exit /b 1
)
cd /d "%~dp0backend\MeosKokpit.Api"
echo MEOS Kokpit baslatiliyor: http://localhost:5080
start "" http://localhost:5080
"%DOTNET%" run --urls http://localhost:5080
pause

@echo off
chcp 65001 >nul
rem React'i derleyip, .NET kurulumu GEREKTIRMEYEN (self-contained) yayin paketini olusturur: .\yayin
cd /d "%~dp0frontend"
call npm install || goto :err
call npm run build || goto :err
cd /d "%~dp0backend\MeosKokpit.Api"
dotnet publish -c Release -r win-x64 --self-contained true -o "%~dp0yayin" || goto :err
echo.
echo Yayin hazir: %~dp0yayin   (yaklasik 120 MB)
echo Bu klasoru VDI sunucuya kopyalayin ve MeosKokpit.Api.exe dosyasini calistirin.
echo Adres: http://SUNUCU-ADI:5080   (port: appsettings.json icindeki Urls)
echo Ayarlari tasimak icin gelistirme ortamindaki App_Data klasorunden config.json (ve istenirse custom-tables.json) dosyalarini sunucudaki App_Data icine kopyalayin.
goto :eof
:err
echo HATA olustu.
exit /b 1

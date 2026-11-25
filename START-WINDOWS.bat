@echo off
chcp 65001 >nul
title Cabdinasir Bus - Tijaabo
echo.
echo  ==========================================
echo    CABDINASIR BUS - nidaamka tijaabada
echo  ==========================================
echo.
where docker >nul 2>nul
if errorlevel 1 (
  echo  [!] Docker Desktop lama helin.
  echo      Ka soo deji: https://www.docker.com/products/docker-desktop/
  echo      Rakib, kici, kadibna mar kale laba jeer riix faylkan.
  pause
  exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo  [!] Docker Desktop ma shaqeynayo. Fur Docker Desktop, sug ilaa uu "running" noqdo, kadib mar kale riix.
  pause
  exit /b 1
)
echo  [1/3] Waa la dhisayaa (markii ugu horreysay 5-10 daqiiqo) ...
docker compose -f docker-compose.demo.yml up -d --build
if errorlevel 1 (
  echo  [!] Khalad ayaa dhacay. Sawir ka qaad shaashadda oo u dir Claude.
  pause
  exit /b 1
)
echo  [2/3] Sugaya inta backend-ku kacayo ...
:wait
timeout /t 3 >nul
curl -s -o nul http://localhost:3000/api/v1/health
if errorlevel 1 goto wait
echo  [3/3] Diyaar!
echo.
echo   Website:  http://localhost:3001
echo   Backend:  http://localhost:3000/api/docs
echo.
echo   Super Admin:  0630000000  /  ChangeMe123!   (password cusub ayaa la weydiinayaa)
echo   Maamule:      0631000001  /  Demo1234
echo   Karraani:     0631000002  /  Demo1234
echo   Wajaale:      0632000001 (maamule) / 0632000002 (karraani)  -  Demo1234
echo.
start http://localhost:3001
start http://localhost:3000/api/docs
echo  Joojinta: STOP-WINDOWS.bat
pause

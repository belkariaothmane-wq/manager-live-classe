@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 ou plus recent est necessaire pour le vote par telephones.
  echo Ouvrez index.html pour utiliser la version locale autonome.
  pause
  exit /b 1
)
node server.js
pause

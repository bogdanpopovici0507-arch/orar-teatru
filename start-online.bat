@echo off
title Orar Teatru / Teatru de Revista (Online Web)
echo ======================================================================
echo    Pornire aplicatie: Orar Teatru / Teatru de Revista (Online Web)
echo ======================================================================
cd /d "%~dp0"

echo 1. Pornire server local...
start "Orar Teatru - Server" /min cmd /c "node server.js"

timeout /t 2 /nobreak >nul

echo 2. Generare link public securizat (Cloudflare Tunnel)...
echo.
echo Link-ul public va fi afisat mai jos. Trimiteti acel link parintilor!
echo ======================================================================
cloudflared tunnel --url http://localhost:3000
pause

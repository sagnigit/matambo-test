@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run dist
echo.
echo L'installateur est dans le dossier "dist". C'est ce fichier .exe que vous donnez aux testeurs.
pause

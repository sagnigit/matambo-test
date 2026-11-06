@echo off
rem Publier une nouvelle version de Matambo Test sur GitHub : les clients la recoivent seuls.
rem Usage : publier.bat            (monte le numero de version d'un cran : 0.2.0 -> 0.2.1)
rem         publier.bat minor      (0.2.1 -> 0.3.0)
cd /d "%~dp0"
set GH="C:\Program Files\GitHub CLI\gh.exe"
if not exist node_modules call npm install
for /f %%t in ('%GH% auth token') do set GH_TOKEN=%%t
if "%GH_TOKEN%"=="" (echo Connectez-vous d'abord : gh auth login & pause & exit /b 1)
call npm test || (echo Les essais ont echoue : rien n'est publie. & pause & exit /b 1)
if "%1"=="" (call npm version patch --no-git-tag-version) else (call npm version %1 --no-git-tag-version)
call npm run publier
echo.
echo Version publiee. Enregistrez aussi le code : git add -A ^&^& git commit -m "Version" ^&^& git push
pause

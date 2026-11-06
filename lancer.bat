@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Premiere fois : installation des composants, patientez...
  call npm install
)
call npm start

@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\Users\yxie627\AppData\Local\Temp\opencode\node-v24.22.1-win-x64\node.exe" set "NODE_EXE=C:\Users\yxie627\AppData\Local\Temp\opencode\node-v24.22.1-win-x64\node.exe"

if not defined NODE_EXE (
  echo Node.js was not found.
  echo Install Node.js 20 or newer, or edit NODE_EXE in this file.
  pause
  exit /b 1
)

if /I not "%NODE_EXE%"=="node" (
  for %%I in ("%NODE_EXE%") do set "PATH=%%~dpI;%PATH%"
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

rem Set LEXICON_DATA_DIR to a folder, or create data\.portable for portable mode.
if not defined LEXICON_DATA_DIR if exist "%~dp0data\.portable" set "LEXICON_DATA_DIR=%~dp0data"

rem Keep this URL stable. Browser storage is scoped to scheme + host + port.
echo Starting Learnword at http://127.0.0.1:5173 ...
call npm run dev -- --host 127.0.0.1 --port 5173 --strictPort --open

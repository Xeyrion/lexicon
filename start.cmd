@echo off
setlocal
cd /d "%~dp0"

rem Double-click entry point: builds the app, then serves dist/ with the local
rem data API. Use `npm run dev` while editing code (hot reload, no build step).

set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"

if not defined NODE_EXE (
  echo.
  echo [Lexicon] Node.js was not found.
  echo Install Node.js 20.19+ or 22.12+ ^(Vite 8 requires ^^20.19.0 ^|^| ^>=22.12.0^) from https://nodejs.org/
  pause
  exit /b 1
)

if /I not "%NODE_EXE%"=="node" (
  for %%I in ("%NODE_EXE%") do set "PATH=%%~dpI;%PATH%"
)

"%NODE_EXE%" -e "const v=process.versions.node.split('.').map(Number);const ok=(v[0]===20&&v[1]>=19)||(v[0]>=22&&(v[0]>22||v[1]>=12));process.exit(ok?0:1)"
if errorlevel 1 (
  echo.
  echo [Lexicon] Unsupported Node.js version:
  "%NODE_EXE%" --version
  echo Vite 8 requires Node.js ^^20.19.0 ^|^ ^>=22.12.0
  echo Install a supported release from https://nodejs.org/ and run start.cmd again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo [Lexicon] npm install failed. Check the messages above and try again.
    pause
    exit /b 1
  )
)

rem Set LEXICON_DATA_DIR to a folder, or create data\.portable for portable mode.
if not defined LEXICON_DATA_DIR if exist "%~dp0data\.portable" set "LEXICON_DATA_DIR=%~dp0data"

rem Keep this URL stable. Browser storage is scoped to scheme + host + port.
echo Building and starting Lexicon at http://127.0.0.1:5173 ...
call npm start
if errorlevel 1 (
  echo.
  echo [Lexicon] Startup failed. Check the messages above, or run npm run build to see the full output.
  pause
  exit /b 1
)

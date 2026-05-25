@echo off
setlocal EnableDelayedExpansion
title Cotti System Installer

:: ============================================================
:: Cotti System - Windows Installer
:: Muss als Administrator gestartet werden!
:: ============================================================

:: Admin-Pruefung
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  +--------------------------------------------------+
    echo  ^|  FEHLER: Bitte als Administrator starten!        ^|
    echo  ^|  Rechtsklick auf installer.bat - Als Admin       ^|
    echo  +--------------------------------------------------+
    echo.
    pause
    exit /b 1
)

cls
echo.
echo  +======================================================+
echo  ^|        Cotti System - Windows Installer              ^|
echo  ^|   Installiert alle Abhaengigkeiten automatisch       ^|
echo  +======================================================+
echo.
echo  Folgendes wird installiert:
echo    [1] winget (falls nicht vorhanden)
echo    [2] Git
echo    [3] Node.js LTS (^>=18)
echo    [4] Python 3.11
echo    [5] ffmpeg
echo    [6] Ollama (Windows-Version)
echo    [7] WSL2 + Ubuntu
echo    [8] Cotti System Repo klonen
echo    [9] npm install + Python venv + Pakete
echo   [10] .env Datei konfigurieren
echo.
echo  HINWEIS: WSL2 erfordert moeglicherweise einen Neustart.
echo.
pause

:: Installationsordner festlegen
set "INSTALL_DIR=%USERPROFILE%\cotti-system"
set "REPO_URL=https://github.com/cotti1234/cotti-system.git"
set "REPO_BRANCH=stable"
set "WSL_NEEDS_REBOOT=0"

echo.
echo --- [1/9] winget pruefen ---
winget --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  >> winget nicht gefunden - oeffne Microsoft Store...
    start ms-windows-store://pdp/?productid=9NBLGGH4NNS1
    echo.
    echo  Bitte winget (App-Installer) im Store installieren,
    echo  dann dieses Fenster schliessen und installer.bat neu starten.
    pause
    exit /b 1
) else (
    echo  [OK] winget vorhanden
)

:: Git
echo.
echo --- [2/9] Git ---
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  >> Git installieren...
    winget install --id Git.Git -e --source winget --silent --accept-source-agreements --accept-package-agreements
    if %errorlevel% neq 0 (
        echo  [FEHLER] Git Installation fehlgeschlagen!
        pause
        exit /b 1
    )
    set "PATH=%PATH%;C:\Program Files\Git\cmd"
    echo  [OK] Git installiert
) else (
    echo  [OK] Git bereits vorhanden
)

:: Node.js
echo.
echo --- [3/9] Node.js LTS ---
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  >> Node.js installieren...
    winget install --id OpenJS.NodeJS.LTS -e --source winget --silent --accept-source-agreements --accept-package-agreements
    if %errorlevel% neq 0 (
        echo  [FEHLER] Node.js Installation fehlgeschlagen!
        pause
        exit /b 1
    )
    set "PATH=%PATH%;C:\Program Files\nodejs"
    echo  [OK] Node.js installiert
) else (
    echo  [OK] Node.js bereits vorhanden
)

:: Python
echo.
echo --- [4/9] Python 3.11 ---
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  >> Python installieren...
    winget install --id Python.Python.3.11 -e --source winget --silent --accept-source-agreements --accept-package-agreements
    if %errorlevel% neq 0 (
        echo  [FEHLER] Python Installation fehlgeschlagen!
        pause
        exit /b 1
    )
    set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts"
    echo  [OK] Python installiert
) else (
    echo  [OK] Python bereits vorhanden
)

:: ffmpeg
echo.
echo --- [5/9] ffmpeg ---
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo  >> ffmpeg installieren...
    winget install --id Gyan.FFmpeg -e --source winget --silent --accept-source-agreements --accept-package-agreements
    if %errorlevel% neq 0 (
        echo  [WARN] ffmpeg fehlgeschlagen - Sprachnachrichten nicht verfuegbar.
        echo         Manuell: https://ffmpeg.org/download.html
    ) else (
        echo  [OK] ffmpeg installiert
    )
) else (
    echo  [OK] ffmpeg bereits vorhanden
)

:: Ollama
echo.
echo --- [6/9] Ollama (KI-Engine) ---
where ollama >nul 2>&1
if %errorlevel% neq 0 (
    echo  >> Ollama via winget installieren...
    winget install --id Ollama.Ollama -e --source winget --silent --accept-source-agreements --accept-package-agreements
    if %errorlevel% neq 0 (
        echo  >> winget fehlgeschlagen - direkter Download...
        set "OLLAMA_INSTALLER=%TEMP%\OllamaSetup.exe"
        powershell -Command "Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile '%TEMP%\OllamaSetup.exe'"
        "%TEMP%\OllamaSetup.exe" /S
        if %errorlevel% neq 0 (
            echo  [FEHLER] Ollama Installation fehlgeschlagen!
            pause
            exit /b 1
        )
    )
    set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Ollama"
    echo  [OK] Ollama installiert
) else (
    echo  [OK] Ollama bereits vorhanden
)

:: llama3 Modell laden
echo.
echo  >> llama3 Modell laden (ca. 4.7 GB - bitte warten, nicht abbrechen!)
start /B ollama serve >nul 2>&1
timeout /t 3 /nobreak >nul
ollama pull llama3
if %errorlevel% equ 0 (
    echo  [OK] llama3 Modell geladen
) else (
    echo  [WARN] llama3 Download fehlgeschlagen - spaeter manuell: ollama pull llama3
)

:: WSL2
echo.
echo --- [7/9] WSL2 + Ubuntu ---
wsl --status >nul 2>&1
if %errorlevel% neq 0 (
    echo  >> WSL2 aktivieren...
    dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart >nul
    dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart >nul
    echo  >> WSL2 als Standard setzen...
    wsl --set-default-version 2 >nul 2>&1
    echo  >> Ubuntu installieren...
    wsl --install -d Ubuntu --no-launch
    echo.
    echo  [WARN] WSL2 wurde aktiviert.
    echo         WICHTIG: System nach diesem Installer neu starten!
    echo         Danach Ubuntu oeffnen und Benutzer einrichten.
    set "WSL_NEEDS_REBOOT=1"
) else (
    echo  [OK] WSL2 bereits aktiv
)

:: Repo klonen
echo.
echo --- [8/9] Cotti System klonen ---
if exist "%INSTALL_DIR%\.git" (
    echo  [OK] Repo bereits vorhanden - aktualisiere...
    git -C "%INSTALL_DIR%" fetch origin
    git -C "%INSTALL_DIR%" checkout %REPO_BRANCH%
    git -C "%INSTALL_DIR%" pull origin %REPO_BRANCH%
) else (
    echo  >> Repo klonen nach %INSTALL_DIR%...
    git clone --branch %REPO_BRANCH% %REPO_URL% "%INSTALL_DIR%"
    if %errorlevel% neq 0 (
        echo  [FEHLER] Repo klonen fehlgeschlagen! Internetverbindung pruefen.
        pause
        exit /b 1
    )
    echo  [OK] Repo geklont
)

:: npm install + Python-Pakete
echo.
echo --- [9/9] Abhaengigkeiten installieren ---
echo  >> npm install...
call npm install --prefix "%INSTALL_DIR%" --silent
if %errorlevel% neq 0 (
    echo  [FEHLER] npm install fehlgeschlagen!
    pause
    exit /b 1
)
echo  [OK] Node.js Pakete installiert

echo  >> Python venv erstellen...
python -m venv "%INSTALL_DIR%\venv"
echo  >> openai-whisper + edge-tts installieren (kann dauern)...
"%INSTALL_DIR%\venv\Scripts\pip" install openai-whisper edge-tts --quiet
if %errorlevel% equ 0 (
    echo  [OK] Python Pakete installiert
) else (
    echo  [WARN] Python Pakete teilweise fehlgeschlagen - manuell pruefen
)

:: .env konfigurieren
echo.
echo --- .env Konfiguration ---
if not exist "%INSTALL_DIR%\.env" (
    copy "%INSTALL_DIR%\.env.example" "%INSTALL_DIR%\.env" >nul
    echo  [OK] .env angelegt
)

echo.
echo  Discord Bot Token eingeben:
echo  (Erstellen: https://discord.com/developers/applications)
echo  (Enter druecken zum Ueberspringen - spaeter in .env eintragen)
echo.
set /p "DISCORD_TOKEN=  Token: "

if not "!DISCORD_TOKEN!"=="" (
    powershell -Command "(Get-Content '%INSTALL_DIR%\.env') -replace 'DISCORD_TOKEN=.*', 'DISCORD_TOKEN=!DISCORD_TOKEN!' | Set-Content '%INSTALL_DIR%\.env'"
    echo  [OK] Discord Token gespeichert
) else (
    echo  [WARN] Spaeter eintragen: %INSTALL_DIR%\.env
)

:: Abschluss
echo.
echo  +============================================================+
echo  ^|        Setup erfolgreich abgeschlossen!                    ^|
echo  +============================================================+
echo  ^|                                                            ^|
echo  ^|  Bot starten:                                              ^|
echo  ^|    cd %USERPROFILE%\cotti-system                           ^|
echo  ^|    npm start                                               ^|
echo  ^|                                                            ^|
echo  ^|  WhatsApp: QR-Code im Terminal scannen                     ^|
echo  ^|  Discord:  Token in .env pruefen                           ^|
echo  ^|                                                            ^|
echo  ^|  Installationsordner:                                      ^|
echo  ^|    %USERPROFILE%\cotti-system                              ^|
echo  ^|                                                            ^|
if "!WSL_NEEDS_REBOOT!"=="1" (
echo  ^|  NEUSTART ERFORDERLICH fuer WSL2!                          ^|
echo  ^|  Danach Ubuntu oeffnen und Benutzer einrichten.            ^|
echo  ^|                                                            ^|
)
echo  +============================================================+
echo.

if "!WSL_NEEDS_REBOOT!"=="1" (
    set /p "REBOOT_NOW=  Jetzt neu starten? [J/N]: "
    if /i "!REBOOT_NOW!"=="J" (
        shutdown /r /t 10 /c "Cotti System: WSL2 - Neustart in 10 Sekunden"
        echo  >> Neustart in 10 Sekunden...
    )
)

pause
endlocal

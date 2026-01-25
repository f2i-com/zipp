@echo off
echo === Building plugins ===
cd /d "%~dp0packages\zipp-desktop"
call npm run build:plugins

echo === Deploying plugins to AppData ===
robocopy "%~dp0packages\zipp-desktop\src-tauri\resources\plugins" "%APPDATA%\zipp\plugins" /MIR /XD node_modules .git .gemini /XF .gitignore

echo === Deploying services to AppData ===
set "SERVICES_SRC=%~dp0packages\zipp-desktop\src-tauri\resources\services"
set "SERVICES_DST=%APPDATA%\zipp\services"
if not exist "%SERVICES_DST%" mkdir "%SERVICES_DST%"
rem Copy/update service files but preserve venv folders
for /D %%G in ("%SERVICES_SRC%\*") do (
    echo Syncing service: %%~nxG
    robocopy "%%G" "%SERVICES_DST%\%%~nxG" /E /XD venv __pycache__ .git node_modules /XF *.pyc .gitignore
)

echo === Deploying ffmpeg to AppData ===
if not exist "%APPDATA%\zipp\bin" mkdir "%APPDATA%\zipp\bin"
if not exist "%APPDATA%\zipp\bin\ffmpeg.exe" (
    copy "%~dp0packages\zipp-desktop\src-tauri\bin\ffmpeg-x86_64-pc-windows-msvc.exe" "%APPDATA%\zipp\bin\ffmpeg.exe"
    copy "%~dp0packages\zipp-desktop\src-tauri\bin\ffprobe-x86_64-pc-windows-msvc.exe" "%APPDATA%\zipp\bin\ffprobe.exe"
    echo ffmpeg copied to AppData
) else (
    echo ffmpeg already exists in AppData
)

echo === Starting Tauri dev ===
call npm run tauri dev

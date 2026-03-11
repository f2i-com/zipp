@echo off
setlocal

rem Zipp Desktop Build Script
rem Builds all dependencies, plugins, and packages the app into an installer

rem Get the directory where the script is located
set "DIR=%~dp0"

echo ============================================
echo   Zipp Desktop Build
echo ============================================
echo.

rem Step 1: Build FormLogic (Rust WASM)
echo [1/5] Building FormLogic WASM...
pushd "%DIR%..\formlogic-rust"
rustup target add wasm32-unknown-unknown >nul 2>&1
cargo build -p formlogic-wasm --target wasm32-unknown-unknown --release
if %errorlevel% neq 0 (
    echo Error building FormLogic WASM
    exit /b %errorlevel%
)
wasm-bindgen --target web --out-dir dist-wasm "target\wasm32-unknown-unknown\release\formlogic_wasm.wasm"
if %errorlevel% neq 0 (
    echo Error running wasm-bindgen
    exit /b %errorlevel%
)
popd

rem Copy WASM artifacts to zipp packages
echo    Copying WASM artifacts...
copy /y "%DIR%..\formlogic-rust\dist-wasm\formlogic_wasm_bg.wasm" "%DIR%packages\zipp-desktop\public\" >nul
xcopy /y /q "%DIR%..\formlogic-rust\dist-wasm\*" "%DIR%packages\zipp-core\node_modules\formlogic-lang\" >nul
xcopy /y /q "%DIR%..\formlogic-rust\dist-wasm\*" "%DIR%packages\zipp-desktop\node_modules\formlogic-lang\" >nul
if exist "%DIR%node_modules\.vite" rmdir /s /q "%DIR%node_modules\.vite"

rem Step 2: Build zipp-core
echo.
echo [2/5] Building zipp-core...
pushd "%DIR%packages\zipp-core"
call npm run build
if %errorlevel% neq 0 (
    echo Error building zipp-core
    exit /b %errorlevel%
)
popd

rem Step 3: Build zipp-ui-components
echo.
echo [3/5] Building zipp-ui-components...
pushd "%DIR%packages\zipp-ui-components"
call npm run build
if %errorlevel% neq 0 (
    echo Error building zipp-ui-components
    exit /b %errorlevel%
)
popd

rem Step 4: Build plugins (from zipp-core/modules to resources/plugins)
echo.
echo [4/5] Building plugins...
pushd "%DIR%packages\zipp-desktop"
call npm run build:plugins
if %errorlevel% neq 0 (
    echo Error building plugins
    exit /b %errorlevel%
)
popd

rem Step 5: Build zipp-desktop and create installer
echo.
echo [5/5] Building zipp-desktop and creating installer...
pushd "%DIR%packages\zipp-desktop"
call npm run build
if %errorlevel% neq 0 (
    echo Error building zipp-desktop
    exit /b %errorlevel%
)

rem Use short target dir to avoid Windows path length issues
rem Uses %TEMP%\zipp-build or falls back to relative path
if defined TEMP (
    set CARGO_TARGET_DIR=%TEMP%\zipp-build
) else (
    set CARGO_TARGET_DIR=.\target
)
call npx tauri build --target x86_64-pc-windows-msvc
if %errorlevel% neq 0 (
    echo Error creating installer
    exit /b %errorlevel%
)
popd

echo.
echo ============================================
echo   Build Complete!
echo ============================================
echo.
echo Installer location: packages\zipp-desktop\src-tauri\target\release\bundle\

endlocal

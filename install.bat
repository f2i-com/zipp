@echo off
setlocal

rem Zipp Desktop Installation Script
rem Installs dependencies for all packages

rem Get the directory where the script is located
set "DIR=%~dp0"

echo ============================================
echo   Zipp Desktop Dependency Installation
echo ============================================
echo.

rem Check formlogic-rust exists as sibling
set "FORMLOGIC_DIR=%DIR%..\formlogic-rust"
if not exist "%FORMLOGIC_DIR%" (
    echo Error: formlogic-rust not found at %FORMLOGIC_DIR%
    echo Please clone formlogic-rust as a sibling of the zipp directory.
    exit /b 1
)

rem Step 1: Build FormLogic WASM
echo [1/5] Building FormLogic WASM...
rustup target add wasm32-unknown-unknown >nul 2>&1
pushd "%FORMLOGIC_DIR%"
cargo build -p formlogic-wasm --target wasm32-unknown-unknown --release
if %errorlevel% neq 0 (
    echo Error building FormLogic WASM
    exit /b %errorlevel%
)
wasm-bindgen --target web --out-dir dist-wasm ".\target\wasm32-unknown-unknown\release\formlogic_wasm.wasm"
if %errorlevel% neq 0 (
    echo Error running wasm-bindgen. Install with: cargo install wasm-bindgen-cli
    exit /b %errorlevel%
)
if not exist "dist-wasm\package.json" (
    echo {"name":"formlogic-lang","version":"0.1.0","main":"formlogic_wasm.js","types":"formlogic_wasm.d.ts","type":"module"} > dist-wasm\package.json
)
popd

rem Step 2: Install zipp-core dependencies
echo.
echo [2/5] Installing zipp-core dependencies...
pushd "%DIR%packages\zipp-core"
call npm install
if %errorlevel% neq 0 (
    echo Error installing zipp-core dependencies
    exit /b %errorlevel%
)
popd

rem Step 3: Build zipp-core
echo.
echo [3/5] Building zipp-core...
pushd "%DIR%packages\zipp-core"
call npm run build
if %errorlevel% neq 0 (
    echo Error building zipp-core
    exit /b %errorlevel%
)
popd

rem Step 4: Install zipp-ui-components dependencies
echo.
echo [4/5] Installing zipp-ui-components dependencies...
pushd "%DIR%packages\zipp-ui-components"
call npm install
if %errorlevel% neq 0 (
    echo Error installing zipp-ui-components dependencies
    exit /b %errorlevel%
)
popd

rem Step 5: Install zipp-desktop dependencies
echo.
echo [5/5] Installing zipp-desktop dependencies...
pushd "%DIR%packages\zipp-desktop"
call npm install
if %errorlevel% neq 0 (
    echo Error installing zipp-desktop dependencies
    exit /b %errorlevel%
)
popd

echo.
echo ============================================
echo   Installation Complete!
echo ============================================
echo.

endlocal

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

rem Step 1: Install FormLogic dependencies
echo [1/4] Installing FormLogic dependencies...
pushd "%DIR%formlogic-typescript"
call npm install
if %errorlevel% neq 0 (
    echo Error installing FormLogic dependencies
    exit /b %errorlevel%
)
popd

rem Step 2: Install zipp-core dependencies
echo.
echo [2/4] Installing zipp-core dependencies...
pushd "%DIR%packages\zipp-core"
call npm install
if %errorlevel% neq 0 (
    echo Error installing zipp-core dependencies
    exit /b %errorlevel%
)
popd

rem Step 3: Install zipp-ui-components dependencies
echo.
echo [3/4] Installing zipp-ui-components dependencies...
pushd "%DIR%packages\zipp-ui-components"
call npm install
if %errorlevel% neq 0 (
    echo Error installing zipp-ui-components dependencies
    exit /b %errorlevel%
)
popd

rem Step 4: Install zipp-desktop dependencies
echo.
echo [4/4] Installing zipp-desktop dependencies...
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

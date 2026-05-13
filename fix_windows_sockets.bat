@echo off
setlocal enabledelayedexpansion

:: ============================================================
::  SkyGuard AI — Windows Socket Fix
::  Run this ONCE as Administrator before starting the project.
::  Fixes: OSError WinError 10055 (socket buffer exhaustion)
:: ============================================================

echo.
echo  =====================================================
echo   SkyGuard AI - Windows Network Fix
echo  =====================================================
echo.

:: ── Check for Administrator privileges ────────────────────
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  [ERROR] This script must be run as Administrator.
    echo.
    echo  Right-click the file and select:
    echo  "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo  [1/6] Enabling TCP auto-tuning...
netsh int tcp set global autotuninglevel=normal >nul 2>&1
if %errorLevel% equ 0 (echo  [OK]  TCP auto-tuning enabled.) else (echo  [!!]  Skipped - may already be set.)

echo.
echo  [2/6] Enabling RSS (Receive Side Scaling)...
netsh int tcp set global rss=enabled >nul 2>&1
if %errorLevel% equ 0 (echo  [OK]  RSS enabled.) else (echo  [!!]  Skipped.)

echo.
echo  [3/6] Expanding ephemeral port range (10000-65535)...
netsh int ipv4 set dynamicport tcp start=10000 num=55535 >nul 2>&1
if %errorLevel% equ 0 (echo  [OK]  Port range expanded.) else (echo  [!!]  Skipped.)
netsh int ipv6 set dynamicport tcp start=10000 num=55535 >nul 2>&1

echo.
echo  [4/6] Setting TIME_WAIT reuse to recycle dead sockets faster...
netsh int tcp set global timestamps=enabled >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" /v TcpTimedWaitDelay /t REG_DWORD /d 30 /f >nul 2>&1
if %errorLevel% equ 0 (echo  [OK]  TIME_WAIT delay set to 30s.) else (echo  [!!]  Registry write failed - skipped.)

echo.
echo  [5/6] Raising max user port count...
reg add "HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" /v MaxUserPort /t REG_DWORD /d 65534 /f >nul 2>&1
if %errorLevel% equ 0 (echo  [OK]  MaxUserPort set to 65534.) else (echo  [!!]  Registry write failed - skipped.)

echo.
echo  [6/6] Enabling chimney offload...
netsh int tcp set global chimney=enabled >nul 2>&1
echo  [OK]  Done.

echo.
echo  =====================================================
echo   All fixes applied successfully.
echo.
echo   IMPORTANT: You do NOT need to restart your PC.
echo   Changes take effect immediately.
echo.
echo   You can now run your project normally:
echo     Backend  : cd backend ^&^& uvicorn app:app --host 0.0.0.0 --port 8000
echo     Frontend : npm run dev
echo  =====================================================
echo.

:: ── Show current TCP settings summary ─────────────────────
echo  Current TCP settings:
netsh int tcp show global 2>nul | findstr /i "auto-tuning receive-side timestamps chimney"

echo.
pause

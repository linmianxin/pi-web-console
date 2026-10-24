@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Pi 控制台
echo ============================================
echo   Pi 控制台正在启动...
echo   浏览器会自动打开 http://localhost:8000
echo   关闭本窗口即可停止服务
echo ============================================
echo.
rem 2 秒后自动打开浏览器（不影响 node 在前台运行）
start "" /b cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:8000"
node server.mjs
echo.
echo 服务已停止。
pause

@echo off
title Visual Second Brain Launcher
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0run.ps1"
pause

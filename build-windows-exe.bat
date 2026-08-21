@echo off
title Compilar PuterLab Nexus IDE - ejecutable .exe para Windows
echo ========================================================
echo   Compilando PuterLab Nexus IDE en archivo .exe (Windows)
echo ========================================================
echo.
cd /d C:\ARKAIOS\Puter-Lab-Nexus-IDE-main
if not exist "node_modules\electron" (
    echo Instalando dependencias de Electron...
    call npm install
)
echo.
echo Generando paquete ejecutable para Windows...
call npm run dist:win
echo.
echo ========================================================
echo   Compilacion finalizada exitosamente!
echo   El ejecutable .exe se encuentra disponible en:
echo   C:\ARKAIOS\Puter-Lab-Nexus-IDE-main\dist
echo ========================================================
pause

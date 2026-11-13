@echo off
chcp 65001 >nul
title Atualizador do App - Nome, Ícone, Git e VPS
cls

echo ============================================================
echo      🚀 PERSONALIZADOR AUTOMÁTICO DO APP ANDROID
echo ============================================================
echo.
echo Este assistente permite trocar o NOME e o ÍCONE do aplicativo.
echo Após informar, ele fará tudo sozinho:
echo  1. Modifica o nome e os recursos do Android
echo  2. Aplica o novo ícone em todas as resoluções
echo  3. Envia o código para o GitHub (Rayan-Novik/Rastreador)
echo  4. Dispara a compilação de um NOVO APK na nuvem
echo  5. Conecta na VPS e atualiza o servidor automaticamente!
echo.
echo ============================================================
echo.

set /p APP_NAME="👉 Digite o NOVO NOME do aplicativo (ex: Gtranslater): "
if "%APP_NAME%"=="" (
    echo [!] O nome não pode ficar em branco.
    pause
    exit /b
)

echo.
echo 👉 Deseja trocar o ÍCONE do aplicativo?
echo    (Deixe em branco e aperte ENTER para manter o ícone atual, ou
echo     digite o caminho da nova imagem .png, ex: novo_icone.png):
set /p APP_ICON="Caminho da imagem: "

echo.
echo ============================================================
echo Iniciando o processo... Aguarde alguns instantes!
echo ============================================================
echo.

if "%APP_ICON%"=="" (
    python "%~dp0scripts\atualizar_app.py" "%APP_NAME%"
) else (
    python "%~dp0scripts\atualizar_app.py" "%APP_NAME%" "%APP_ICON%"
)

echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul

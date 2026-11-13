# 🛰️ Rastreador GPS em Tempo Real 24/7

<div align="center">

<img src="iconeapk.png" width="120" height="120" alt="Ícone Rastreador GPS" style="border-radius: 24px;" />

## 📱 DOWNLOAD DO APLICATIVO MOBILE (APK)

Clique no botão abaixo para baixar o instalador diretamente no seu celular Android:

[![Baixar APK Rastreador GPS](https://img.shields.io/badge/BAIXAR_APK-RastreadorGPS.apk-22c55e?style=for-the-badge&logo=android&logoColor=white)](https://github.com/Rayan-Novik/Rastreador/releases/download/v1.0.0/RastreadorGPS.apk)
[![Página de Releases](https://img.shields.io/badge/Release_Oficial-v1.0.0-38bdf8?style=for-the-badge&logo=github)](https://github.com/Rayan-Novik/Rastreador/releases/tag/v1.0.0)

### 📲 [👉 CLIQUE AQUI PARA BAIXAR O ARQUIVO APK (v1.0.0)](https://github.com/Rayan-Novik/Rastreador/releases/download/v1.0.0/RastreadorGPS.apk)

---

</div>

## 📌 Guia Rápido: Como Instalar e Ativar no Celular

1. **Baixar o APK**: Toque no link verde acima direto pelo celular Android.
2. **Instalar**: Abra o arquivo `RastreadorGPS.apk` baixado e selecione **Instalar** (se o Android perguntar sobre fontes desconhecidas, clique em *Permitir desta fonte*).
3. **Configuração e Permissões**:
   - Abra o aplicativo **Rastreador GPS**.
   - Defina o nome do aparelho (ex: `Celular Filho`).
   - O servidor já vem configurado: `http://169.58.140.109:6548`.
   - Mantenha a opção **"Rastrear em 2° plano (24/7)"** ativada.
   - Toque em **"INICIAR RASTREAMENTO"**.
4. **Permissão de Segundo Plano**:
   - Quando o sistema solicitar a permissão de localização, selecione:  
     👉 **"Permitir o tempo todo"** *(Allow all the time)*.
   - O app exibirá uma notificação fixa na barra de status indicando que o rastreamento está ativo 24 horas por dia.

---

## 🌐 Alternativa Web PWA (Sem precisar instalar APK)

Se preferir não instalar o arquivo APK, o sistema possui versão web instalável:
1. No navegador do celular (Chrome ou Safari), acesse:
   ```text
   http://169.58.140.109:6548/tracker.html
   ```
2. Toque no botão de menu do navegador (3 pontinhos) e clique em **"Adicionar à tela inicial"**.
3. O ícone oficial será adicionado à tela do celular como um aplicativo.

---

## 🗺️ Painel Web do Mapa em Tempo Real

Para acompanhar o celular no mapa interativo:

- **Acesso direto pelo navegador:** [http://169.58.140.109:6548](http://169.58.140.109:6548)
- **Local (no seu PC):** [http://localhost:6548](http://localhost:6548)

### Recursos do Painel:
- **Mapas sem restrição de API**: OpenStreetMap, Satélite Real (ArcGIS ESRI), Ruas e Topográfico.
- **Telemetria completa**: Velocidade em tempo real (km/h), nível de bateria do celular, raio de precisão do GPS e direção.
- **Histórico e Rota**: Traçado contínuo da rota percorrida pelo aparelho.
- **Banco de Dados SQL**: Gravação automática em tempo real em arquivo SQL (`data/database.sql`) com botão de download no próprio painel.

---

## 🚀 Como Rodar o Backend na VPS (`169.58.140.109`)

1. **Liberar a porta 6548 no firewall da VPS:**
   ```bash
   sudo ufw allow 6548/tcp
   sudo ufw reload
   ```

2. **Baixar o repositório na VPS:**
   ```bash
   git clone https://github.com/Rayan-Novik/Rastreador.git /var/www/rastreador
   cd /var/www/rastreador
   npm install
   ```

3. **Iniciar em segundo plano 24h com PM2:**
   ```bash
   sudo npm install -g pm2
   pm2 start server/server.js --name "rastreador-gps"
   pm2 save
   pm2 startup
   ```

---

## 💾 Banco de Dados SQL
O banco grava todas as coordenadas recebidas no arquivo `data/database.sql`. Você pode fazer o download do arquivo SQL pelo painel ou acessando:
```text
http://169.58.140.109:6548/api/database.sql
```

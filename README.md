# 🛰️ Rastreador GPS em Tempo Real 24/7

Sistema completo de rastreamento e telemetria GPS em tempo real para monitorar celulares, com mapa interativo (OpenStreetMap / Leaflet), histórico de percurso e banco de dados baseado em arquivos `.sql`.

---

## 📋 Arquitetura do Projeto

- **Backend (Node.js + Express + Socket.IO)**: 
  - API REST e WebSocket com baixa latência para transmissão de coordenadas contínuas.
  - Gravação automática de todas as transações em arquivo SQL (`data/database.sql`).
  - Porta padrão configurada: `6548`.
- **Painel Web (Dashboard)**:
  - Mapa interativo em tempo real via **Leaflet / OpenStreetMap** (sem custo de API).
  - Marcador dinâmico de GPS com raio de precisão e bússola de direção.
  - Telemetria HUD: Velocidade (km/h), Nível de bateria, Precisão do satélite, Status online/offline e Última atualização.
  - Desenho e histórico da rota percorrida (polylines).
- **Rastreador Mobile (`/tracker.html`)**:
  - Interface otimizada para celular com PWA instalável.
  - Coleta precisa via `navigator.geolocation.watchPosition` (GPS satélite).
  - Monitoramento de bateria e Screen Wake Lock para manter a transmissão ativa.

---

## 🚀 Como Executar Localmente

1. Abra a pasta do projeto:
```bash
cd c:\Users\Suporte-13\Desktop\Rayan\rastreador
```

2. Instale as dependências (já instaladas):
```bash
npm install
```

3. Inicie o servidor:
```bash
npm start
```

- **Painel Web (Mapa):** [http://localhost:6548](http://localhost:6548)
- **Rastreador do Celular:** [http://localhost:6548/tracker.html](http://localhost:6548/tracker.html)

---

## 🌐 Como Subir o Backend na VPS (Linux)

### 1. Conectar via SSH na sua VPS:
```bash
ssh root@169.58.140.109
```

### 2. Liberar a porta 6548 no Firewall:
```bash
sudo ufw allow 6548/tcp
sudo ufw reload
```

### 3. Instalar Node.js e PM2 (caso ainda não tenha):
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo npm install -g pm2
```

### 4. Clonar ou copiar o projeto para a VPS:
```bash
# Na pasta de sua escolha (ex: /var/www/rastreador):
mkdir -p /var/www/rastreador
cd /var/www/rastreador

# Copie os arquivos do projeto para cá e execute:
npm install
```

### 5. Iniciar o backend rodando 24h em segundo plano com PM2:
```bash
pm2 start server/server.js --name "gps-tracker"
pm2 save
pm2 startup
```

Agora o backend estará rodando 24 horas por dia na porta `6548`!

---

## 📱 Como Usar no Celular para Rastrear

1. No celular do seu filho, abra o navegador (Chrome ou Safari) e acesse:
   ```text
   http://169.58.140.109:6548/tracker.html
   ```
2. Defina o nome do aparelho (ex: `Celular Filho`).
3. Toque no botão verde **"Iniciar Rastreamento"**.
4. Quando o navegador solicitar a permissão de localização, selecione **"Permitir sempre"** ou **"Durante o uso do app"**.
5. **Dica PWA:** No Chrome do celular, toque no menu de 3 pontinhos e clique em **"Adicionar à tela inicial"**. O rastreador se transformará em um ícone de aplicativo nativo na tela do aparelho.

---

## ⚡ Como Hospedar o Painel Web na Vercel (Opcional)

Se você preferir rodar a interface web na Vercel e o backend na sua VPS:

1. Faça o deploy da pasta do projeto na [Vercel](https://vercel.com) (o arquivo `vercel.json` já está configurado para servir a pasta `public`).
2. Acesse seu painel no link gerado pela Vercel (ex: `https://seu-rastreador.vercel.app`).
3. Clique no botão **"Configs"** no canto inferior esquerdo da barra lateral.
4. Digite a URL da sua VPS: `http://169.58.140.109:6548` e clique em **Salvar e Reconectar**.
5. Pronto! O painel na Vercel se conectará em tempo real com a VPS.

---

## 💾 Banco de Dados SQL

- Todo sinal de GPS recebido é salvo imediatamente no arquivo `data/database.sql`.
- Você pode baixar o arquivo SQL a qualquer momento diretamente pelo painel clicando em **"Baixar SQL"** ou acessando:
  ```text
  http://169.58.140.109:6548/api/database.sql
  ```

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const db = require('./db');
const zapo = require('./zapo');

const app = express();
const server = http.createServer(app);

// Configuração do Socket.IO com suporte completo a CORS para Vercel / Apps externos
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 6548;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos do painel Web e do rastreador mobile
app.use(express.static(path.join(__dirname, '..', 'public')));

// ==========================================
// ROTAS DA API REST
// ==========================================

/**
 * Health check da API
 */
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    service: 'GPS Realtime Tracker Backend',
    port: PORT,
    time: new Date().toISOString()
  });
});

/**
 * Listar todos os dispositivos e seus status atuais
 */
app.get('/api/devices', (req, res) => {
  try {
    const devices = db.getAllDevices();
    res.json({ success: true, count: devices.length, devices });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Obter dados de um dispositivo específico
 */
app.get('/api/devices/:id', (req, res) => {
  try {
    const device = db.getDevice(req.params.id);
    if (!device) {
      return res.status(404).json({ success: false, message: 'Dispositivo não encontrado' });
    }
    res.json({ success: true, device });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Obter histórico de localizações (trilha/percurso)
 */
app.get('/api/devices/:id/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 300;
    const history = db.getDeviceHistory(req.params.id, limit);
    res.json({ success: true, count: history.length, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Limpar histórico de um dispositivo
 */
app.delete('/api/devices/:id/history', (req, res) => {
  try {
    db.clearDeviceHistory(req.params.id);
    io.emit('device_history_cleared', { deviceId: req.params.id });
    res.json({ success: true, message: 'Histórico limpo com sucesso' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Endpoint principal para receber localização do celular via HTTP POST
 */
app.post('/api/location', (req, res) => {
  try {
    const { deviceId, name, latitude, longitude, accuracy, speed, heading, altitude, battery, timestamp } = req.body;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId é obrigatório' });
    }
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, error: 'latitude e longitude são obrigatórias' });
    }

    const result = db.saveLocation({
      deviceId,
      name: name || deviceId,
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      altitude,
      battery,
      timestamp: timestamp || new Date().toISOString()
    });

    // Emissão em tempo real para todos os clientes conectados no painel web
    io.emit('location_update', result);

    res.json({
      success: true,
      message: 'Localização atualizada e registrada no SQL com sucesso',
      data: result
    });
  } catch (err) {
    console.error('[ERRO /api/location]', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// Inicializar serviço WhatsApp Zapo com Socket.IO
zapo.init(io);

// ==========================================
// ROTAS DO WHATSAPP (ZAPO)
// ==========================================

/**
 * Obter status da conexão WhatsApp (QR code, conectado, etc)
 */
app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    success: true,
    status: zapo.status,
    qr: zapo.qrDataUrl,
    me: zapo.me
  });
});

/**
 * Listar conversas e mensagens
 */
app.get('/api/whatsapp/conversations', (req, res) => {
  res.json({
    success: true,
    conversations: zapo.getConversations()
  });
});

/**
 * Enviar mensagem de texto via WhatsApp
 */
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { to, text } = req.body;
    if (!to || !text) {
      return res.status(400).json({ success: false, error: 'Campos to e text são obrigatórios' });
    }
    const sent = await zapo.sendTextMessage(to, text);
    res.json({ success: true, message: 'Mensagem enviada com sucesso', data: sent });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Desconectar WhatsApp (logout / reset)
 */
app.post('/api/whatsapp/logout', async (req, res) => {
  try {
    await zapo.logout();
    res.json({ success: true, message: 'WhatsApp desconectado com sucesso' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Download ou visualização do arquivo SQL gerado no servidor
 */
app.get('/api/database.sql', (req, res) => {
  try {
    const sqlContent = db.getSqlFileContent();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="database.sql"');
    res.send(sqlContent);
  } catch (err) {
    res.status(500).send('Erro ao ler arquivo SQL: ' + err.message);
  }
});

// ==========================================
// WEBSOCKET (SOCKET.IO) EM TEMPO REAL
// ==========================================

io.on('connection', (socket) => {
  console.log(`[WS] Novo cliente conectado: ${socket.id}`);

  // Envia a lista atual de dispositivos para o recém conectado
  socket.emit('devices_list', db.getAllDevices());

  // Recebimento de localização diretamente por WebSocket (baixa latência)
  socket.on('tracker:send_location', (data) => {
    try {
      if (!data || !data.deviceId) return;
      const result = db.saveLocation(data);
      // Notifica todos os painéis
      io.emit('location_update', result);
    } catch (err) {
      console.error('[WS Error] tracker:send_location:', err.message);
      socket.emit('tracker:error', { message: err.message });
    }
  });

  // Solicitação de histórico sob demanda
  socket.on('dashboard:request_history', ({ deviceId, limit = 200 }) => {
    const history = db.getDeviceHistory(deviceId, limit);
    socket.emit('device_history', { deviceId, history });
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Cliente desconectado: ${socket.id}`);
  });
});

// Obter os IPs da máquina para exibição amigável
function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const k in interfaces) {
    for (const k2 in interfaces[k]) {
      const address = interfaces[k][k2];
      if (address.family === 'IPv4' && !address.internal) {
        addresses.push(address.address);
      }
    }
  }
  return addresses;
}

// Iniciar servidor
server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIps();
  console.log('================================================================');
  console.log('🚀 SERVIDOR GPS EM TEMPO REAL RODANDO COM SUCESSO!');
  console.log(`📡 Porta: ${PORT}`);
  console.log(`🌐 Painel Web: http://localhost:${PORT}`);
  console.log(`📱 Rastreador Mobile: http://localhost:${PORT}/tracker.html`);
  if (ips.length > 0) {
    console.log('----------------------------------------------------------------');
    console.log('🔗 Acesso pela rede local / celular na mesma rede:');
    ips.forEach(ip => {
      console.log(`   Painel:     http://${ip}:${PORT}`);
      console.log(`   Rastreador: http://${ip}:${PORT}/tracker.html`);
    });
  }
  console.log('----------------------------------------------------------------');
  console.log(`💾 Banco SQL: ${db.SQL_FILE}`);
  console.log('================================================================');
});

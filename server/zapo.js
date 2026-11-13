const { WaClient, createStore, createNoopLogger, proto } = require('zapo-js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const AUTH_FILE = path.join(__dirname, '..', 'data', 'whatsapp-auth.json');
const MESSAGES_FILE = path.join(__dirname, '..', 'data', 'whatsapp-messages.json');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.io = null;
    this.status = 'disconnected'; // disconnected, connecting, qrcode, connected
    this.qrDataUrl = null;
    this.pairingCode = null;
    this.me = null;
    this.messages = []; // cache de mensagens { id, chatJid, sender, text, timestamp, fromMe, deleted: boolean }
    this.loadMessages();
  }

  loadMessages() {
    try {
      if (fs.existsSync(MESSAGES_FILE)) {
        this.messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
      }
    } catch (e) {
      console.warn('[Zapo] Erro ao carregar mensagens salvas:', e.message);
      this.messages = [];
    }
  }

  saveMessages() {
    try {
      fs.mkdirSync(path.dirname(MESSAGES_FILE), { recursive: true });
      fs.writeFileSync(MESSAGES_FILE, JSON.stringify(this.messages.slice(-3000), null, 2), 'utf8');
    } catch (e) {
      console.error('[Zapo] Erro ao salvar mensagens:', e.message);
    }
  }

  init(io) {
    this.io = io;
    this.startClient();
  }

  startClient() {
    try {
      const store = createStore({
        backends: {
          file: {
            stores: {
              auth: (sessionId) => ({
                load: async () => {
                  if (fs.existsSync(AUTH_FILE)) {
                    try {
                      return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
                    } catch (err) {
                      return null;
                    }
                  }
                  return null;
                },
                save: async (credentials) => {
                  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
                  fs.writeFileSync(AUTH_FILE, JSON.stringify(credentials, null, 2), 'utf8');
                  console.log('[Zapo] Credenciais salvas com sucesso!');
                },
                clear: async () => {
                  if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
                },
                destroy: async () => {}
              })
            }
          }
        },
        providers: {
          auth: 'file',
          signal: 'memory',
          preKey: 'memory',
          session: 'memory',
          identity: 'memory',
          senderKey: 'memory',
          appState: 'memory',
          messages: 'memory',
          threads: 'memory',
          contacts: 'memory',
          privacyToken: 'memory'
        }
      });

      this.client = new WaClient(
        {
          store,
          sessionId: 'default',
          connectTimeoutMs: 30000,
          nodeQueryTimeoutMs: 30000
        },
        createNoopLogger()
      );

      this.setupEvents();
      this.connect();
    } catch (err) {
      console.error('[Zapo] Falha ao inicializar client:', err);
    }
  }

  setupEvents() {
    const client = this.client;

    client.on('auth_qr', async ({ qr }) => {
      this.status = 'qrcode';
      this.qrDataUrl = await qrcode.toDataURL(qr);
      console.log('[Zapo] Novo QR Code gerado para conexão.');
      if (this.io) {
        this.io.emit('whatsapp:status', {
          status: this.status,
          qr: this.qrDataUrl,
          me: null
        });
      }
    });

    client.on('auth_paired', ({ credentials }) => {
      this.status = 'connected';
      this.qrDataUrl = null;
      this.me = credentials.meJid;
      console.log('[Zapo] Pareado com sucesso! JID:', credentials.meJid);
      if (this.io) {
        this.io.emit('whatsapp:status', {
          status: this.status,
          qr: null,
          me: this.me
        });
      }
    });

    client.on('connection', ({ state }) => {
      console.log('[Zapo] Estado da conexão:', state);
      if (state === 'open') {
        this.status = 'connected';
        this.qrDataUrl = null;
      } else if (state === 'close') {
        this.status = 'disconnected';
      } else if (state === 'connecting') {
        this.status = 'connecting';
      }

      if (this.io) {
        this.io.emit('whatsapp:status', {
          status: this.status,
          qr: this.qrDataUrl,
          me: this.me
        });
      }
    });

    // 1. Mensagens Recebidas / Enviadas
    client.on('message', (event) => {
      try {
        const text = this.extractMessageText(event.message);
        if (!text && !event.message) return;

        const chatJid = event.key.remoteJid;
        const msgId = event.key.id;
        const fromMe = Boolean(event.key.fromMe);
        const sender = fromMe ? 'Eu' : (event.pushName || event.key.participant || chatJid);
        const timestamp = event.timestampSeconds ? event.timestampSeconds * 1000 : Date.now();

        const record = {
          id: msgId,
          chatJid: chatJid,
          sender: sender,
          text: text || '[Mídia / Anexo]',
          timestamp: new Date(timestamp).toISOString(),
          fromMe: fromMe,
          deleted: false
        };

        this.messages.push(record);
        this.saveMessages();

        if (this.io) {
          this.io.emit('whatsapp:message', record);
        }
      } catch (err) {
        console.warn('[Zapo] Erro ao processar mensagem:', err.message);
      }
    });

    // 2. Mensagens Apagadas (Revoke / ProtocolMessage)
    client.on('message_protocol', (event) => {
      try {
        const protoMsg = event.protocolMessage;
        if (protoMsg && protoMsg.type === proto.Message.ProtocolMessage.Type.REVOKE) {
          const targetKey = protoMsg.key;
          const targetId = targetKey?.id;
          console.log('[Zapo] Mensagem revogada/apagada detectada! ID:', targetId);

          const existing = this.messages.find(m => m.id === targetId);
          if (existing) {
            existing.deleted = true;
            existing.deletedAt = new Date().toISOString();
            this.saveMessages();

            if (this.io) {
              this.io.emit('whatsapp:message_deleted', {
                id: targetId,
                chatJid: existing.chatJid,
                originalText: existing.text,
                deletedAt: existing.deletedAt
              });
            }
          }
        }
      } catch (err) {
        console.warn('[Zapo] Erro ao processar revoke:', err.message);
      }
    });
  }

  extractMessageText(msg) {
    if (!msg) return '';
    if (typeof msg === 'string') return msg;
    if (msg.conversation) return msg.conversation;
    if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
    if (msg.imageMessage?.caption) return `📷 ${msg.imageMessage.caption}`;
    if (msg.videoMessage?.caption) return `🎥 ${msg.videoMessage.caption}`;
    if (msg.documentMessage?.title) return `📄 ${msg.documentMessage.title}`;
    return '';
  }

  async connect() {
    try {
      this.status = 'connecting';
      await this.client.connect();
    } catch (e) {
      console.warn('[Zapo] Conexão pendente de QR code ou reconnect:', e.message);
    }
  }

  async sendTextMessage(to, text) {
    if (!this.client || this.status !== 'connected') {
      throw new Error('WhatsApp não está conectado no momento.');
    }

    // Normaliza número/JID (ex: 5511999999999 -> 5511999999999@s.whatsapp.net)
    let remoteJid = to.trim();
    if (!remoteJid.includes('@')) {
      const clean = remoteJid.replace(/\D/g, '');
      remoteJid = `${clean}@s.whatsapp.net`;
    }

    const res = await this.client.message.send(remoteJid, {
      type: 'text',
      text: text
    });

    const msgId = res?.stanzaId || `sent_${Date.now()}`;
    const record = {
      id: msgId,
      chatJid: remoteJid,
      sender: 'Eu',
      text: text,
      timestamp: new Date().toISOString(),
      fromMe: true,
      deleted: false
    };

    this.messages.push(record);
    this.saveMessages();

    if (this.io) {
      this.io.emit('whatsapp:message', record);
    }

    return record;
  }

  getConversations() {
    const map = new Map();
    // Agrupa mensagens por chatJid
    for (const msg of this.messages) {
      const jid = msg.chatJid;
      if (!map.has(jid)) {
        map.set(jid, {
          chatJid: jid,
          lastMessage: msg.text,
          lastTimestamp: msg.timestamp,
          hasDeleted: msg.deleted,
          senderName: msg.fromMe ? 'Eu' : msg.sender,
          messages: []
        });
      }
      const chat = map.get(jid);
      chat.lastMessage = msg.text;
      chat.lastTimestamp = msg.timestamp;
      if (msg.deleted) chat.hasDeleted = true;
      chat.messages.push(msg);
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp));
  }

  async logout() {
    try {
      if (fs.existsSync(AUTH_FILE)) {
        fs.unlinkSync(AUTH_FILE);
      }
      this.status = 'disconnected';
      this.qrDataUrl = null;
      this.me = null;
      if (this.client) {
        // reinicia
        this.startClient();
      }
    } catch (e) {
      console.error('[Zapo] Erro ao deslogar:', e.message);
    }
  }
}

module.exports = new WhatsAppService();

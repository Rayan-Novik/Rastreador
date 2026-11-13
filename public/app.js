/**
 * GPS REALTIME TRACKER - DASHBOARD SCRIPT
 * Gerencia mapa Leaflet, conexão Socket.io e telemetria
 */

// Configuração da URL do Backend (carrega do localStorage se estiver na Vercel ou usa origem atual)
const DEFAULT_BACKEND = window.location.origin;
let backendUrl = localStorage.getItem('gps_backend_url') || DEFAULT_BACKEND;

// Elementos DOM
const connectionBadge = document.getElementById('connectionBadge');
const connectionText = document.getElementById('connectionText');
const deviceSelect = document.getElementById('deviceSelect');
const deviceCountBadge = document.getElementById('deviceCountBadge');
const statusIndicator = document.getElementById('statusIndicator');

const hudLastUpdate = document.getElementById('hudLastUpdate');
const hudTimeAgo = document.getElementById('hudTimeAgo');
const hudSpeed = document.getElementById('hudSpeed');
const hudMovingState = document.getElementById('hudMovingState');
const hudBattery = document.getElementById('hudBattery');
const hudBatteryState = document.getElementById('hudBatteryState');
const hudAccuracy = document.getElementById('hudAccuracy');
const hudAccuracyLevel = document.getElementById('hudAccuracyLevel');
const hudHeading = document.getElementById('hudHeading');
const hudCoords = document.getElementById('hudCoords');
const hudAltitude = document.getElementById('hudAltitude');

const btnFollow = document.getElementById('btnFollow');
const btnToggleTrail = document.getElementById('btnToggleTrail');
const btnOpenMaps = document.getElementById('btnOpenMaps');
const btnClearTrail = document.getElementById('btnClearTrail');
const btnRecenterFloat = document.getElementById('btnRecenterFloat');
const btnLayerToggle = document.getElementById('btnLayerToggle');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

// Modal Config
const configModal = document.getElementById('configModal');
const btnConfigModal = document.getElementById('btnConfigModal');
const btnCancelConfig = document.getElementById('btnCancelConfig');
const btnSaveConfig = document.getElementById('btnSaveConfig');
const backendUrlInput = document.getElementById('backendUrlInput');

// Estados
let currentDeviceId = null;
let devicesMap = new Map();
let autoFollow = true;
let showTrail = true;
let map, marker, accuracyCircle, routePolyline;
let activeTileLayer;
let currentLayerIndex = 0;
let routeCoordinates = [];

// Provedores de Tiles do Mapa (100% Livres, Sem Exigência de API Key e Sem Marcas D'água)
const tileProviders = [
  {
    name: 'OpenStreetMap (Padrão)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  },
  {
    name: 'Satélite Real (ArcGIS ESRI)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  },
  {
    name: 'Ruas & Cidades (ArcGIS ESRI)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
  },
  {
    name: 'Topográfico (OpenTopoMap)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
  }
];

/**
 * Inicialização do Mapa Leaflet
 */
function initMap() {
  // Posição inicial padrão (Brasil central ou última posição conhecida)
  const defaultPos = [-15.7801, -47.9292]; // Brasília

  map = L.map('map', {
    zoomControl: true,
    attributionControl: false
  }).setView(defaultPos, 5);

  activeTileLayer = L.tileLayer(tileProviders[0].url, {
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
    attribution: tileProviders[0].attribution
  }).addTo(map);

  // Ícone animado personalizado para o GPS do celular
  const pulseIcon = L.divIcon({
    className: 'custom-gps-marker',
    html: `
      <div class="marker-pulse"></div>
      <div class="marker-inner" id="markerHead"></div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });

  marker = L.marker(defaultPos, { icon: pulseIcon }).addTo(map);

  // Círculo de precisão do GPS (em metros)
  accuracyCircle = L.circle(defaultPos, {
    radius: 10,
    color: '#38bdf8',
    fillColor: '#38bdf8',
    fillOpacity: 0.15,
    weight: 1
  }).addTo(map);

  // Polylinha para trilha de rota percorrida
  routePolyline = L.polyline([], {
    color: '#38bdf8',
    weight: 4,
    opacity: 0.8,
    smoothFactor: 1
  }).addTo(map);

  // Ao arrastar o mapa manualmente, desativa temporariamente o autoFollow
  map.on('dragstart', () => {
    autoFollow = false;
    btnFollow.classList.remove('btn-primary');
    btnFollow.classList.add('btn-secondary');
  });
}

/**
 * Alternar camada visual do mapa
 */
function cycleMapLayer() {
  currentLayerIndex = (currentLayerIndex + 1) % tileProviders.length;
  const nextProvider = tileProviders[currentLayerIndex];
  map.removeLayer(activeTileLayer);
  activeTileLayer = L.tileLayer(nextProvider.url, {
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
    attribution: nextProvider.attribution
  }).addTo(map);
  showToast(`Mapa alterado: ${nextProvider.name}`);
}

/**
 * Exibe notificação temporária
 */
function showToast(msg) {
  toastMsg.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

/**
 * Atualiza o HUD com dados de telemetria
 */
function updateHUD(dev) {
  if (!dev) return;

  // Status online / offline
  const isOnline = dev.status === 'online';
  statusIndicator.innerHTML = isOnline ? '● Online' : '○ Offline';
  statusIndicator.style.color = isOnline ? 'var(--accent-green)' : 'var(--accent-rose)';

  // Data / Hora
  if (dev.last_updated) {
    const d = new Date(dev.last_updated);
    hudLastUpdate.textContent = d.toLocaleTimeString('pt-BR') + ' ' + d.toLocaleDateString('pt-BR');
    
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 10) {
      hudTimeAgo.textContent = 'Agora mesmo (tempo real)';
    } else if (diffSec < 60) {
      hudTimeAgo.textContent = `Há ${diffSec} segundos atrás`;
    } else {
      hudTimeAgo.textContent = `Há ${Math.floor(diffSec / 60)} min atrás`;
    }
  }

  // Velocidade (converte m/s para km/h se necessário)
  let speedKmH = 0;
  if (dev.last_speed !== null && dev.last_speed !== undefined) {
    speedKmH = Math.round(dev.last_speed * 3.6);
  }
  hudSpeed.innerHTML = `${speedKmH} <small style="font-size:0.75rem; font-weight:normal;">km/h</small>`;
  hudMovingState.textContent = speedKmH > 3 ? '⚡ Em movimento' : '🅿️ Parado';

  // Bateria
  if (dev.last_battery !== null && dev.last_battery !== undefined) {
    hudBattery.textContent = `${dev.last_battery}%`;
    hudBatteryState.textContent = dev.last_battery <= 20 ? '⚠️ Bateria Fraca' : 'Bateria OK';
  } else {
    hudBattery.textContent = '-- %';
    hudBatteryState.textContent = 'Sem sensor';
  }

  // Precisão
  if (dev.last_accuracy !== null && dev.last_accuracy !== undefined) {
    const acc = Math.round(dev.last_accuracy);
    hudAccuracy.textContent = `± ${acc} m`;
    if (acc <= 10) hudAccuracyLevel.textContent = '🎯 Excelente (GPS Satélite)';
    else if (acc <= 30) hudAccuracyLevel.textContent = '🟡 Média precisão';
    else hudAccuracyLevel.textContent = '🟠 Baixa precisão (Torre/WiFi)';
  } else {
    hudAccuracy.textContent = '-- m';
  }

  // Direção / Ângulo da bússola
  if (dev.last_heading !== null && dev.last_heading !== undefined && !isNaN(dev.last_heading)) {
    const heading = Math.round(dev.last_heading);
    hudHeading.textContent = `${heading}°`;
  } else {
    hudHeading.textContent = '-- °';
  }

  // Coordenadas
  if (dev.last_latitude && dev.last_longitude) {
    hudCoords.textContent = `${dev.last_latitude.toFixed(6)}, ${dev.last_longitude.toFixed(6)}`;
  }

  // Altitude
  if (dev.last_altitude !== null && dev.last_altitude !== undefined) {
    hudAltitude.textContent = `Altitude: ${Math.round(dev.last_altitude)} m`;
  } else {
    hudAltitude.textContent = 'Altitude: --';
  }
}

/**
 * Move o marcador no mapa suavemente com Filtro de Deslocamento Mínimo
 */
function updateMapLocation(lat, lng, accuracy, heading) {
  const newLatLng = new L.LatLng(lat, lng);

  marker.setLatLng(newLatLng);
  accuracyCircle.setLatLng(newLatLng);
  if (accuracy) {
    accuracyCircle.setRadius(accuracy);
  }

  // Verifica se o ponto realmente teve deslocamento significativo antes de adicionar à linha da rota
  if (routeCoordinates.length > 0) {
    const lastPoint = routeCoordinates[routeCoordinates.length - 1];
    const distMeters = map.distance(lastPoint, newLatLng);

    // Se o celular se moveu menos de 10 metros, não cria zigue-zague na linha
    if (distMeters >= 10) {
      routeCoordinates.push(newLatLng);
      if (showTrail) {
        routePolyline.setLatLngs(routeCoordinates);
      }
    }
  } else {
    routeCoordinates.push(newLatLng);
    if (showTrail) {
      routePolyline.setLatLngs(routeCoordinates);
    }
  }

  if (autoFollow) {
    map.panTo(newLatLng, { animate: true, duration: 1 });
    if (map.getZoom() < 16) {
      map.setZoom(17);
    }
  }
}

/**
 * Carrega a rota/histórico de um dispositivo (com filtro de pontos estáticos)
 */
async function loadDeviceHistory(deviceId) {
  try {
    const res = await fetch(`${backendUrl}/api/devices/${deviceId}/history?limit=300`);
    const data = await res.json();
    if (data.success && Array.isArray(data.history)) {
      const filtered = [];
      data.history.forEach(pt => {
        const p = new L.LatLng(pt.latitude, pt.longitude);
        if (filtered.length === 0) {
          filtered.push(p);
        } else {
          const prev = filtered[filtered.length - 1];
          // Só desenha se houver pelo menos 10m de distância entre pontos
          if (map.distance(prev, p) >= 10) {
            filtered.push(p);
          }
        }
      });

      routeCoordinates = filtered;
      if (showTrail) {
        routePolyline.setLatLngs(routeCoordinates);
      }
    }
  } catch (err) {
    console.error('Erro ao carregar histórico:', err);
  }
}

/**
 * Conexão Socket.IO com o backend
 */
let socket;
function setupSocket() {
  connectionBadge.className = 'server-badge offline';
  connectionText.textContent = 'Conectando...';

  // Se a biblioteca do socket.io falhar (por exemplo, na Vercel carregando de domínio cruzado sem script local)
  if (typeof io === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.8.1/socket.io.min.js';
    script.onload = () => connectSocket();
    document.head.appendChild(script);
  } else {
    connectSocket();
  }
}

function connectSocket() {
  if (socket) socket.disconnect();

  console.log('Conectando ao backend Socket.IO:', backendUrl);
  socket = io(backendUrl, {
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    timeout: 10000
  });

  socket.on('connect', () => {
    connectionBadge.className = 'server-badge';
    connectionText.textContent = 'Online 24/7';
    showToast('Conectado ao servidor de rastreamento');
    fetchDevicesList();
  });

  socket.on('disconnect', () => {
    connectionBadge.className = 'server-badge offline';
    connectionText.textContent = 'Desconectado';
  });

  socket.on('connect_error', (err) => {
    connectionBadge.className = 'server-badge offline';
    connectionText.textContent = 'Erro Conexão';
    console.warn('Erro ao conectar ao socket:', err.message);
  });

  // Lista inicial de dispositivos recebida
  socket.on('devices_list', (devices) => {
    renderDevicesList(devices);
  });

  // Atualização em tempo real de uma localização
  socket.on('location_update', ({ device, location }) => {
    devicesMap.set(device.id, device);

    // Se for o dispositivo selecionado ou o primeiro recebido
    if (!currentDeviceId || currentDeviceId === device.id) {
      if (!currentDeviceId) {
        currentDeviceId = device.id;
      }
      updateHUD(device);
      updateMapLocation(location.latitude, location.longitude, location.accuracy, location.heading);
    }

    renderDevicesSelect();
  });

  socket.on('device_history_cleared', ({ deviceId }) => {
    if (deviceId === currentDeviceId) {
      routeCoordinates = [];
      routePolyline.setLatLngs([]);
      showToast('Histórico do dispositivo foi limpo');
    }
  });

  // Escutar eventos do WhatsApp Zapo
  attachWhatsAppSocketListeners(socket);
}

/**
 * Busca lista de dispositivos via REST
 */
async function fetchDevicesList() {
  try {
    const res = await fetch(`${backendUrl}/api/devices`);
    const data = await res.json();
    if (data.success) {
      renderDevicesList(data.devices);
    }
  } catch (err) {
    console.error('Erro ao buscar dispositivos:', err);
  }
}

/**
 * Atualiza o seletor dropdown de dispositivos
 */
function renderDevicesList(devices) {
  devicesMap.clear();
  devices.forEach(d => devicesMap.set(d.id, d));
  renderDevicesSelect();
}

function renderDevicesSelect() {
  const devices = Array.from(devicesMap.values());
  deviceCountBadge.textContent = `${devices.length} dispositivo(s)`;

  if (devices.length === 0) {
    deviceSelect.innerHTML = '<option value="" disabled selected>Aguardando celular transmitir...</option>';
    return;
  }

  deviceSelect.innerHTML = devices.map(d => `
    <option value="${d.id}" ${d.id === currentDeviceId ? 'selected' : ''}>
      ${d.name || d.id} (${d.status === 'online' ? '🟢 Online' : '⚪ Offline'})
    </option>
  `).join('');

  if (!currentDeviceId && devices.length > 0) {
    selectDevice(devices[0].id);
  }
}

function selectDevice(id) {
  currentDeviceId = id;
  const dev = devicesMap.get(id);
  if (dev) {
    updateHUD(dev);
    if (dev.last_latitude && dev.last_longitude) {
      updateMapLocation(dev.last_latitude, dev.last_longitude, dev.last_accuracy, dev.last_heading);
    }
    loadDeviceHistory(id);
  }
}

// Event Listeners
deviceSelect.addEventListener('change', (e) => {
  selectDevice(e.target.value);
});

btnFollow.addEventListener('click', () => {
  autoFollow = true;
  btnFollow.classList.add('btn-primary');
  btnFollow.classList.remove('btn-secondary');
  if (currentDeviceId && devicesMap.get(currentDeviceId)) {
    const dev = devicesMap.get(currentDeviceId);
    if (dev.last_latitude && dev.last_longitude) {
      map.setView([dev.last_latitude, dev.last_longitude], 17);
    }
  }
  showToast('Centralização automática ativada');
});

btnRecenterFloat.addEventListener('click', () => {
  btnFollow.click();
});

btnToggleTrail.addEventListener('click', () => {
  showTrail = !showTrail;
  if (showTrail) {
    routePolyline.setLatLngs(routeCoordinates);
    btnToggleTrail.innerHTML = '<i class="fa-solid fa-route"></i> Ocultar Rota Percorrida';
    showToast('Rota percorrida visível');
  } else {
    routePolyline.setLatLngs([]);
    btnToggleTrail.innerHTML = '<i class="fa-solid fa-route"></i> Mostrar Rota Percorrida';
    showToast('Rota percorrida oculta');
  }
});

btnOpenMaps.addEventListener('click', () => {
  if (!currentDeviceId) return;
  const dev = devicesMap.get(currentDeviceId);
  if (dev && dev.last_latitude && dev.last_longitude) {
    const url = `https://www.google.com/maps?q=${dev.last_latitude},${dev.last_longitude}`;
    window.open(url, '_blank');
  } else {
    alert('Nenhuma coordenada disponível no momento.');
  }
});

btnClearTrail.addEventListener('click', async () => {
  if (!currentDeviceId) return;
  if (!confirm('Deseja realmente apagar o histórico de percurso deste celular?')) return;

  try {
    const res = await fetch(`${backendUrl}/api/devices/${currentDeviceId}/history`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      routeCoordinates = [];
      routePolyline.setLatLngs([]);
      showToast('Histórico excluído com sucesso');
    }
  } catch (err) {
    alert('Erro ao apagar histórico: ' + err.message);
  }
});

btnLayerToggle.addEventListener('click', cycleMapLayer);

// Modal Configuração Backend
btnConfigModal.addEventListener('click', () => {
  backendUrlInput.value = backendUrl;
  configModal.classList.add('open');
});

btnCancelConfig.addEventListener('click', () => {
  configModal.classList.remove('open');
});

btnSaveConfig.addEventListener('click', () => {
  let val = backendUrlInput.value.trim();
  if (val) {
    if (!val.startsWith('http://') && !val.startsWith('https://')) {
      val = 'http://' + val;
    }
    // Remove trailing slash
    val = val.replace(/\/$/, '');
    backendUrl = val;
    localStorage.setItem('gps_backend_url', val);
    configModal.classList.remove('open');
    showToast(`Conectando a: ${backendUrl}`);
    setupSocket();
  }
});

// ==========================================
// MÓDULO WHATSAPP ZAPO (ATENDIMENTO & APAGADAS)
// ==========================================
const btnOpenWhatsApp = document.getElementById('btnOpenWhatsApp');
const whatsappModal = document.getElementById('whatsappModal');
const btnCloseWhatsApp = document.getElementById('btnCloseWhatsApp');
const btnWaLogout = document.getElementById('btnWaLogout');
const waStatusText = document.getElementById('waStatusText');
const waQrSection = document.getElementById('waQrSection');
const waQrImg = document.getElementById('waQrImg');
const waChatSection = document.getElementById('waChatSection');
const waConversationsList = document.getElementById('waConversationsList');
const waMessagesList = document.getElementById('waMessagesList');
const waCurrentContactName = document.getElementById('waCurrentContactName');
const waCurrentContactJid = document.getElementById('waCurrentContactJid');
const waDeletedBadge = document.getElementById('waDeletedBadge');
const waSendForm = document.getElementById('waSendForm');
const waMsgInput = document.getElementById('waMsgInput');
const btnNewChat = document.getElementById('btnNewChat');

let waCurrentChatJid = null;
let waConversations = [];

btnOpenWhatsApp.addEventListener('click', () => {
  whatsappModal.classList.add('open');
  fetchWhatsAppStatus();
  fetchWhatsAppConversations();
});

btnCloseWhatsApp.addEventListener('click', () => {
  whatsappModal.classList.remove('open');
});

async function fetchWhatsAppStatus() {
  try {
    const res = await fetch(`${backendUrl}/api/whatsapp/status`);
    const data = await res.json();
    if (data.success) {
      updateWhatsAppUI(data);
    }
  } catch (err) {
    console.error('Erro ao buscar status do WhatsApp:', err);
  }
}

async function fetchWhatsAppConversations() {
  try {
    const res = await fetch(`${backendUrl}/api/whatsapp/conversations`);
    const data = await res.json();
    if (data.success && Array.isArray(data.conversations)) {
      waConversations = data.conversations;
      renderConversationsList();
      if (waCurrentChatJid) {
        renderCurrentChatMessages();
      }
    }
  } catch (err) {
    console.error('Erro ao buscar conversas:', err);
  }
}

function updateWhatsAppUI(data) {
  if (data.status === 'connected') {
    waStatusText.innerHTML = `<span style="color:var(--accent-green)">● Conectado (${data.me || 'WhatsApp'})</span>`;
    waQrSection.style.display = 'none';
    waChatSection.style.display = 'flex';
  } else if (data.status === 'qrcode' && data.qr) {
    waStatusText.innerHTML = `<span style="color:var(--accent-amber)">● Escaneie o QR Code</span>`;
    waQrImg.src = data.qr;
    waQrSection.style.display = 'flex';
    waChatSection.style.display = 'none';
  } else {
    waStatusText.innerHTML = `<span style="color:var(--accent-rose)">● Desconectado / Conectando...</span>`;
    waQrSection.style.display = 'none';
    waChatSection.style.display = 'flex';
  }
}

function renderConversationsList() {
  if (waConversations.length === 0) {
    waConversationsList.innerHTML = '<div style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding:15px;">Nenhuma conversa recente</div>';
    return;
  }

  waConversationsList.innerHTML = waConversations.map(c => {
    const isSelected = c.chatJid === waCurrentChatJid;
    const phone = c.chatJid.replace('@s.whatsapp.net', '');
    return `
      <div class="wa-chat-item ${isSelected ? 'active' : ''}" onclick="selectWhatsAppChat('${c.chatJid}')" style="padding:10px; border-radius:8px; cursor:pointer; background: ${isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${isSelected ? 'var(--accent-blue)' : 'transparent'};">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:600; font-size:0.85rem; color:#fff;">${c.senderName || phone}</div>
          ${c.hasDeleted ? '<span style="color:var(--accent-rose); font-size:0.7rem;" title="Contém mensagens apagadas"><i class="fa-solid fa-eye-slash"></i></span>' : ''}
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:3px;">
          ${c.lastMessage}
        </div>
      </div>
    `;
  }).join('');
}

window.selectWhatsAppChat = function(jid) {
  waCurrentChatJid = jid;
  const chat = waConversations.find(c => c.chatJid === jid);
  if (chat) {
    waCurrentContactName.textContent = chat.senderName || chat.chatJid.replace('@s.whatsapp.net', '');
    waCurrentContactJid.textContent = chat.chatJid;
    waDeletedBadge.style.display = chat.hasDeleted ? 'inline-block' : 'none';
  }
  renderConversationsList();
  renderCurrentChatMessages();
};

function renderCurrentChatMessages() {
  if (!waCurrentChatJid) return;
  const chat = waConversations.find(c => c.chatJid === waCurrentChatJid);
  if (!chat || !chat.messages || chat.messages.length === 0) {
    waMessagesList.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; text-align:center; margin-top:40px;">Sem mensagens nesta conversa</div>';
    return;
  }

  waMessagesList.innerHTML = chat.messages.map(m => {
    const isMe = m.fromMe;
    const isDeleted = m.deleted;
    const time = new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return `
      <div style="display:flex; justify-content: ${isMe ? 'flex-end' : 'flex-start'};">
        <div style="max-width:75%; padding:10px 14px; border-radius:12px; background: ${isMe ? 'linear-gradient(135deg, #0284c7, #0369a1)' : '#1e293b'}; color:#fff; border: 1px solid ${isDeleted ? 'var(--accent-rose)' : 'var(--border-color)'};">
          ${isDeleted ? `
            <div style="background: rgba(244,63,94,0.25); color: #fca5a5; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; margin-bottom: 5px; font-weight: bold; display: inline-flex; align-items:center; gap:4px;">
              <i class="fa-solid fa-triangle-exclamation"></i> Mensagem Apagada pelo Cliente (Salva na Zapo)
            </div>
          ` : ''}
          <div style="font-size: 0.9rem; word-break: break-word;">${escapeHtml(m.text)}</div>
          <div style="font-size: 0.68rem; color: rgba(255,255,255,0.6); text-align: right; margin-top: 4px;">
            ${time} ${isMe ? '✓✓' : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  waMessagesList.scrollTop = waMessagesList.scrollHeight;
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

waSendForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = waMsgInput.value.trim();
  if (!text) return;
  if (!waCurrentChatJid) {
    alert('Selecione ou inicie uma conversa primeiro!');
    return;
  }

  try {
    const res = await fetch(`${backendUrl}/api/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: waCurrentChatJid, text })
    });
    const data = await res.json();
    if (data.success) {
      waMsgInput.value = '';
      fetchWhatsAppConversations();
    } else {
      alert('Erro ao enviar mensagem: ' + data.error);
    }
  } catch (err) {
    alert('Erro de conexão: ' + err.message);
  }
});

btnNewChat.addEventListener('click', () => {
  const number = prompt('Digite o número do WhatsApp com DDD (Ex: 5511999999999):');
  if (number) {
    const clean = number.replace(/\D/g, '');
    const jid = `${clean}@s.whatsapp.net`;
    selectWhatsAppChat(jid);
    if (!waConversations.some(c => c.chatJid === jid)) {
      waConversations.unshift({
        chatJid: jid,
        senderName: clean,
        lastMessage: 'Nova conversa iniciada',
        lastTimestamp: new Date().toISOString(),
        hasDeleted: false,
        messages: []
      });
      renderConversationsList();
      renderCurrentChatMessages();
    }
  }
});

btnWaLogout.addEventListener('click', async () => {
  if (!confirm('Deseja realmente desconectar o WhatsApp da Zapo?')) return;
  try {
    await fetch(`${backendUrl}/api/whatsapp/logout`, { method: 'POST' });
    showToast('WhatsApp desconectado!');
    fetchWhatsAppStatus();
  } catch (err) {
    alert('Erro ao deslogar: ' + err.message);
  }
});

// Eventos de Tempo Real do WhatsApp via Socket.IO
function attachWhatsAppSocketListeners(s) {
  if (!s) return;
  s.on('whatsapp:status', (data) => {
    updateWhatsAppUI(data);
  });

  s.on('whatsapp:message', (msg) => {
    fetchWhatsAppConversations();
    showToast(`WhatsApp: Nova mensagem de ${msg.sender}`);
  });

  s.on('whatsapp:message_deleted', (data) => {
    fetchWhatsAppConversations();
    showToast(`⚠️ WhatsApp: Mensagem apagada foi salva!`);
  });
}

// Inicialização Geral
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupSocket();
  if (socket) attachWhatsAppSocketListeners(socket);
});

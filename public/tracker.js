/**
 * GPS TRACKER MOBILE CLIENT
 * Transmissão contínua de localização de alta precisão
 */

// Elementos DOM
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const deviceNameInput = document.getElementById('deviceNameInput');
const serverUrlInput = document.getElementById('serverUrlInput');
const intervalSelect = document.getElementById('intervalSelect');
const btnToggleTracking = document.getElementById('btnToggleTracking');

const statAccuracy = document.getElementById('statAccuracy');
const statSpeed = document.getElementById('statSpeed');
const statBattery = document.getElementById('statBattery');
const statCount = document.getElementById('statCount');
const statCoords = document.getElementById('statCoords');

// Variáveis de Estado
let isTracking = false;
let watchId = null;
let wakeLock = null;
let intervalTimer = null;
let sentCount = 0;
let lastKnownPosition = null;
let batteryLevel = null;
let socket = null;

// Identificador único persistente do dispositivo
let deviceId = localStorage.getItem('gps_tracker_device_id');
if (!deviceId) {
  deviceId = 'phone_' + Math.random().toString(36).substring(2, 9);
  localStorage.setItem('gps_tracker_device_id', deviceId);
}

// Configurações salvas
const savedName = localStorage.getItem('gps_tracker_device_name');
if (savedName) deviceNameInput.value = savedName;

const savedServer = localStorage.getItem('gps_tracker_server_url') || window.location.origin;
serverUrlInput.value = savedServer;

/**
 * Conectar ao Socket.IO do servidor
 */
function connectSocket() {
  const url = serverUrlInput.value.trim() || window.location.origin;
  
  if (typeof io === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.8.1/socket.io.min.js';
    script.onload = () => initSocketInstance(url);
    document.head.appendChild(script);
  } else {
    initSocketInstance(url);
  }
}

function initSocketInstance(url) {
  if (socket) socket.disconnect();
  try {
    socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10
    });

    socket.on('connect', () => {
      console.log('Tracker conectado ao Socket.IO');
    });
  } catch (err) {
    console.warn('Erro ao conectar socket, fallback HTTP ativo:', err.message);
  }
}

/**
 * Monitorar nível de bateria
 */
async function monitorBattery() {
  if ('getBattery' in navigator) {
    try {
      const battery = await navigator.getBattery();
      const updateBattery = () => {
        batteryLevel = Math.round(battery.level * 100);
        statBattery.textContent = `${batteryLevel}%`;
      };
      updateBattery();
      battery.addEventListener('levelchange', updateBattery);
    } catch (e) {
      console.log('API de bateria não permitida ou indisponível.');
    }
  }
}

/**
 * Manter tela ativa (Wake Lock API) para não suspender a transmissão
 */
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        console.log('Screen Wake Lock liberado');
      });
    } catch (err) {
      console.warn('Wake Lock não ativado:', err.message);
    }
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

/**
 * Transmite a posição atual para o backend
 */
async function sendPosition(pos) {
  if (!pos || !pos.coords) return;
  const coords = pos.coords;

  const payload = {
    deviceId: deviceId,
    name: deviceNameInput.value.trim() || 'Celular',
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    speed: coords.speed !== null && !isNaN(coords.speed) ? coords.speed : 0,
    heading: coords.heading,
    altitude: coords.altitude,
    battery: batteryLevel,
    timestamp: new Date(pos.timestamp).toISOString()
  };

  // Atualiza telemetria visual na tela do celular
  statAccuracy.textContent = `± ${Math.round(coords.accuracy)} m`;
  const speedKm = coords.speed ? Math.round(coords.speed * 3.6) : 0;
  statSpeed.textContent = `${speedKm} km/h`;
  statCoords.textContent = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;

  // 1. Tenta envio via WebSocket (ultra rápido)
  let sentViaWs = false;
  if (socket && socket.connected) {
    socket.emit('tracker:send_location', payload);
    sentViaWs = true;
  }

  // 2. Fallback via HTTP POST
  const serverUrl = serverUrlInput.value.trim() || window.location.origin;
  try {
    const res = await fetch(`${serverUrl}/api/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      sentCount++;
      statCount.textContent = sentCount;
    }
  } catch (err) {
    console.warn('Erro ao enviar via HTTP:', err.message);
    // Se enviou via WebSocket, incrementa
    if (sentViaWs) {
      sentCount++;
      statCount.textContent = sentCount;
    }
  }
}

/**
 * Iniciar rastreamento GPS contínuo
 */
function startTracking() {
  if (!navigator.geolocation) {
    alert('Geolocalização não é suportada neste navegador.');
    return;
  }

  // Salva preferências no localStorage
  localStorage.setItem('gps_tracker_device_name', deviceNameInput.value.trim());
  localStorage.setItem('gps_tracker_server_url', serverUrlInput.value.trim());

  connectSocket();
  requestWakeLock();
  monitorBattery();

  statusBadge.classList.add('active');
  statusText.textContent = 'Transmitindo GPS 24/7';
  btnToggleTracking.classList.add('stop');
  btnToggleTracking.innerHTML = '<i class="fa-solid fa-stop"></i> Parar Rastreamento';
  isTracking = true;

  const geoOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  };

  // Inicia monitoramento do GPS nativo do celular
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      lastKnownPosition = position;
      sendPosition(position);
    },
    (error) => {
      console.error('Erro de GPS:', error);
      let msg = 'Erro ao obter GPS';
      if (error.code === error.PERMISSION_DENIED) {
        msg = 'Permissão de Localização Negada. Permita nas configs do celular!';
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        msg = 'Sinal GPS fraco ou indisponível.';
      } else if (error.code === error.TIMEOUT) {
        msg = 'Tempo limite esgotado buscando GPS.';
      }
      statCoords.textContent = msg;
    },
    geoOptions
  );

  // Intervalo configurável de envio contínuo para garantir updates frequentes
  const intervalMs = parseInt(intervalSelect.value, 10) || 2000;
  intervalTimer = setInterval(() => {
    if (lastKnownPosition) {
      sendPosition(lastKnownPosition);
    }
  }, intervalMs);
}

/**
 * Parar rastreamento
 */
function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (intervalTimer !== null) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
  releaseWakeLock();

  statusBadge.classList.remove('active');
  statusText.textContent = 'Parado';
  btnToggleTracking.classList.remove('stop');
  btnToggleTracking.innerHTML = '<i class="fa-solid fa-play"></i> Iniciar Rastreamento';
  isTracking = false;
}

// Botão Iniciar / Parar
btnToggleTracking.addEventListener('click', () => {
  if (isTracking) {
    stopTracking();
  } else {
    startTracking();
  }
});

// Inicialização
monitorBattery();
connectSocket();

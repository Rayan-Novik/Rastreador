const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
const SQL_FILE = path.join(DATA_DIR, 'database.sql');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

// Estrutura em memória para consultas em tempo real com alta performance
const dbState = {
  devices: new Map(),       // deviceId => { id, name, status, last_latitude, ... }
  locations: []             // array de { id, deviceId, latitude, longitude, ... }
};

let locationAutoId = 1;

/**
 * Escapa strings para formato SQL seguro
 */
function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isNaN(val) ? 'NULL' : String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * Inicializa os arquivos de banco de dados SQL
 */
function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Inicializa o arquivo database.sql com o schema caso ainda não exista
  if (!fs.existsSync(SQL_FILE)) {
    const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf-8');
    const header = `-- ========================================================\n-- BANCO DE DADOS GPS - ARQUIVO SQL\n-- Inicializado em: ${new Date().toISOString()}\n-- ========================================================\n\n`;
    fs.writeFileSync(SQL_FILE, header + schemaSql + '\n\n-- Registro de Transações em Tempo Real:\n', 'utf-8');
    console.log(`[DB] Arquivo SQL criado em: ${SQL_FILE}`);
  }

  // Recupera o estado salvo anteriormente (se existir)
  if (fs.existsSync(STATE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      if (Array.isArray(data.devices)) {
        data.devices.forEach(d => dbState.devices.set(d.id, d));
      }
      if (Array.isArray(data.locations)) {
        dbState.locations = data.locations;
        if (dbState.locations.length > 0) {
          locationAutoId = Math.max(...dbState.locations.map(l => l.id || 0)) + 1;
        }
      }
      console.log(`[DB] Estado carregado: ${dbState.devices.size} dispositivos, ${dbState.locations.length} localizações.`);
    } catch (err) {
      console.error('[DB] Erro ao carregar state.json, iniciando novo:', err.message);
    }
  }
}

/**
 * Salva snapshot do estado para recuperação rápida
 */
function persistState() {
  try {
    const state = {
      devices: Array.from(dbState.devices.values()),
      locations: dbState.locations.slice(-5000) // mantém os últimos 5000 pontos em memória
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB] Erro ao persistir estado:', err.message);
  }
}

/**
 * Adiciona uma instrução SQL ao arquivo database.sql
 */
function appendSqlStatement(sqlStatement) {
  try {
    fs.appendFileSync(SQL_FILE, sqlStatement + '\n', 'utf-8');
  } catch (err) {
    console.error('[DB] Erro ao gravar instrução SQL no arquivo:', err.message);
  }
}

/**
 * Registra uma nova localização enviada pelo celular
 */
function saveLocation(data) {
  const {
    deviceId,
    name = 'Dispositivo Rastreado',
    latitude,
    longitude,
    accuracy = null,
    speed = null,
    heading = null,
    altitude = null,
    battery = null,
    timestamp = new Date().toISOString()
  } = data;

  const latNum = parseFloat(latitude);
  const lngNum = parseFloat(longitude);

  if (isNaN(latNum) || isNaN(lngNum)) {
    throw new Error('Latitude ou Longitude inválida');
  }

  const id = locationAutoId++;
  const record = {
    id,
    deviceId,
    latitude: latNum,
    longitude: lngNum,
    accuracy: accuracy !== null && !isNaN(accuracy) ? parseFloat(accuracy) : null,
    speed: speed !== null && !isNaN(speed) ? parseFloat(speed) : null,
    heading: heading !== null && !isNaN(heading) ? parseFloat(heading) : null,
    altitude: altitude !== null && !isNaN(altitude) ? parseFloat(altitude) : null,
    battery: battery !== null && !isNaN(battery) ? parseInt(battery, 10) : null,
    timestamp: new Date(timestamp).toISOString(),
    createdAt: new Date().toISOString()
  };

  // 1. Atualiza registro do dispositivo
  const existingDevice = dbState.devices.get(deviceId) || {
    id: deviceId,
    name: name,
    createdAt: new Date().toISOString()
  };

  const updatedDevice = {
    ...existingDevice,
    name: name || existingDevice.name,
    status: 'online',
    last_latitude: record.latitude,
    last_longitude: record.longitude,
    last_accuracy: record.accuracy,
    last_speed: record.speed,
    last_heading: record.heading,
    last_altitude: record.altitude,
    last_battery: record.battery,
    last_updated: record.timestamp
  };

  dbState.devices.set(deviceId, updatedDevice);
  dbState.locations.push(record);

  // 2. Grava a transação SQL correspondente no arquivo .sql
  const deviceSql = `INSERT INTO devices (id, name, status, last_latitude, last_longitude, last_accuracy, last_speed, last_heading, last_altitude, last_battery, last_updated)
VALUES (${escapeSql(updatedDevice.id)}, ${escapeSql(updatedDevice.name)}, 'online', ${record.latitude}, ${record.longitude}, ${escapeSql(record.accuracy)}, ${escapeSql(record.speed)}, ${escapeSql(record.heading)}, ${escapeSql(record.altitude)}, ${escapeSql(record.battery)}, ${escapeSql(record.timestamp)})
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  status = 'online',
  last_latitude = excluded.last_latitude,
  last_longitude = excluded.last_longitude,
  last_accuracy = excluded.last_accuracy,
  last_speed = excluded.last_speed,
  last_heading = excluded.last_heading,
  last_altitude = excluded.last_altitude,
  last_battery = excluded.last_battery,
  last_updated = excluded.last_updated;`;

  const locationSql = `INSERT INTO locations (device_id, latitude, longitude, accuracy, speed, heading, altitude, battery, timestamp)
VALUES (${escapeSql(deviceId)}, ${record.latitude}, ${record.longitude}, ${escapeSql(record.accuracy)}, ${escapeSql(record.speed)}, ${escapeSql(record.heading)}, ${escapeSql(record.altitude)}, ${escapeSql(record.battery)}, ${escapeSql(record.timestamp)});`;

  appendSqlStatement(`\n-- Atualização em ${record.timestamp}\n${deviceSql}\n${locationSql}`);

  // Persiste a cada atualização
  persistState();

  return { device: updatedDevice, location: record };
}

/**
 * Retorna todos os dispositivos cadastrados
 */
function getAllDevices() {
  const now = Date.now();
  const list = Array.from(dbState.devices.values()).map(dev => {
    // Se não houver atualização há mais de 3 minutos, marca como offline
    const lastTime = dev.last_updated ? new Date(dev.last_updated).getTime() : 0;
    const isOnline = (now - lastTime) < 3 * 60 * 1000;
    return {
      ...dev,
      status: isOnline ? 'online' : 'offline'
    };
  });
  return list;
}

/**
 * Retorna dados de um dispositivo específico
 */
function getDevice(deviceId) {
  const dev = dbState.devices.get(deviceId);
  if (!dev) return null;
  const now = Date.now();
  const lastTime = dev.last_updated ? new Date(dev.last_updated).getTime() : 0;
  return {
    ...dev,
    status: (now - lastTime) < 3 * 60 * 1000 ? 'online' : 'offline'
  };
}

/**
 * Retorna o histórico de posições de um dispositivo
 */
function getDeviceHistory(deviceId, limit = 200) {
  return dbState.locations
    .filter(loc => loc.deviceId === deviceId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-limit);
}

/**
 * Limpa o histórico de um dispositivo
 */
function clearDeviceHistory(deviceId) {
  dbState.locations = dbState.locations.filter(loc => loc.deviceId !== deviceId);
  appendSqlStatement(`\n-- Histórico limpo para ${deviceId} em ${new Date().toISOString()}\nDELETE FROM locations WHERE device_id = ${escapeSql(deviceId)};`);
  persistState();
}

/**
 * Retorna o conteúdo do arquivo SQL completo
 */
function getSqlFileContent() {
  if (fs.existsSync(SQL_FILE)) {
    return fs.readFileSync(SQL_FILE, 'utf-8');
  }
  return '';
}

// Inicializa o banco ao carregar o módulo
initDatabase();

module.exports = {
  saveLocation,
  getAllDevices,
  getDevice,
  getDeviceHistory,
  clearDeviceHistory,
  getSqlFileContent,
  SQL_FILE
};

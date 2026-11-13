-- ========================================================
-- BANCO DE DADOS GPS - ARQUIVO SQL
-- Inicializado em: 2026-11-13T17:15:41.534Z
-- ========================================================

-- ========================================================
-- Schema do Banco de Dados - Rastreador GPS em Tempo Real
-- Arquivo SQL para inicialização e estrutura do banco
-- ========================================================

-- Tabela de Dispositivos Registrados
CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    status VARCHAR(32) DEFAULT 'online', -- online, offline, idle
    last_latitude DECIMAL(10, 8),
    last_longitude DECIMAL(11, 8),
    last_accuracy DECIMAL(8, 2),
    last_speed DECIMAL(8, 2),
    last_heading DECIMAL(8, 2),
    last_altitude DECIMAL(8, 2),
    last_battery INT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Histórico de Localizações GPS
CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id VARCHAR(64) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL(8, 2),       -- Precisão em metros
    speed DECIMAL(8, 2),          -- Velocidade em m/s ou km/h
    heading DECIMAL(8, 2),        -- Direção em graus (0-360)
    altitude DECIMAL(8, 2),       -- Altitude em metros
    battery INT,                  -- Nível de bateria (0-100)
    timestamp DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Índices para buscas rápidas por dispositivo e período
CREATE INDEX IF NOT EXISTS idx_locations_device_time 
ON locations (device_id, timestamp DESC);


-- Registro de Transações em Tempo Real:

-- Atualização em 2026-11-13T17:15:55.648Z
INSERT INTO devices (id, name, status, last_latitude, last_longitude, last_accuracy, last_speed, last_heading, last_altitude, last_battery, last_updated)
VALUES ('celular-filho-01', 'Celular Rayan', 'online', -23.55052, -46.633308, 4.2, 12.5, 180, NULL, 88, '2026-11-13T17:15:55.648Z')
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
  last_updated = excluded.last_updated;
INSERT INTO locations (device_id, latitude, longitude, accuracy, speed, heading, altitude, battery, timestamp)
VALUES ('celular-filho-01', -23.55052, -46.633308, 4.2, 12.5, 180, NULL, 88, '2026-11-13T17:15:55.648Z');

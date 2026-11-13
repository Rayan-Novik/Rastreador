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

-- Tabela de Zonas / Lojas de Clientes (Geofences)
CREATE TABLE IF NOT EXISTS zones (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    radius INT DEFAULT 150,               -- Raio em metros
    customer_phone VARCHAR(32),           -- WhatsApp do cliente para avisar
    customer_name VARCHAR(128),
    notify_on_enter INT DEFAULT 1,        -- 1 = avisar ao chegar
    notify_on_exit INT DEFAULT 1,         -- 1 = avisar ao sair
    enter_message TEXT,                   -- Mensagem personalizada de chegada
    exit_message TEXT,                    -- Mensagem personalizada de saída
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

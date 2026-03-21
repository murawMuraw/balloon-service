const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');
const axios = require('axios');
const cron = require('node-cron');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Подключение к PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Функция получения ветра
async function getWindData(lat, lng) {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`;
    const response = await axios.get(url);
    if (response.data.wind) {
      return {
        speed: response.data.wind.speed,
        direction: response.data.wind.deg
      };
    }
    return null;
  } catch (error) {
    console.error('Ошибка получения ветра:', error.message);
    return null;
  }
}

// Функция расчета новой позиции
function calculateNewPosition(lat, lng, windSpeed, windDirection, seconds) {
  const windRad = (windDirection + 180) * Math.PI / 180;
  const distance = windSpeed * seconds;
  const distanceKm = distance / 1000;
  const R = 6371;
  
  const lat1 = lat * Math.PI / 180;
  const lon1 = lng * Math.PI / 180;
  
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distanceKm/R) + 
                         Math.cos(lat1) * Math.sin(distanceKm/R) * Math.cos(windRad));
  
  const lon2 = lon1 + Math.atan2(Math.sin(windRad) * Math.sin(distanceKm/R) * Math.cos(lat1), 
                                 Math.cos(distanceKm/R) - Math.sin(lat1) * Math.sin(lat2));
  
  return {
    lat: lat2 * 180 / Math.PI,
    lng: lon2 * 180 / Math.PI
  };
}

// Создание таблиц при запуске
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS balloons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      start_lat FLOAT,
      start_lng FLOAT,
      current_lat FLOAT,
      current_lng FLOAT,
      start_time TIMESTAMP DEFAULT NOW(),
      last_update TIMESTAMP DEFAULT NOW(),
      wind_speed FLOAT,
      wind_direction FLOAT,
      is_flying BOOLEAN DEFAULT true,
      path JSONB DEFAULT '[]'
    )
  `);
  console.log('✅ База данных инициализирована');
}
initDb();

// Фоновое обновление шаров (каждую минуту)
cron.schedule('* * * * *', async () => {
  console.log('🔄 Обновление всех шаров...');
  const balloons = await pool.query('SELECT * FROM balloons WHERE is_flying = true');
  
  for (const balloon of balloons.rows) {
    const wind = await getWindData(balloon.current_lat, balloon.current_lng);
    if (wind) {
      const newPos = calculateNewPosition(
        balloon.current_lat, balloon.current_lng,
        wind.speed, wind.direction, 60
      );
      
      const path = balloon.path || [];
      path.push({ lat: balloon.current_lat, lng: balloon.current_lng, time: new Date() });
      
      await pool.query(
        `UPDATE balloons SET 
          current_lat = $1, current_lng = $2,
          wind_speed = $3, wind_direction = $4,
          last_update = NOW(), path = $5::jsonb
         WHERE id = $6`,
        [newPos.lat, newPos.lng, wind.speed, wind.direction, JSON.stringify(path), balloon.id]
      );
      
      // Уведомляем клиентов через WebSocket
      io.to(`balloon-${balloon.id}`).emit('balloon-update', {
        lat: newPos.lat, lng: newPos.lng,
        windSpeed: wind.speed, windDirection: wind.direction,
        path: path
      });
    }
  }
});

// API endpoints
app.post('/api/balloons', async (req, res) => {
  const { lat, lng, userId } = req.body;
  const wind = await getWindData(lat, lng);
  
  if (!wind) {
    return res.status(500).json({ error: 'Не удалось получить данные о ветре' });
  }
  
  const result = await pool.query(
    `INSERT INTO balloons (user_id, start_lat, start_lng, current_lat, current_lng, wind_speed, wind_direction, path)
     VALUES ($1, $2, $3, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, lat, lng, wind.speed, wind.direction, JSON.stringify([{lat, lng, time: new Date()}])]
  );
  
  res.json(result.rows[0]);
});

app.get('/api/balloons/:userId', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM balloons WHERE user_id = $1 AND is_flying = true ORDER BY start_time DESC LIMIT 1',
    [req.params.userId]
  );
  
  if (result.rows.length > 0) {
    res.json(result.rows[0]);
  } else {
    res.status(404).json({ error: 'Шар не найден' });
  }
});

app.post('/api/balloons/:id/stop', async (req, res) => {
  await pool.query('UPDATE balloons SET is_flying = false WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// WebSocket соединения
io.on('connection', (socket) => {
  console.log('Новый клиент подключен');
  
  socket.on('join-balloon', (balloonId) => {
    socket.join(`balloon-${balloonId}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});

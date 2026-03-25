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

// ========== ФУНКЦИИ ==========

// Функция получения ветра с OpenWeatherMap
async function getWindData(lat, lng) {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`;
    const response = await axios.get(url);
    
    if (response.data.wind) {
      return {
        speed: response.data.wind.speed,
        direction: response.data.wind.deg,
        gust: response.data.wind.gust || 0
      };
    }
    return null;
  } catch (error) {
    console.error('Ошибка получения ветра:', error.message);
    // ВРЕМЕННО: возвращаем тестовые данные для разработки
    console.log('⚠️ Используем тестовые данные ветра');
    return {
      speed: 3.0,
      direction: 270,
      gust: 0
    };
  }
}

// Функция расчета новой позиции
function calculateNewPosition(lat, lng, windSpeed, windDirection, seconds) {
  // Ветер дует ИЗ направления, шар летит ПО направлению +180°
  const windRad = (windDirection + 180) * Math.PI / 180;
  const distance = windSpeed * seconds; // метры
  const distanceKm = distance / 1000;
  const R = 6371; // радиус Земли в км
  
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

// ========== ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ==========

async function initDb() {
  try {
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
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:', error.message);
  }
}
initDb();

// ========== ФОНОВОЕ ОБНОВЛЕНИЕ ШАРОВ ==========

cron.schedule('* * * * *', async () => {
  console.log('🔄 Фоновое обновление всех шаров...');
  
  try {
    const balloons = await pool.query('SELECT * FROM balloons WHERE is_flying = true');
    
    for (const balloon of balloons.rows) {
      const wind = await getWindData(balloon.current_lat, balloon.current_lng);
      
      if (wind) {
        const newPos = calculateNewPosition(
          balloon.current_lat, balloon.current_lng,
          wind.speed, wind.direction, 60
        );
        
        const path = balloon.path || [];
        path.push({ 
          lat: balloon.current_lat, 
          lng: balloon.current_lng, 
          time: new Date() 
        });
        
        // Сохраняем только последние 1000 точек пути
        const trimmedPath = path.slice(-1000);
        
        await pool.query(
          `UPDATE balloons SET 
            current_lat = $1, 
            current_lng = $2,
            wind_speed = $3, 
            wind_direction = $4,
            last_update = NOW(), 
            path = $5::jsonb
           WHERE id = $6`,
          [newPos.lat, newPos.lng, wind.speed, wind.direction, JSON.stringify(trimmedPath), balloon.id]
        );
        
        // Уведомляем клиентов через WebSocket
        io.to(`balloon-${balloon.id}`).emit('balloon-update', {
          lat: newPos.lat,
          lng: newPos.lng,
          windSpeed: wind.speed,
          windDirection: wind.direction,
          path: trimmedPath
        });
        
        console.log(`✅ Шар ${balloon.id.substring(0, 8)} обновлен`);
      }
    }
  } catch (error) {
    console.error('❌ Ошибка фонового обновления:', error.message);
  }
});

// ========== API ENDPOINTS ==========

// Тестовый endpoint для проверки работы сервера
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// ========== ГЛАВНЫЙ ЭНДПОИНТ ВЕТРА (для фронтенда) ==========
// ========== ЭНДПОИНТ ВЕТРА (с улучшенной обработкой) ==========
app.get('/api/wind', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lon);
  
  console.log(`🌬️ Запрос ветра: lat=${lat}, lon=${lng}`);
  
  if (isNaN(lat) || isNaN(lng)) {
    console.log('❌ Некорректные координаты');
    // ВСЕГДА возвращаем JSON, даже при ошибке
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  
  try {
    const wind = await getWindData(lat, lng);
    
    if (wind && wind.speed !== undefined) {
      console.log(`✅ Ветер: ${wind.speed} м/с, направление ${wind.direction}°`);
      res.json(wind);
    } else {
      // Если нет данных о ветре, возвращаем тестовые значения
      console.log(`⚠️ Нет данных о ветре для (${lat}, ${lng}), используем тестовые`);
      res.json({
        speed: 2.5,
        direction: 180,
        gust: 0,
        note: "test_data"
      });
    }
  } catch (error) {
    console.error('❌ Ошибка получения ветра:', error.message);
    // ВСЕГДА возвращаем JSON с тестовыми данными вместо ошибки
    res.json({
      speed: 2.5,
      direction: 180,
      gust: 0,
      note: "fallback_data"
    });
  }
});

// Создание нового шара
app.post('/api/balloons', async (req, res) => {
  const { lat, lng, userId } = req.body;
  
  if (!lat || !lng || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    const wind = await getWindData(lat, lng);
    
    if (!wind) {
      return res.status(500).json({ error: 'Не удалось получить данные о ветре' });
    }
    
    const result = await pool.query(
      `INSERT INTO balloons 
       (user_id, start_lat, start_lng, current_lat, current_lng, wind_speed, wind_direction, path)
       VALUES ($1, $2, $3, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, lat, lng, wind.speed, wind.direction, JSON.stringify([{lat, lng, time: new Date()}])]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка создания шара:', error.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение состояния шара пользователя
app.get('/api/balloons/:userId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM balloons WHERE user_id = $1 AND is_flying = true ORDER BY start_time DESC LIMIT 1',
      [req.params.userId]
    );
    
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ error: 'Шар не найден' });
    }
  } catch (error) {
    console.error('Ошибка получения шара:', error.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Остановка полета
app.post('/api/balloons/:id/stop', async (req, res) => {
  try {
    await pool.query('UPDATE balloons SET is_flying = false WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка остановки шара:', error.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение всех активных шаров (для карты всех пользователей)
app.get('/api/balloons', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, user_id, current_lat, current_lng, wind_speed, last_update FROM balloons WHERE is_flying = true'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения шаров:', error.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});
// Получение информации о текущем пользователе
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, email, created_at FROM users WHERE id = $1', [req.user.userId]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Пользователь не найден' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== WEBSOCKET ==========

io.on('connection', (socket) => {
  console.log('🟢 Новый клиент подключен:', socket.id);
  
  socket.on('join-balloon', (balloonId) => {
    socket.join(`balloon-${balloonId}`);
    console.log(`📡 Клиент ${socket.id} присоединился к шару ${balloonId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('🔴 Клиент отключен:', socket.id);
  });
});

// ========== ЗАПУСК СЕРВЕРА ==========

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📡 WebSocket готов к подключениям`);
  console.log(`🌍 OpenWeather API ключ: ${process.env.OPENWEATHER_API_KEY ? '✅ установлен' : '❌ не установлен'}`);
});

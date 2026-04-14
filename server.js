const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');
const axios = require('axios');
const cron = require('node-cron');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Middleware
app.use(cors());
app.use(express.json());
//app.use(express.static('public'));
app.use(express.static(path.join(__dirname, ../frontend)));

// Подключение к PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-me-in-production';

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
    // Возвращаем тестовые данные для разработки
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
  const windRad = (windDirection + 180) * Math.PI / 180;
  const distance = windSpeed * seconds;
  const distanceKm = distance / 1000;
  const R = 6371;
  
  const lat1 = lat * Math.PI / 180;
  const lon1 = lng * Math.PI / 180;
  const bearing = windRad;
  
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distanceKm/R) + 
                         Math.cos(lat1) * Math.sin(distanceKm/R) * Math.cos(bearing));
  
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(distanceKm/R) * Math.cos(lat1), 
                                 Math.cos(distanceKm/R) - Math.sin(lat1) * Math.sin(lat2));
  
  return {
    lat: lat2 * 180 / Math.PI,
    lng: lon2 * 180 / Math.PI
  };
}

// ========== MIDDLEWARE АВТОРИЗАЦИИ ==========
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Недействительный токен' });
    }
    req.user = user;
    next();
  });
}

// ========== ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ==========

async function initDb() {
  try {
    // Таблица пользователей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Таблица шаров
    await pool.query(`
      CREATE TABLE IF NOT EXISTS balloons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
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
        
        const trimmedPath = path.slice(-10000);
        
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
/////////////////////////////////////////////////////////////////////////
// Удаление старых шаров гостей 
async function deleteOldGuests(days = 3) {
  try {
    // Удаляем только тех, у кого user_id начинается с 'guest_'
    // И которые созданы более days дней назад
    const result = await pool.query(`
      DELETE FROM balloons 
      WHERE user_id LIKE 'guest_%'
        AND start_time < NOW() - INTERVAL '${days} days'
        AND is_flying = true
      RETURNING id, user_id, start_time
    `);
    
    console.log(`✅ Удалено гостей (старше ${days} дней): ${result.rowCount}`);
    result.rows.forEach(row => {
      console.log(`   - ${row.user_id} | создан: ${row.start_time}`);
    });
    
    return { deleted: result.rowCount, list: result.rows };
    
  } catch (error) {
    console.error('❌ Ошибка очистки гостей:', error.message);
    return { deleted: 0, error: error.message };
  }
}



///////////////////////////////////////////////////////////////////////////////////
// ========== ПУБЛИЧНЫЕ API ENDPOINTS ==========

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// Получение ветра (публичный, не требует авторизации)
app.get('/api/wind', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lon);
  
  console.log(`🌬️ Запрос ветра: lat=${lat}, lon=${lng}`);
  
  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  
  try {
    const wind = await getWindData(lat, lng);
    res.json(wind);
  } catch (error) {
    console.error('❌ Ошибка получения ветра:', error.message);
    res.status(500).json({ error: 'Failed to get wind data' });
  }
});



// Поиск ближайшего населённого пункта по координатам
app.get('/api/place', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lon); // Убедитесь, что фронтенд шлет 'lon', а не 'lng'
  
  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
    const osmResponse = await axios.get(osmUrl, {
      headers: { 'User-Agent': 'BalloonSimulator/1.0' }
    });
    
    const place = osmResponse.data.address;

    if (!place) {
      return res.json({ found: false });
    }

    const city = place.city || place.town || place.village || place.hamlet;
    const country = place.country || '';
    
    if (!city) {
      return res.json({ found: false });
    }
    
    console.log(`🌍 Найден населённый пункт: ${city}, ${country}`);
    
    // Формируем ответ
    res.json({
      found: true,
      name: city,
      country: country,
    });

  } catch (error) {
    console.error('Ошибка получения места:', error.message);
    // Важно: если заголовки уже отправлены, не пытаемся отправить ответ снова
    if (!res.headersSent) {
      res.status(500).json({ found: false, error: 'Internal Server Error' });
    }
  }
}); 

// ========== АВТОРИЗАЦИЯ ==========

// Регистрация
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
  }
  
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, password_hash]
    );
    
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Email уже зарегистрирован' });
    } else {
      console.error('Ошибка регистрации:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
});

// Вход
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }
    
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    
    if (!valid) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }
    
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error('Ошибка входа:', error);
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
    console.error('Ошибка получения пользователя:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ========== API ШАРОВ (с авторизацией) ==========

// Получение шара текущего пользователя
app.get('/api/balloons/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM balloons WHERE user_id = $1 AND is_flying = true ORDER BY start_time DESC LIMIT 1',
      [req.user.userId]
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

// Получение шара по ID пользователя (для гостевого режима)
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

// ========== АДМИНСКИЕ ЭНДПОИНТЫ ==========
// удаление гостей
app.get('/api/admin/clean-guests', async (req, res) => {
  const days = parseInt(req.query.days) || 3;
  const secret = req.query.secret;
  
  const ADMIN_SECRET = process.env.ADMIN_SECRET || 'my-secret-key-2024';
  
  if (!secret || secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Неверный секретный ключ' });
  }
  
  // Диагностика: считаем кандидатов
  const candidateCount = await pool.query(`
    SELECT COUNT(*) FROM balloons 
    WHERE user_id LIKE 'guest_%'
      AND start_time < NOW() - INTERVAL '${days} days'
      AND is_flying = true
  `);
  
  console.log(`🔧 Кандидатов на удаление: ${candidateCount.rows[0].count}`);
  
  const result = await deleteOldGuests(days);
  
  res.json({
    success: true,
    deleted: result.deleted,
    candidates: parseInt(candidateCount.rows[0].count),
    days: days,
    timestamp: new Date().toISOString(),
    list: result.list
  });
});

// Автоматическая очистка каждый день в 3:00
cron.schedule('0 3 * * *', async () => {
  console.log('🧹 [AUTO] Запущена плановая очистка гостей...');
  await deleteOldGuests(3);
});

// Статистика для админа
app.get('/api/stats', async (req, res) => {
    try {
        const activeCount = await pool.query('SELECT COUNT(*) FROM balloons WHERE is_flying = true');
        const totalCount = await pool.query('SELECT COUNT(*) FROM balloons');
        const usersCount = await pool.query('SELECT COUNT(DISTINCT user_id) FROM balloons WHERE is_flying = true');
        
        res.json({
            active_balloons: parseInt(activeCount.rows[0].count),
            total_balloons_ever: parseInt(totalCount.rows[0].count),
            active_users: parseInt(usersCount.rows[0].count),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
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
  console.log(`🔐 JWT секрет: ${JWT_SECRET !== 'your-secret-key-change-me-in-production' ? '✅ установлен' : '⚠️ используйте стандартный'}`);
});

const path = require('path');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const cron = require('node-cron');

const config = require('./config');
const { initDatabase } = require('./database');
const { updateAllBalloons } = require('./cron');
const setupSockets = require('./sockets');
const routes = require('./routes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Routes
app.use('/api', routes);

// Инициализация БД
initDatabase();

// Фоновое обновление шаров (каждую минуту)
cron.schedule('* * * * *', () => updateAllBalloons(io));

// WebSocket
setupSockets(io);

// Запуск сервера
const PORT = config.port;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📡 WebSocket готов к подключениям`);
  console.log(`💾 Гостевые шары хранятся в памяти и удаляются при закрытии браузера`);
  console.log(`👤 Авторизованные шары хранятся в PostgreSQL`);
  console.log(`🌍 OpenWeather API ключ: ${config.openWeatherApiKey ? '✅ установлен' : '❌ не установлен'}`);
  console.log(`🔐 JWT секрет: ${config.jwtSecret !== 'your-secret-key-change-me-in-production' ? '✅ установлен' : '⚠️ используйте стандартный'}`);
});

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname,'..','/frontend')));

// Импорт модулей
const { initDb, pool } = require('./database');
const authRoutes = require('./routes/auth');
const balloonRoutes = require('./routes/balloons');
const weatherRoutes = require('./routes/weather');
const { setupWebSocket } = require('./websocket');
const { startCronJobs } = require('./cron');

// Маршруты
app.use('/api/auth', authRoutes);
app.use('/api/balloons', balloonRoutes);
app.use('/api', weatherRoutes);

// WebSocket
setupWebSocket(io);

// Инициализация БД
initDb();

// Запуск CRON задач
startCronJobs(io, pool);

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});

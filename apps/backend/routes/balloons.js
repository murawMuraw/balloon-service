const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { getWindData } = require('../utils/weather');
const { guestBalloons, generateGuestId } = require('../utils/guestStorage');

// Получение шара текущего пользователя
router.get('/me', authenticateToken, async (req, res) => {
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создание нового шара
router.post('/', async (req, res) => {
  const { lat, lng, userId, isGuest = true } = req.body;
  
  if (!lat || !lng || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    const wind = await getWindData(lat, lng);
    
    if (!wind) {
      return res.status(500).json({ error: 'Не удалось получить данные о ветре' });
    }
    
    if (isGuest || userId.toString().startsWith('guest_')) {
      const balloonId = generateGuestId();
      const guestBalloon = {
        id: balloonId,
        user_id: userId,
        start_lat: lat,
        start_lng: lng,
        current_lat: lat,
        current_lng: lng,
        start_time: new Date(),
        last_update: new Date(),
        wind_speed: wind.speed,
        wind_direction: wind.direction,
        is_flying: true,
        path: [{ lat, lng, time: new Date() }],
        socketId: null
      };
      
      guestBalloons.set(userId, guestBalloon);
      console.log(`🎈 Создан гостевой шар ${balloonId} для ${userId}`);
      return res.json(guestBalloon);
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

// Получение всех активных шаров
router.get('/', async (req, res) => {
  try {
    const dbResult = await pool.query(
      'SELECT id, user_id, current_lat, current_lng, wind_speed, last_update FROM balloons WHERE is_flying = true'
    );
    
    const guestBalloonsList = Array.from(guestBalloons.values())
      .filter(balloon => balloon.is_flying)
      .map(balloon => ({
        id: balloon.id,
        user_id: balloon.user_id,
        current_lat: balloon.current_lat,
        current_lng: balloon.current_lng,
        wind_speed: balloon.wind_speed,
        last_update: balloon.last_update
      }));
    
    const allBalloons = [...dbResult.rows, ...guestBalloonsList];
    res.json(allBalloons);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

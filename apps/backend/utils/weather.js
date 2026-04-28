const axios = require('axios');

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
    console.log('⚠️ Используем тестовые данные ветра');
    return { speed: 3.0, direction: 270, gust: 0 };
  }
}

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

module.exports = { getWindData, calculateNewPosition };

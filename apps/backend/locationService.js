const axios = require('axios');

async function getPlaceName(lat, lng) {
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
    const osmResponse = await axios.get(osmUrl, {
      headers: { 'User-Agent': 'BalloonSimulator/1.0' }
    });
    
    const place = osmResponse.data.address;

    if (!place) {
      return { found: false };
    }

    const city = place.city || place.town || place.village || place.hamlet;
    const country = place.country || '';
    
    if (!city) {
      return { found: false };
    }
    
    console.log(`🌍 Найден населённый пункт: ${city}, ${country}`);
    
    return {
      found: true,
      name: city,
      country: country,
    };

  } catch (error) {
    console.error('Ошибка получения места:', error.message);
    return { found: false, error: error.message };
  }
}

module.exports = { getPlaceName };

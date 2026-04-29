require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-me-in-production',
  openWeatherApiKey: process.env.OPENWEATHER_API_KEY,
  databaseUrl: process.env.DATABASE_URL,
  env: process.env.NODE_ENV || 'development'
};

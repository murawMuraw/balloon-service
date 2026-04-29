const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false }
});

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
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

module.exports = { pool, initDatabase };

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = new Pool({
  user: process.env.DB_USER || 'harmeek',
  host: process.env.DB_HOST || 'db', // 'db' is the service name in docker-compose
  database: process.env.DB_NAME || 'social_network_db',
  password: process.env.DB_PASSWORD || 'itsokay',
  port: process.env.DB_PORT || 5432,
});

const connectDB = async () => {
  let retries = 5;
  while (retries) {
    try {
      await pool.connect();
      console.log('Connected to PostgreSQL database');
      break;
    } catch (error) {
      console.error('Failed to connect to PostgreSQL database:', error);
      retries -= 1;
      console.log(`Retries left: ${retries}`);
      // Wait for 5 seconds before retrying
      await new Promise(res => setTimeout(res, 5000));
    }
  }
  if (retries === 0) {
    console.error('Max retries reached. Exiting...');
    process.exit(1);
  }
};

module.exports = { connectDB, pool };
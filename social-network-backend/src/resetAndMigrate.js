const { pool } = require('./utils/db');
const { runMigrations } = require('./utils/runMigrations');

async function resetAndMigrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP SCHEMA public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    await client.query('COMMIT');
    console.log('Database reset successfully');

    await runMigrations();
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error resetting database and running migrations:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

resetAndMigrate().then(() => process.exit(0)).catch(() => process.exit(1));
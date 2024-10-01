const fs = require('fs').promises;
const path = require('path');
const { pool } = require('./db');

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create migrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrationsPath = path.join(__dirname, '..', 'migrations');
    console.log('Migrations path:', migrationsPath);  // Add this line for debugging
    const migrationFiles = await fs.readdir(migrationsPath);
    
    for (const file of migrationFiles.sort()) {
      const migrationName = path.parse(file).name;
      
      // Check if migration has already been applied
      const { rows } = await client.query('SELECT * FROM migrations WHERE name = $1', [migrationName]);
      
      if (rows.length === 0) {
        console.log(`Running migration: ${file}`);
        const migration = await fs.readFile(path.join(migrationsPath, file), 'utf-8');
        
        try {
          await client.query(migration);
          await client.query('INSERT INTO migrations (name) VALUES ($1)', [migrationName]);
          console.log(`Migration ${file} completed successfully.`);
        } catch (error) {
          console.error(`Error running migration ${file}:`, error);
          throw error; // Throw error to trigger rollback
        }
      } else {
        console.log(`Migration ${file} already applied, skipping.`);
      }
    }

    // Add token_version column to users table if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'token_version') THEN
          ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0;
        END IF;
      END $$;
    `);

    await client.query('COMMIT');
    console.log('All migrations completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration process failed:', error);
    throw error; // Rethrow the error
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
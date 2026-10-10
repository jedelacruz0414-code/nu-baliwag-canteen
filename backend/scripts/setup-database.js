require('dotenv').config({
  path: require('path').resolve(__dirname, '../.env')
});
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

async function main() {
  const missing = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
    .filter(key => !process.env[key]);
  if (missing.length) {
    throw new Error(`Set the following database settings before setup: ${missing.join(', ')}.`);
  }

  const connection = await mysql.createConnection({
    ...config,
    multipleStatements: true
  });

  let menuItemCount;
  try {
    const schema = await fs.readFile(path.resolve(__dirname, '../schema.sql'), 'utf8');
    await connection.query(schema);
    const [rows] = await connection.execute(
      'SELECT COUNT(*) AS count FROM menu_items'
    );
    menuItemCount = Number(rows[0]?.count || 0);
  } finally {
    await connection.end();
  }

  console.log('Database schema is ready.');
  if (menuItemCount > 0) {
    console.log('Existing menu data found; skipping seed to preserve current stock and settings.');
    return;
  }

  const seed = spawnSync(
    process.execPath,
    [path.resolve(__dirname, 'seed-cafeteria-data.js')],
    { cwd: path.resolve(__dirname, '..'), env: process.env, stdio: 'inherit' }
  );
  if (seed.error) throw seed.error;
  if (seed.status !== 0) {
    throw new Error(`Initial cafeteria seed failed with exit code ${seed.status}.`);
  }
}

main().catch(error => {
  console.error('Database setup failed:', error.message);
  process.exitCode = 1;
});

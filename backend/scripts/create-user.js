require('dotenv').config();

const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const [role, name, schoolId, email, password] = process.argv.slice(2);
if (!['student', 'admin'].includes(role) || !name || !email || !password || (role === 'student' && !schoolId)) {
  console.error('Usage: npm run create-user -- <student|admin> <name> <school-id|-> <email> <password>');
  process.exit(1);
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nu_baliwag_canteen'
  });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await connection.execute(
      'INSERT INTO users (role, name, school_id, email, password_hash) VALUES (?, ?, ?, ?, ?)',
      [role, name, role === 'student' ? schoolId : null, email, passwordHash]
    );
    console.log(`${role} account created for ${email}.`);
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
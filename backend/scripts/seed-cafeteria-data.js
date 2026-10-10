require('dotenv').config();

const mysql = require('mysql2/promise');

const MENU_ITEMS = [
  { name: 'Chicken Inasal', category: 'Main Courses', price: 120, stock: 20, minStock: 5, imageUrl: 'assets/menu/chicken-inasal.jpeg', enabled: true },
  { name: 'Pork Sisig', category: 'Main Courses', price: 110, stock: 18, minStock: 5, imageUrl: 'assets/menu/pork-sisig.jpeg', enabled: true },
  { name: 'Carbonara', category: 'Main Courses', price: 130, stock: 16, minStock: 4, imageUrl: 'assets/menu/carbonara.jpeg', enabled: true },
  { name: 'Fries', category: 'Side Courses', price: 120, stock: 15, minStock: 4, imageUrl: 'assets/menu/fries.jpeg', enabled: true },
  { name: 'Bicol Express', category: 'Main Courses', price: 135, stock: 12, minStock: 3, imageUrl: 'assets/menu/bicol-express.jpeg', enabled: true },
  { name: 'Pork Steak', category: 'Main Courses', price: 145, stock: 14, minStock: 4, imageUrl: 'assets/menu/pork-steak.jpeg', enabled: true },
  { name: 'Bread with Peanut Butter', category: 'Side Courses', price: 45, stock: 25, minStock: 5, imageUrl: 'assets/menu/bread-peanut-butter.jpeg', enabled: true },
  { name: 'Bread with Nutella', category: 'Side Courses', price: 50, stock: 24, minStock: 5, imageUrl: 'assets/menu/bread-nutella.jpeg', enabled: true },
  { name: 'Bread with Strawberry Jam', category: 'Side Courses', price: 48, stock: 22, minStock: 5, imageUrl: 'assets/menu/bread-strawberry-jam.jpeg', enabled: true },
  { name: 'Bottled Water', category: 'Beverages', price: 25, stock: 40, minStock: 10, imageUrl: 'assets/menu/water.jpeg', enabled: true },
  { name: 'Smart C', category: 'Beverages', price: 30, stock: 35, minStock: 10, imageUrl: 'assets/menu/smart-c.jpeg', enabled: true },
  { name: 'Yakult', category: 'Beverages', price: 35, stock: 30, minStock: 10, imageUrl: 'assets/menu/yakult.jpeg', enabled: true },
  { name: 'Combi', category: 'Biscuits & Snacks', price: 20, stock: 50, minStock: 10, imageUrl: 'assets/menu/combi.jpeg', enabled: true },
  { name: 'SkyFlakes', category: 'Biscuits & Snacks', price: 22, stock: 48, minStock: 10, imageUrl: 'assets/menu/skyflakes.jpeg', enabled: true },
  { name: 'Oreo', category: 'Biscuits & Snacks', price: 25, stock: 42, minStock: 10, imageUrl: 'assets/menu/oreo.jpeg', enabled: true },
  { name: 'Dewberry', category: 'Biscuits & Snacks', price: 18, stock: 45, minStock: 10, imageUrl: 'assets/menu/dewberry.jpeg', enabled: true },
  { name: 'Turon', category: 'Side Courses', price: 35, stock: 20, minStock: 5, imageUrl: 'assets/menu/turon.jpeg', enabled: true },
  { name: 'Beef Tapsilog', category: 'Main Courses', price: 130, stock: 16, minStock: 4, imageUrl: 'assets/menu/beef-tapsilog.jpeg', enabled: true },
  { name: 'Iced Coffee', category: 'Beverages', price: 60, stock: 24, minStock: 5, imageUrl: 'assets/menu/iced-coffee.jpeg', enabled: true }
];

const ANNOUNCEMENTS = [
  { title: 'Canteen will close at 6:00 PM today.', message: 'Please manage your dining time.', scheduleLabel: 'Today' },
  { title: 'New menu items this week', message: 'Bulalo and Halo-halo now available.', scheduleLabel: 'Sep 16' },
  { title: 'Reservation reminder', message: 'Check in within 15 minutes or your table is released.', scheduleLabel: 'Sep 15' }
];

const APP_SETTINGS = {
  name: 'NU Baliwag Canteen',
  hrs: '7:00 AM – 6:00 PM',
  contact: '(044) 123-4567',
  email: 'canteen@nu-baliwag.edu.ph',
  maxDur: 20,
  maxSeats: 6,
  ciDeadline: 15,
  cancelWin: 10,
  numTables: 12,
  cap: 4,
  locs: 'Near Stalls, Center Aisle, Window Side',
  preorder: 'Enabled',
  prepTime: 12,
  cutoff: '5:30 PM',
  notifRes: 1,
  notifOrd: 1,
  notifInv: 1
};

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nu_baliwag_canteen',
  multipleStatements: false
};

async function ensureNoTableDuplicates(connection) {
  const [rows] = await connection.execute('SELECT COUNT(*) AS table_count FROM dining_tables');
  const count = Number(rows[0]?.table_count || 0);

  if (count === 0) {
    console.warn('No dining tables were found. Leaving table data untouched to avoid creating duplicate table rows.');
    return;
  }

  console.log(`Found ${count} existing dining tables. Skipping table seeding to avoid duplicates.`);
}

async function upsertMenuItem(connection, item) {
  const [existing] = await connection.execute(
    'SELECT id FROM menu_items WHERE LOWER(name) = LOWER(?) LIMIT 1',
    [item.name]
  );

  if (existing.length) {
    await connection.execute(
      'UPDATE menu_items SET category = ?, price = ?, stock = ?, min_stock = ?, image_url = ?, enabled = ? WHERE id = ?',
      [item.category, item.price, item.stock, item.minStock, item.imageUrl || null, item.enabled ? 1 : 0, existing[0].id]
    );
    return;
  }

  await connection.execute(
    'INSERT INTO menu_items (name, category, price, stock, min_stock, image_url, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [item.name, item.category, item.price, item.stock, item.minStock, item.imageUrl || null, item.enabled ? 1 : 0]
  );
}

async function upsertAnnouncement(connection, item) {
  const [existing] = await connection.execute(
    'SELECT id FROM announcements WHERE title = ? AND message = ? LIMIT 1',
    [item.title, item.message]
  );

  if (existing.length) {
    await connection.execute(
      'UPDATE announcements SET schedule_label = ?, created_by = NULL WHERE id = ?',
      [item.scheduleLabel || null, existing[0].id]
    );
    return;
  }

  await connection.execute(
    'INSERT INTO announcements (title, message, schedule_label, created_by) VALUES (?, ?, ?, NULL)',
    [item.title, item.message, item.scheduleLabel || null]
  );
}

async function upsertAppSettings(connection, key, value) {
  const payload = JSON.stringify(value);
  const [existing] = await connection.execute(
    'SELECT setting_key FROM app_settings WHERE setting_key = ? LIMIT 1',
    [key]
  );

  if (existing.length) {
    await connection.execute(
      'UPDATE app_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
      [payload, key]
    );
    return;
  }

  await connection.execute(
    'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)',
    [key, payload]
  );
}

async function main() {
  const connection = await mysql.createConnection(config);

  try {
    await ensureNoTableDuplicates(connection);

    for (const item of MENU_ITEMS) {
      await upsertMenuItem(connection, item);
    }

    for (const item of ANNOUNCEMENTS) {
      await upsertAnnouncement(connection, item);
    }

    await upsertAppSettings(connection, 'cafe_settings', APP_SETTINGS);

    console.log('Seed data inserted successfully.');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
});

require('dotenv').config({
  path: require('path').resolve(__dirname, '../.env')
});
const bcrypt = require('bcryptjs');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
}
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nu_baliwag_canteen',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  dateStrings: true
});
app.use(helmet());
app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:5500' }));
app.use(express.json({ limit: '32kb' }));
const asyncRoute = handler => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
const isValidDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
};
const isValidReservationSlot = value => {
  if (!/^\d{2}:\d{2}(:00)?$/.test(String(value || ''))) return false;
  const [hour, minute] = value.split(':').map(Number);
  const minutes = hour * 60 + minute;
  return minutes >= 660 && minutes < 1080 &&
    (minutes - 660) % 20 === 0;
};
const todayInManila = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila'
  }).format(new Date());
const currentMinutesInManila = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
};
const requireAuth = (req, res, next) => {
  const token = req.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      error: 'Administrator access required.'
    });
  }
  next();
};
const issueToken = user => jwt.sign(
  {
    sub: String(user.id),
    role: user.role,
    name: user.name
  },
  jwtSecret,
  { expiresIn: '8h' }
);
// HEALTH CHECK
app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', database: 'connected' });
}));
// LOGIN
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const identity = String(req.body?.identity || '').trim();
  const password = String(req.body?.password || '');
  if (!identity || !password) {
    return res.status(400).json({
      error: 'Identity and password are required.'
    });
  }
  const [rows] = await pool.execute(
    'SELECT id, role, name, school_id, email, password_hash FROM users WHERE email = ? OR school_id = ? LIMIT 1',
    [identity, identity]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({
      error: 'Invalid identity or password.'
    });
  }
  res.json({
    token: issueToken(user),
    user: {
      id: user.id,
      role: user.role,
      name: user.name,
      schoolId: user.school_id,
      email: user.email
    }
  });
}));
// CURRENT USER
app.get('/api/auth/me', requireAuth, asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, role, name, school_id, email, phone FROM users WHERE id = ? AND active = TRUE',
    [req.user.sub]
  );
  if (!rows[0]) {
    return res.status(401).json({
      error: 'User account is unavailable.'
    });
  }
  res.json({ user: rows[0] });
}));
// MENU
app.get('/api/menu', asyncRoute(async (_req, res) => {
  const [items] = await pool.execute(
    'SELECT id, name, category, price, stock, min_stock AS minStock, image_url AS image, enabled FROM menu_items WHERE enabled = TRUE ORDER BY category, name'
  );
  res.json({ items });
}));
// TABLES
app.get('/api/tables', asyncRoute(async (req, res) => {
  const date = req.query.date;
  const slot = req.query.slot;
  let sql = 'SELECT id, table_number AS number, seats, location FROM dining_tables WHERE enabled = TRUE ORDER BY table_number';
  let params = [];
  if (date && slot) {
    sql = `SELECT t.id, t.table_number AS number, t.seats, t.location,
      EXISTS(
        SELECT 1 FROM reservations r
        WHERE r.table_id = t.id
        AND r.reservation_date = ?
        AND r.slot_start = ?
        AND r.status IN ('Reserved', 'Occupied')
      ) AS reserved
      FROM dining_tables t
      WHERE t.enabled = TRUE
      ORDER BY t.table_number`;
    params = [date, slot];
  }
  const [tables] = await pool.execute(sql, params);
  res.json({ tables });
}));
// STUDENT RESERVATIONS
app.get('/api/reservations/mine', requireAuth, asyncRoute(async (req, res) => {
  const [reservations] = await pool.execute(
    `SELECT r.id,
      r.reservation_date AS date,
      r.slot_start AS slot,
      r.status,
      r.check_in_status AS checkInStatus,
      t.table_number AS tableNumber,
      t.seats,
      t.location
     FROM reservations r
     JOIN dining_tables t ON t.id = r.table_id
     WHERE r.user_id = ?
     ORDER BY r.reservation_date DESC, r.slot_start DESC`,
    [req.user.sub]
  );
  res.json({ reservations });
}));
// CREATE RESERVATION
app.post('/api/reservations', requireAuth, asyncRoute(async (req, res) => {
  const { tableNumber, date, slot } = req.body || {};
  if (
    !Number.isInteger(Number(tableNumber)) ||
    !isValidDate(date) ||
    !isValidReservationSlot(slot)
  ) {
    return res.status(400).json({
      error: 'A valid table number, date, and time slot are required.'
    });
  }
  if (date < todayInManila()) {
    return res.status(400).json({
      error: 'Reservations cannot be made in the past.'
    });
  }
  const [slotHour, slotMinute] = slot.split(':').map(Number);
  if (
    date === todayInManila() &&
    slotHour * 60 + slotMinute <= currentMinutesInManila()
  ) {
    return res.status(400).json({
      error: 'Reservations cannot be made for a time slot that has already started.'
    });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [tables] = await connection.execute(
      'SELECT id, seats FROM dining_tables WHERE table_number = ? AND enabled = TRUE FOR UPDATE',
      [Number(tableNumber)]
    );
    if (!tables[0]) {
      await connection.rollback();
      return res.status(404).json({
        error: 'Table is unavailable.'
      });
    }
    const [conflicts] = await connection.execute(
      "SELECT id FROM reservations WHERE table_id = ? AND reservation_date = ? AND slot_start = ? AND status IN ('Reserved', 'Occupied') FOR UPDATE",
      [tables[0].id, date, slot]
    );
    if (conflicts.length) {
      await connection.rollback();
      return res.status(409).json({
        error: 'That table and time slot have already been reserved.'
      });
    }
    const [result] = await connection.execute(
      'INSERT INTO reservations (user_id, table_id, reservation_date, slot_start) VALUES (?, ?, ?, ?)',
      [req.user.sub, tables[0].id, date, slot]
    );
    await connection.commit();
    res.status(201).json({
      reservation: {
        id: result.insertId,
        tableNumber: Number(tableNumber),
        seats: tables[0].seats,
        date,
        slot,
        status: 'Reserved'
      }
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));
async function cancelReservationInTransaction(connection, reservationId, userId, cancelOrder) {
  const userFilter = userId ? 'AND user_id = ?' : '';
  const params = userId ? [reservationId, userId] : [reservationId];
  const [reservations] = await connection.execute(
    `SELECT id FROM reservations WHERE id = ? ${userFilter} AND status = 'Reserved' FOR UPDATE`,
    params
  );
  if (!reservations[0]) return null;

  let cancelledOrders = 0;
  if (cancelOrder) {
    const [orders] = await connection.execute(
      "UPDATE orders SET status = 'Cancelled' WHERE reservation_id = ? AND status IN ('Pending', 'Preparing', 'Ready')",
      [reservationId]
    );
    cancelledOrders = orders.affectedRows;
  }
  await connection.execute(
    "UPDATE reservations SET status = 'Cancelled', check_in_status = 'Cancelled' WHERE id = ?",
    [reservationId]
  );
  return { status: 'Cancelled', cancelledOrders };
}

// CANCEL RESERVATION
app.patch('/api/reservations/:id/cancel', requireAuth, asyncRoute(async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await cancelReservationInTransaction(
      connection,
      req.params.id,
      req.user.sub,
      req.body?.cancelOrder === true
    );
    if (!result) {
      await connection.rollback();
      return res.status(404).json({ error: 'Active reservation not found.' });
    }
    await connection.commit();
    res.json(result);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

// ADMIN: CANCEL RESERVATION
app.patch('/api/admin/reservations/:id/cancel', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await cancelReservationInTransaction(
      connection,
      req.params.id,
      null,
      req.body?.cancelOrder === true
    );
    if (!result) {
      await connection.rollback();
      return res.status(404).json({ error: 'Active reservation not found.' });
    }
    await connection.commit();
    res.json(result);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));
// STUDENT ORDERS
app.get('/api/orders/mine', requireAuth, asyncRoute(async (req, res) => {
  const [orders] = await pool.execute(
    `SELECT o.id,
      o.status,
      o.reservation_id AS reservationId,
      o.payment_method AS paymentMethod,
      o.total,
      o.created_at AS createdAt,
      r.reservation_date AS date,
      r.slot_start AS slot,
      t.table_number AS tableNumber,
      COALESCE(
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'name', oi.item_name,
            'price', oi.unit_price,
            'quantity', oi.quantity
          )
        ),
        JSON_ARRAY()
      ) AS items
     FROM orders o
     LEFT JOIN reservations r ON r.id = o.reservation_id
     LEFT JOIN dining_tables t ON t.id = r.table_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = ?
     GROUP BY o.id
     ORDER BY o.created_at DESC`,
    [req.user.sub]
  );
  res.json({ orders });
}));
// CREATE ORDER
app.post('/api/orders', requireAuth, asyncRoute(async (req, res) => {
  const reservationId = req.body?.reservationId || null;
  const paymentMethod = req.body?.paymentMethod || 'Cash';
  const items = req.body?.items;
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    !['GCash', 'Maya', 'Card', 'Cash'].includes(paymentMethod)
  ) {
    return res.status(400).json({
      error: 'Valid order items and payment method are required.'
    });
  }
  const quantities = new Map();
  for (const item of items) {
    const id = Number(item.menuItemId);
    const quantity = Number(item.quantity);
    if (
      !Number.isInteger(id) ||
      id < 1 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100
    ) {
      return res.status(400).json({
        error: 'Each item needs a valid menu item ID and quantity.'
      });
    }
    quantities.set(id, (quantities.get(id) || 0) + quantity);
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (reservationId) {
      const [reservations] = await connection.execute(
        "SELECT id FROM reservations WHERE id = ? AND user_id = ? AND status = 'Reserved' FOR UPDATE",
        [reservationId, req.user.sub]
      );
      if (!reservations[0]) {
        await connection.rollback();
        return res.status(409).json({
          error: 'An active reservation is required for this order.'
        });
      }
    }
    const ids = [...quantities.keys()];
    const [menuItems] = await connection.query(
      `SELECT id, name, price, stock
       FROM menu_items
       WHERE enabled = TRUE
       AND id IN (${ids.map(() => '?').join(',')})
       ORDER BY id FOR UPDATE`,
      ids
    );
    if (menuItems.length !== ids.length) {
      await connection.rollback();
      return res.status(409).json({
        error: 'One or more menu items are unavailable.'
      });
    }
    for (const menuItem of menuItems) {
      if (menuItem.stock < quantities.get(menuItem.id)) {
        await connection.rollback();
        return res.status(409).json({
          error: `${menuItem.name} does not have enough stock.`
        });
      }
    }
    const total = menuItems.reduce(
      (sum, item) =>
        sum + Number(item.price) * quantities.get(item.id),
      0
    );
    const [result] = await connection.execute(
      'INSERT INTO orders (reservation_id, user_id, payment_method, total) VALUES (?, ?, ?, ?)',
      [reservationId, req.user.sub, paymentMethod, total]
    );
    for (const item of menuItems) {
      await connection.execute(
        'INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity) VALUES (?, ?, ?, ?, ?)',
        [
          result.insertId,
          item.id,
          item.name,
          item.price,
          quantities.get(item.id)
        ]
      );
    }
    await connection.commit();
    res.status(201).json({
      order: {
        id: result.insertId,
        status: 'Pending',
        total,
        paymentMethod
      }
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));
// ADMIN: GET ALL ORDERS
app.get('/api/admin/orders', requireAuth, requireAdmin, asyncRoute(async (_req, res) => {
  const [orders] = await pool.execute(
    `SELECT o.id,
      o.reservation_id AS reservationId,
      o.status,
      o.payment_method AS paymentMethod,
      o.total,
      o.created_at AS createdAt,
      u.name AS studentName,
      u.school_id AS schoolId,
      t.table_number AS tableNumber,
      COALESCE(
        JSON_ARRAYAGG(
          IF(
            oi.order_id IS NULL,
            NULL,
            JSON_OBJECT(
              'name', oi.item_name,
              'price', oi.unit_price,
              'quantity', oi.quantity
            )
          )
        ),
        JSON_ARRAY()
      ) AS items
     FROM orders o
     JOIN users u ON u.id = o.user_id
     LEFT JOIN reservations r ON r.id = o.reservation_id
     LEFT JOIN dining_tables t ON t.id = r.table_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     GROUP BY
       o.id,
       o.reservation_id,
       o.status,
       o.payment_method,
       o.total,
       o.created_at,
       u.name,
       u.school_id,
       t.table_number
     ORDER BY o.created_at DESC`
  );
  res.json({ orders });
}));
// ADMIN: GET ALL RESERVATIONS
app.get('/api/admin/reservations', requireAuth, requireAdmin, asyncRoute(async (_req, res) => {
  const [reservations] = await pool.execute(
    `SELECT r.id,
      r.reservation_date AS date,
      r.slot_start AS slot,
      r.status,
      r.check_in_status AS checkInStatus,
      t.table_number AS tableNumber,
      t.seats,
      t.location,
      u.name AS studentName,
      u.school_id AS schoolId
     FROM reservations r
     JOIN users u ON u.id = r.user_id
     JOIN dining_tables t ON t.id = r.table_id
     ORDER BY r.reservation_date DESC, r.slot_start DESC`
  );
  res.json({ reservations });
}));
// ADMIN: GET STUDENT ACCOUNTS
app.get('/api/admin/users', requireAuth, requireAdmin, asyncRoute(async (_req, res) => {
  const [users] = await pool.execute(
    `SELECT u.id, u.name, u.school_id AS schoolId, u.email,
      u.active,
      (SELECT COUNT(*) FROM reservations r WHERE r.user_id = u.id) AS reservations,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders
     FROM users u
     WHERE u.role = 'student'
     ORDER BY u.name`
  );
  res.json({ users });
}));
// ADMIN: UPDATE STUDENT ACCOUNT STATUS
app.patch('/api/admin/users/:id/active', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (typeof req.body?.active !== 'boolean') {
    return res.status(400).json({ error: 'A boolean active value is required.' });
  }
  const [result] = await pool.execute(
    "UPDATE users SET active = ? WHERE id = ? AND role = 'student'",
    [req.body.active, req.params.id]
  );
  if (!result.affectedRows) {
    return res.status(404).json({ error: 'Student account not found.' });
  }
  res.json({ id: Number(req.params.id), active: req.body.active });
}));
// ADMIN: UPDATE ORDER STATUS
app.patch('/api/admin/orders/:id/status', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const nextStatus = req.body?.status;
  const transitions = {
    Pending: 'Preparing',
    Preparing: 'Ready',
    Ready: 'Completed'
  };
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.execute(
      'SELECT id, status, inventory_deducted FROM orders WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    const order = orders[0];
    if (!order) {
      await connection.rollback();
      return res.status(404).json({
        error: 'Order not found.'
      });
    }
    if (nextStatus === 'Cancelled') {
      if (['Completed', 'Cancelled'].includes(order.status)) {
        await connection.rollback();
        return res.status(409).json({
          error: 'This order cannot be cancelled.'
        });
      }
    } else if (transitions[order.status] !== nextStatus) {
      await connection.rollback();
      return res.status(409).json({
        error: 'Invalid order status transition.'
      });
    }
    if (nextStatus === 'Completed' && !order.inventory_deducted) {
      const [items] = await connection.execute(
        'SELECT menu_item_id, quantity FROM order_items WHERE order_id = ?',
        [order.id]
      );
      for (const item of items) {
        const [updated] = await connection.execute(
          'UPDATE menu_items SET stock = stock - ? WHERE id = ? AND stock >= ?',
          [item.quantity, item.menu_item_id, item.quantity]
        );
        if (!updated.affectedRows) {
          throw Object.assign(
            new Error('Insufficient stock to complete this order.'),
            { status: 409 }
          );
        }
      }
      await connection.execute(
        'UPDATE orders SET status = ?, inventory_deducted = TRUE WHERE id = ?',
        [nextStatus, order.id]
      );
      if (order.reservation_id) {
        await connection.execute(
          "UPDATE reservations SET status = 'Occupied' WHERE id = ?",
          [order.reservation_id]
        );
      }
    } else {
      await connection.execute(
        'UPDATE orders SET status = ? WHERE id = ?',
        [nextStatus, order.id]
      );
    }
    await connection.commit();
    res.json({
      id: order.id,
      status: nextStatus
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));
// ANNOUNCEMENTS
app.get('/api/announcements', asyncRoute(async (_req, res) => {
  const [announcements] = await pool.execute(
    'SELECT id, title, message, schedule_label AS scheduleLabel, created_at AS createdAt FROM announcements ORDER BY created_at DESC'
  );
  res.json({ announcements });
}));
// ADMIN: CREATE ANNOUNCEMENT
app.post('/api/admin/announcements', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const message = String(req.body?.message || '').trim();
  const scheduleLabel =
    String(req.body?.scheduleLabel || '').trim() || null;
  if (!title || !message) {
    return res.status(400).json({
      error: 'Title and message are required.'
    });
  }
  const [result] = await pool.execute(
    'INSERT INTO announcements (title, message, schedule_label, created_by) VALUES (?, ?, ?, ?)',
    [title, message, scheduleLabel, req.user.sub]
  );
  res.status(201).json({
    id: result.insertId,
    title,
    message,
    scheduleLabel
  });
}));
// 404 HANDLER
app.use((req, res) =>
  res.status(404).json({ error: 'Route not found.' })
);
// ERROR HANDLER
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({
    error: error.status ? error.message : 'Internal server error.'
  });
});
// START SERVER
app.listen(port, () => {
  console.log(`Canteen API listening on http://localhost:${port}`);
});
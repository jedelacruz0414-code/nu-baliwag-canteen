CREATE DATABASE IF NOT EXISTS nu_baliwag_canteen
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE nu_baliwag_canteen;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  role ENUM('student', 'admin') NOT NULL DEFAULT 'student',
  name VARCHAR(120) NOT NULL,
  school_id VARCHAR(40) NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dining_tables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  table_number SMALLINT UNSIGNED NOT NULL UNIQUE,
  seats TINYINT UNSIGNED NOT NULL,
  location VARCHAR(80) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(80) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  min_stock INT UNSIGNED NOT NULL DEFAULT 0,
  image_url VARCHAR(500) NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  table_id BIGINT UNSIGNED NOT NULL,
  reservation_date DATE NOT NULL,
  slot_start TIME NOT NULL,
  status ENUM('Reserved', 'Occupied', 'Cancelled', 'Expired') NOT NULL DEFAULT 'Reserved',
  check_in_status ENUM('Pending', 'Checked-in', 'No show', 'Cancelled') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reservations_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_reservations_table FOREIGN KEY (table_id) REFERENCES dining_tables(id),
  INDEX idx_reservations_user_date (user_id, reservation_date),
  INDEX idx_reservations_table_slot (table_id, reservation_date, slot_start, status)
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reservation_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Pending',
  payment_method ENUM('GCash', 'Maya', 'Card', 'Cash') NOT NULL DEFAULT 'Cash',
  total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  inventory_deducted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_orders_user_created (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS order_items (
  order_id BIGINT UNSIGNED NOT NULL,
  menu_item_id BIGINT UNSIGNED NOT NULL,
  item_name VARCHAR(120) NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  PRIMARY KEY (order_id, menu_item_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  schedule_label VARCHAR(80) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_announcements_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO dining_tables (table_number, seats, location) VALUES
  (1, 4, 'Near Stalls'), (2, 4, 'Window Side'), (3, 6, 'Near Stalls'),
  (4, 4, 'Window Side'), (5, 4, 'Near Stalls'), (6, 6, 'Window Side'),
  (7, 4, 'Near Stalls'), (8, 4, 'Window Side'), (9, 6, 'Near Stalls'),
  (10, 4, 'Window Side'), (11, 4, 'Near Stalls'), (12, 6, 'Window Side');
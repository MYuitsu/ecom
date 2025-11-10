CREATE DATABASE IF NOT EXISTS shop;
USE shop;

-- Bảng đơn hàng
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  total_amount DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bảng chi tiết đơn hàng
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Bảng thanh toán
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  provider VARCHAR(50),
  amount DECIMAL(10,2),
  status VARCHAR(20),
  paid_at DATETIME,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

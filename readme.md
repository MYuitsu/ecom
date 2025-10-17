## Ecom API — Hướng dẫn khởi tạo, chạy, kiểm thử và CSDL phân tán (MongoDB Replica Set)

Repo này cung cấp một API Flask đơn giản cho e-commerce, minh họa:

-   Ghi dữ liệu giao dịch vào MySQL
-   Ghi/đọc đánh giá sản phẩm (reviews) vào MongoDB với Replica Set (CSDL phân tán): majority write, đọc từ secondary, và failover khi primary thay đổi

### Yêu cầu hệ thống

-   Docker Desktop
-   Python 3.11+ (khuyến nghị)
-   Windows 10/11 (hướng dẫn lệnh cho Windows, có kèm PowerShell/CMD)

## 1) Khởi động hạ tầng bằng Docker

File `docker-compose.yml` bao gồm:

-   `mysql` (cổng host 3307)
-   `mongodb1`, `mongodb2` và `mongodb-arbiter` (map các cổng 27117/27118/27119)

Chạy:

```powershell
docker compose up -d
```

Kiểm tra:

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

## 2) Khởi tạo MongoDB Replica Set (dùng hostname host.docker.internal)

Để cả Docker containers và máy host Windows dùng chung một URI replica set, cấu hình members bằng `host.docker.internal` với cổng host map:

```powershell
docker exec mongodb1 mongosh --eval "rs.reconfig({ _id: 'rs0', members: [ { _id: 0, host: 'host.docker.internal:27117', priority: 2 }, { _id: 1, host: 'host.docker.internal:27118', priority: 1 }, { _id: 2, host: 'host.docker.internal:27119', arbiterOnly: true } ] }, { force: true })"
```

Kiểm tra trạng thái:

```powershell
docker exec mongodb1 mongosh --eval "rs.status()"
```

Ghi chú:

-   Nếu lần đầu, có thể cần `rs.initiate(...)` trước khi `rs.reconfig(...)`.
-   Không cần liệt kê arbiter trong URI của client.

## 3) Tạo `.env` và cài Python deps

Tạo venv và cài đặt:

```powershell
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Tạo file `.env` (đặt cạnh `app.py`):

```ini
MONGODB_URI=mongodb://host.docker.internal:27117,host.docker.internal:27118/?replicaSet=rs0&readPreference=primary&directConnection=false
MONGODB_DB=shop
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3307
```

## 4) Khởi tạo schema MySQL tối thiểu

```powershell
docker exec mysql mysql -uroot -psecret -e "CREATE DATABASE IF NOT EXISTS shop; \
  USE shop; \
  CREATE TABLE IF NOT EXISTS orders ( \
    id BIGINT PRIMARY KEY AUTO_INCREMENT, \
    user_id BIGINT NOT NULL, \
    total_amount DECIMAL(12,2) NOT NULL, \
    status ENUM('PENDING','PAID','CANCELLED') NOT NULL DEFAULT 'PENDING', \
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP \
  ) ENGINE=InnoDB; \
  CREATE TABLE IF NOT EXISTS order_items ( \
    id BIGINT PRIMARY KEY AUTO_INCREMENT, \
    order_id BIGINT NOT NULL, \
    product_id BIGINT NOT NULL, \
    quantity INT NOT NULL, \
    price DECIMAL(12,2) NOT NULL, \
    FOREIGN KEY (order_id) REFERENCES orders(id) \
  ) ENGINE=InnoDB; \
  CREATE TABLE IF NOT EXISTS payments ( \
    id BIGINT PRIMARY KEY AUTO_INCREMENT, \
    order_id BIGINT NOT NULL, \
    provider VARCHAR(50) NOT NULL, \
    amount DECIMAL(12,2) NOT NULL, \
    status ENUM('INIT','SUCCESS','FAILED') NOT NULL, \
    paid_at TIMESTAMP NULL, \
    FOREIGN KEY (order_id) REFERENCES orders(id) \
  ) ENGINE=InnoDB;"
```

## 5) Chạy ứng dụng

```powershell
python app.py
```

Mặc định API chạy ở `http://127.0.0.1:8080`.

## 6) Kiểm thử API (đảm bảo tính chất CSDL phân tán)

### 6.1 Healthcheck

```powershell
curl http://127.0.0.1:8080/health
```

Kỳ vọng: `ok=true`, trả về thông tin MySQL và Mongo (primary, hosts)

### 6.2 Tạo đơn hàng (ghi MySQL)

```powershell
curl -X POST http://127.0.0.1:8080/orders \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"items":[{"productId":101,"quantity":2,"price":5.5},{"productId":102,"quantity":1,"price":9.9}]}'
```

### 6.3 Thanh toán đơn hàng (ghi MySQL)

```powershell
curl -X POST http://127.0.0.1:8080/orders/1/pay \
  -H "Content-Type: application/json" \
  -d '{"amount":20.9,"provider":"VNPAY"}'
```

### 6.4 Tạo review (ghi MongoDB với majority)

```powershell
curl -X POST http://127.0.0.1:8080/reviews \
  -H "Content-Type: application/json" \
  -d '{"productId":101,"rating":4.5,"comment":"good","orderId":1}'
```

### 6.5 Đọc tổng quan sản phẩm (readPreference)

-   Đọc từ primary:

```powershell
curl "http://127.0.0.1:8080/products/101/summary?read_from=primary"
```

-   Đọc ưu tiên secondary:

```powershell
curl "http://127.0.0.1:8080/products/101/summary?read_from=secondary"
```

Kỳ vọng: cả hai trả dữ liệu thống nhất; khi `secondaryPreferred`, Mongo sẽ ưu tiên đọc từ secondary nếu có.

### 6.6 Kiểm tra failover (step down primary)

```powershell
docker exec mongodb1 mongosh --eval "rs.stepDown(10)"
```

Sau vài giây, thử đọc lại:

```powershell
curl "http://127.0.0.1:8080/products/101/summary?read_from=secondary"
curl "http://127.0.0.1:8080/products/101/summary?read_from=primary"
```

Kỳ vọng: đọc secondary vẫn hoạt động trong thời gian primary đang thay đổi; primary sẽ đọc lại OK sau khi bầu xong.

## 7) Giải thích nhanh về CSDL phân tán (Replica Set)

-   **Replica Set**: Cụm gồm nhiều node MongoDB, có 1 primary nhận ghi, các secondary nhân bản dữ liệu từ primary.
-   **Write Concern majority**: Lệnh ghi chỉ thành công khi đã được xác nhận bởi đa số node (đa số = primary + ít nhất 1 secondary), giúp tăng tính bền vững dữ liệu.
-   **Read Preference**: Cho phép chọn nơi đọc dữ liệu:
    -   `primary`: nhất quán mạnh, luôn đọc từ primary
    -   `secondaryPreferred`: ưu tiên secondary, giảm tải primary (có thể đọc dữ liệu hơi trễ do replication lag)
-   **Failover**: Khi primary ngừng/bị step down, replica set bầu primary mới. Ứng dụng dùng URI replica set sẽ tự phát hiện và tiếp tục hoạt động.

## 8) Troubleshooting

-   Lỗi DNS hoặc không kết nối được `mongodb1/mongodb2`: trên Windows, dùng `host.docker.internal` trong cấu hình replica set và trong `MONGODB_URI`.
-   CMD vs PowerShell: trên CMD, tránh dùng nháy đơn `'...'`; nên dùng PowerShell hoặc escape nháy kép.
-   `AlreadyInitialized` khi `rs.initiate`: bỏ qua hoặc dùng `rs.reconfig(..., { force: true })` nếu cần.
-   `/health` lỗi Mongo: kiểm tra `MONGODB_URI`, replica set đã sẵn sàng và cổng map 27117/27118/27119 đang mở.

## 9) Dừng ứng dụng

```powershell
docker compose down
```

---

Sản xuất bởi Flask + MySQL + MongoDB Replica Set. Hỗ trợ minh họa các đặc tính quan trọng của CSDL phân tán: majority write, read từ secondary, và failover.
"# ecom" 

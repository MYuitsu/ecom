# Hướng Dẫn Test Hệ Thống Phân Tán

## Các Trang Giao Diện

### 1. Trang Chính (Main UI)
- URL: `http://localhost:5173/`
- Chức năng: Test các API cơ bản của hệ thống

### 2. Trang Distributed Testing Dashboard
- URL: `http://localhost:5173/distributed-test.html`
- Chức năng: Đánh giá và test hệ thống phân tán

## Các Chức Năng Test Phân Tán

### 🏥 Health Check - All Nodes
- Kiểm tra trạng thái của tất cả các node
- Hiển thị thông tin MySQL và MongoDB từng node
- Đo latency kết nối đến từng node

### 🔄 Distributed Query
- **Mục đích**: Truy vấn hoặc giao dịch trên nhiều nút dữ liệu
- **Cách hoạt động**: 
  - Query song song tất cả các node
  - So sánh kết quả giữa các node
  - Kiểm tra tính nhất quán của dữ liệu
  - Đo độ trễ từng node

### 📊 Local vs Distributed Comparison
- **Mục đích**: So sánh truy vấn cục bộ và truy vấn phân tán
- **Cách hoạt động**:
  - Query local: chỉ primary node
  - Query distributed: tất cả các node song song
  - So sánh performance và latency
  - Hiển thị chi tiết thời gian thực thi

### 💳 Distributed Transaction
- **Mục đích**: Đồng bộ, tổng hợp, hoặc kết hợp kết quả giữa các mô hình khác nhau
- **Cách hoạt động**:
  - Tạo order trên primary node (MySQL)
  - Payment trên secondary node
  - Tạo review trên MongoDB
  - Verify transaction trên tất cả các node
  - Đảm bảo consistency giữa MySQL và MongoDB

### 🔁 Replication & Sync
- **Mục đích**: Minh họa cơ chế sao chép / đồng bộ dữ liệu
- **Cách hoạt động**:
  - Write data vào primary node
  - Monitor replication đến secondary nodes
  - Kiểm tra tại các mốc thời gian khác nhau (0ms, 1s, 2s, 5s)
  - Verify data consistency sau sync

### ⚠️ Node Failover Test
- **Mục đích**: Xử lý lỗi hoặc đảm bảo nhất quán khi một nút bị ngắt kết nối
- **Cách hoạt động**:
  - Trigger primary node step down (MongoDB)
  - Monitor health của tất cả nodes trong quá trình failover
  - Kiểm tra khả năng tự động elect primary mới
  - Verify system vẫn hoạt động sau failover

### ⚡ Stress Test
- **Mục đích**: Đánh giá hiệu năng hệ thống dưới tải
- **Cách hoạt động**:
  - Gửi nhiều requests đồng thời
  - Phân phối load qua tất cả các node (round-robin)
  - Đo latency trung bình
  - Tính success rate và requests/second

## Cấu Hình Hệ Thống

### Nodes trong hệ thống (cấu hình trong distributed-test.ts):
```typescript
const NODES = [
    { id: 1, name: "Node 1 (Primary)", url: "http://10.8.0.10:1236", type: "primary" },
    { id: 2, name: "Node 2", url: "http://10.8.0.14:1236", type: "secondary" },
    { id: 3, name: "Node 3", url: "http://10.8.0.15:1236", type: "secondary" },
];
```

### Yêu cầu:
- Ít nhất 3 máy (hoặc 4) kết nối mạng LAN
- Mỗi máy chạy Flask app với cùng cấu hình
- MongoDB Replica Set với 3 nodes
- MySQL với replication (optional)

## Cách Chạy

### 1. Start Frontend
```bash
cd frontend
npm install
npm run dev
```

### 2. Start Backend trên từng máy
```bash
# Máy 1 (10.8.0.10)
python app.py

# Máy 2 (10.8.0.14)
python app.py

# Máy 3 (10.8.0.15)
python app.py
```

### 3. Truy cập Dashboard
- Mở browser: `http://localhost:5173/distributed-test.html`
- Hoặc từ máy khác: `http://10.8.0.10:5173/distributed-test.html`

## Kịch Bản Test

### Test 1: Kiểm tra kết nối
1. Click "Test Health on All Nodes"
2. Verify tất cả 3 nodes đều online
3. Kiểm tra latency đến từng node

### Test 2: Distributed Query & Data Consistency
1. Nhập Product ID (ví dụ: 101)
2. Click "Run Distributed Query"
3. Quan sát:
   - Tất cả nodes trả về cùng data
   - Latency từng node
   - Data consistency status

### Test 3: Performance Comparison
1. Click "Compare Performance"
2. So sánh:
   - Local query time vs Distributed query time
   - Trade-off giữa speed và fault tolerance

### Test 4: Distributed Transaction
1. Click "Test Transaction"
2. Quan sát:
   - Order được tạo trên primary
   - Payment được xử lý
   - Data được sync qua các nodes

### Test 5: Replication Mechanism
1. Click "Test Replication"
2. Quan sát:
   - Write vào primary
   - Delay time cho replication
   - Data xuất hiện trên secondary nodes

### Test 6: Failover & Fault Tolerance
1. Click "Test Failover (Step Down Primary)"
2. Quan sát:
   - Primary MongoDB node step down
   - System tự động elect primary mới
   - System vẫn hoạt động trong quá trình failover

### Test 7: Load Testing
1. Nhập số iterations (ví dụ: 50)
2. Click "Run Stress Test"
3. Kiểm tra:
   - Success rate
   - Average latency
   - Requests per second

## Activity Log

Dashboard có activity log real-time hiển thị:
- Tất cả actions được thực hiện
- Success/Error messages
- Timestamp của mỗi event
- Performance metrics

## Metrics Được Đo

1. **Latency**: Thời gian response từ mỗi node
2. **Success Rate**: Tỷ lệ requests thành công
3. **Data Consistency**: Dữ liệu có giống nhau giữa các nodes
4. **Replication Lag**: Thời gian để data sync
5. **Failover Time**: Thời gian để system recover
6. **Throughput**: Requests per second

## Ghi Chú

- Màu xanh = Success
- Màu đỏ = Error/Failure
- Màu vàng = Warning
- Latency được hiển thị bên cạnh mỗi kết quả
- Tất cả results được timestamp để tracking

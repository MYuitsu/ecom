Tóm nhanh mapping “tính chất” ↔ “code”

Phân tán dữ liệu/đa mô hình → dùng MySQL + Mongo (hai datastore độc lập).

Replication & transparency → URI replica set + /health (hello).

Consistency models → MySQL (TXN + FOR UPDATE) vs Mongo (WC majority, RP secondary).

Cross-DB aggregation → /products/<id>/summary ghép MySQL + Mongo.

Liên-CSDL an toàn nghiệp vụ → /reviews kiểm tra PAID ở MySQL rồi mới ghi Mongo.

Chịu lỗi/failover → dừng PRIMARY vẫn chạy; quan sát trong /health.

import os
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import pymysql
from pymysql.cursors import DictCursor
from pymongo import MongoClient, ReadPreference, WriteConcern
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

# ---- Load env ----
load_dotenv()
app = Flask(__name__)
CORS(app, resources={r"*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173", "*"]}})

# ---- Logging ----
DEBUG_MODE = os.getenv("DEBUG", "1") == "1"
logging.basicConfig(
    level=logging.DEBUG if DEBUG_MODE else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

# ---- MySQL connection ----
def mysql_conn():
    return pymysql.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        port=int(os.getenv("MYSQL_PORT", "3307")),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", "secret"),
        database=os.getenv("MYSQL_DB", "shop"),
        autocommit=False,
        cursorclass=DictCursor,
    )

# ---- MongoDB connection (replica set + retry) ----
mongo_client = MongoClient(
    os.getenv("MONGODB_URI"),
    serverSelectionTimeoutMS=5000,   # chỉ chờ 5s nếu MongoDB chưa sẵn sàng
    retryWrites=True,                # tự retry khi failover
    connect=False                    # lazy connect để tránh crash khi khởi động
)
mdb = mongo_client[os.getenv("MONGODB_DB", "shop")]
reviews = mdb.get_collection("reviews").with_options(write_concern=WriteConcern(w="majority"))

def ok(data): return jsonify({"ok": True, "data": data})
def bad(msg, code=400): return jsonify({"ok": False, "error": msg}), code

# ---- Health Check ----
@app.get("/health")
def health():
    try:
        # Kiểm tra MySQL
        with mysql_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 AS db_ok")
                mysql_ok = cur.fetchone()

        # Kiểm tra MongoDB
        topo = mongo_client.admin.command("hello")
        mongo_info = {
            "isWritablePrimary": topo.get("isWritablePrimary"),
            "primary": topo.get("primary"),
            "me": topo.get("me"),
            "hosts": topo.get("hosts"),
        }
        return ok({"mysql": mysql_ok, "mongo": mongo_info})
    except Exception as e:
        logger.exception("Health check failed")
        return bad(str(e), 500)


# -----------------------
# POST /orders
# -----------------------
@app.post("/orders")
def create_order():
    body = request.get_json(force=True) or {}
    logger.debug(f"[POST /orders] Body: {body}")
    user_id = body.get("userId")
    items = body.get("items") or []
    if not user_id or not isinstance(items, list) or len(items) == 0:
        logger.warning("[/orders] Missing userId or items[]")
        return bad("userId & items[] required")

    try:
        with mysql_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO orders(user_id,total_amount,status,created_at) VALUES (%s,%s,%s,NOW())",
                    (user_id, 0, "PENDING"),
                )
                order_id = cur.lastrowid
                total = 0
                for it in items:
                    pid, qty, price = it.get("productId"), it.get("quantity"), it.get("price")
                    if not pid or not qty or not price:
                        conn.rollback()
                        logger.error("[/orders] Invalid item format: %s", it)
                        return bad("Each item requires productId, quantity, price")
                    total += float(qty) * float(price)
                    cur.execute(
                        "INSERT INTO order_items(order_id,product_id,quantity,price) VALUES (%s,%s,%s,%s)",
                        (order_id, pid, qty, price),
                    )
                cur.execute("UPDATE orders SET total_amount=%s WHERE id=%s", (total, order_id))
                conn.commit()
                logger.info(f"[/orders] Created order #{order_id} total={total}")
                return ok({"orderId": order_id, "total": total})
    except Exception as e:
        logger.exception("[/orders] Failed to create order")
        return bad(str(e), 500)


# -----------------------
# POST /orders/<id>/pay
# -----------------------
@app.post("/orders/<int:order_id>/pay")
def pay_order(order_id: int):
    body = request.get_json(force=True) or {}
    logger.debug(f"[POST /orders/{order_id}/pay] Body: {body}")
    amount = body.get("amount")
    provider = body.get("provider", "VNPAY")
    if amount is None:
        return bad("amount required")
    try:
        with mysql_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM orders WHERE id=%s FOR UPDATE", (order_id,))
                order = cur.fetchone()
                if not order:
                    conn.rollback()
                    logger.warning(f"[/orders/{order_id}/pay] Order not found")
                    return bad("Order not found", 404)
                cur.execute(
                    "INSERT INTO payments(order_id,provider,amount,status,paid_at) VALUES (%s,%s,%s,%s,NOW())",
                    (order_id, provider, amount, "SUCCESS"),
                )
                cur.execute("UPDATE orders SET status=%s WHERE id=%s", ("PAID", order_id))
                conn.commit()
                logger.info(f"[/orders/{order_id}/pay] Order marked PAID")
                return ok({"orderId": order_id, "state": "PAID"})
    except Exception as e:
        logger.exception(f"[/orders/{order_id}/pay] Payment failed")
        return bad(str(e), 500)


# -----------------------
# POST /reviews
# -----------------------
@app.post("/reviews")
def create_review():
    body = request.get_json(force=True) or {}
    logger.debug(f"[POST /reviews] Body: {body}")
    product_id, rating = body.get("productId"), body.get("rating")
    comment, order_id = body.get("comment", ""), body.get("orderId")
    if product_id is None or rating is None:
        return bad("productId & rating required")

    if order_id:
        try:
            with mysql_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT status FROM orders WHERE id=%s", (order_id,))
                    row = cur.fetchone()
                    if not row or row["status"] != "PAID":
                        logger.warning(f"[/reviews] Invalid orderId={order_id} not PAID")
                        return bad("review allowed only for PAID orders")
        except Exception as e:
            logger.exception("[/reviews] MySQL check failed")
            return bad(str(e), 500)
    try:
        doc = {
            "productId": int(product_id),
            "rating": float(rating),
            "comment": str(comment),
            "orderId": int(order_id) if order_id else None,
            "createdAt": datetime.utcnow(),
        }
        r = reviews.insert_one(doc)
        logger.info(f"[/reviews] Inserted review id={r.inserted_id}")
        return ok({"insertedId": str(r.inserted_id)})
    except (ConnectionFailure, ServerSelectionTimeoutError) as e:
        logger.error("[/reviews] MongoDB unavailable: %s", e)
        return bad("MongoDB temporarily unavailable", 503)
    except Exception as e:
        logger.exception("[/reviews] Insert failed")
        return bad(str(e), 500)


# -----------------------
# GET /products/<id>/summary
# -----------------------
@app.get("/products/<int:product_id>/summary")
def product_summary(product_id: int):
    read_from = (request.args.get("read_from") or "primary").lower()
    rp = ReadPreference.PRIMARY if read_from == "primary" else ReadPreference.SECONDARY_PREFERRED
    reviews_coll = mdb.get_collection("reviews").with_options(read_preference=rp)
    try:
        # MySQL: tổng bán (đơn PAID)
        with mysql_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                  SELECT COALESCE(SUM(oi.quantity),0) AS total_sold
                  FROM order_items oi
                  JOIN orders o ON o.id = oi.order_id
                  WHERE oi.product_id=%s AND o.status='PAID'
                """, (product_id,))
                sold = cur.fetchone()["total_sold"]

        # Mongo: tổng review + avg rating
        pipeline = [
            {"$match": {"productId": product_id}},
            {"$group": {"_id": "$productId", "count": {"$sum": 1}, "avgRating": {"$avg": "$rating"}}},
        ]
        aggs = list(reviews_coll.aggregate(pipeline))
        review_count = aggs[0]["count"] if aggs else 0
        avg_rating = round(aggs[0]["avgRating"], 2) if aggs else None

        return ok({
            "productId": product_id,
            "soldPaid": int(sold),
            "reviews": {"count": int(review_count), "avgRating": avg_rating},
            "mongoReadFrom": "secondaryPreferred" if rp is ReadPreference.SECONDARY_PREFERRED else "primary"
        })
    except (ConnectionFailure, ServerSelectionTimeoutError) as e:
        logger.error("[/products/%s/summary] MongoDB unavailable: %s", product_id, e)
        return bad("MongoDB temporarily unavailable", 503)
    except Exception as e:
        logger.exception("[/products/%s/summary] Failed", product_id)
        return bad(str(e), 500)


# -----------------------
# POST /admin/stepdown
# -----------------------
@app.post("/admin/stepdown")
def admin_stepdown():
    body = request.get_json(force=True) or {}
    logger.debug(f"[POST /admin/stepdown] Body: {body}")
    try:
        seconds = int(body.get("seconds", 10))
        mongo_client.admin.command({"replSetStepDown": seconds})
        logger.warning(f"[/admin/stepdown] Triggered stepDown for {seconds}s")
        return ok({"steppingDown": seconds})
    except Exception as e:
        logger.exception("[/admin/stepdown] Stepdown failed")
        return bad(str(e), 500)


# ---- Run ----
if __name__ == "__main__":
    port = int(os.getenv("PORT", "1236"))
    logger.info(f"Server starting on port {port}")
    app.run(host="0.0.0.0", port=port)

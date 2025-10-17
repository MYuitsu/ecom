import os
from datetime import datetime
from flask import Flask, request, jsonify
from dotenv import load_dotenv
import pymysql
from pymysql.cursors import DictCursor
from pymongo import MongoClient, ReadPreference, WriteConcern

load_dotenv()
app = Flask(__name__)

# ---- MySQL connection ----
def mysql_conn():
    return pymysql.connect(
        host=os.getenv("MYSQL_HOST", "127.0.0.1"),
        port=int(os.getenv("MYSQL_PORT", "3307")),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", "secret"),
        database=os.getenv("MYSQL_DB", "shop"),
        autocommit=False,
        cursorclass=DictCursor,
    )

# ---- MongoDB (replica set) ----
mongo_client = MongoClient(os.getenv("MONGODB_URI"))
mdb = mongo_client[os.getenv("MONGODB_DB", "shop")]
reviews = mdb.get_collection("reviews").with_options(write_concern=WriteConcern(w="majority"))

def ok(data): return jsonify({"ok": True, "data": data})
def bad(msg, code=400): return jsonify({"ok": False, "error": msg}), code

@app.get("/health")
def health():
    try:
        # MySQL ping
        with mysql_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 AS db_ok")
                mysql_ok = cur.fetchone()
        # Mongo topo
        topo = mongo_client.admin.command("hello")  # mongod >= 4.4
        mongo_info = {
            "isWritablePrimary": topo.get("isWritablePrimary"),
            "primary": topo.get("primary"),
            "me": topo.get("me"),
            "hosts": topo.get("hosts"),
        }
        return ok({"mysql": mysql_ok, "mongo": mongo_info})
    except Exception as e:
        return bad(str(e), 500)

@app.post("/orders")
def create_order():
    body = request.get_json(force=True) or {}
    user_id = body.get("userId")
    items = body.get("items") or []
    if not user_id or not isinstance(items, list) or len(items) == 0:
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
                        conn.rollback(); return bad("Each item requires productId, quantity, price")
                    total += float(qty) * float(price)
                    cur.execute(
                        "INSERT INTO order_items(order_id,product_id,quantity,price) VALUES (%s,%s,%s,%s)",
                        (order_id, pid, qty, price),
                    )
                cur.execute("UPDATE orders SET total_amount=%s WHERE id=%s", (total, order_id))
                conn.commit()
                return ok({"orderId": order_id, "total": total})
    except Exception as e:
        return bad(str(e), 500)

@app.post("/orders/<int:order_id>/pay")
def pay_order(order_id: int):
    body = request.get_json(force=True) or {}
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
                    conn.rollback(); return bad("Order not found", 404)
                cur.execute(
                    "INSERT INTO payments(order_id,provider,amount,status,paid_at) VALUES (%s,%s,%s,%s,NOW())",
                    (order_id, provider, amount, "SUCCESS"),
                )
                cur.execute("UPDATE orders SET status=%s WHERE id=%s", ("PAID", order_id))
                conn.commit()
                return ok({"orderId": order_id, "state": "PAID"})
    except Exception as e:
        return bad(str(e), 500)

@app.post("/reviews")
def create_review():
    body = request.get_json(force=True) or {}
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
                        return bad("review allowed only for PAID orders")
        except Exception as e:
            return bad(str(e), 500)
    try:
        doc = {
            "productId": int(product_id),
            "rating": float(rating),
            "comment": str(comment),
            "orderId": int(order_id) if order_id else None,
            "createdAt": datetime.utcnow(),
        }
        r = reviews.insert_one(doc)  # writeConcern=majority (set ở collection)
        return ok({"insertedId": str(r.inserted_id)})
    except Exception as e:
        return bad(str(e), 500)

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
    except Exception as e:
        return bad(str(e), 500)

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)

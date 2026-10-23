# Databricks notebook source
# MAGIC %md
# MAGIC # 04 · Qualidade de dados
# MAGIC
# MAGIC Cada verificação é uma query que retorna o **número de violações** (0 = passou).
# MAGIC - `error`: interrompe o job, então o Power BI nunca recebe dados quebrados.
# MAGIC - `warn`: só registra. São anomalias conhecidas do dataset de origem.
# MAGIC
# MAGIC O histórico de execuções fica em `olist_gold.dq_results`.

# COMMAND ----------

from datetime import datetime, timezone

dbutils.widgets.text("catalog", "workspace")
catalog = dbutils.widgets.get("catalog")

silver = f"{catalog}.olist_silver"
gold = f"{catalog}.olist_gold"


def unique(table: str, *keys: str) -> str:
    cols = ", ".join(keys)
    return f"SELECT COUNT(*) FROM (SELECT {cols} FROM {gold}.{table} GROUP BY {cols} HAVING COUNT(*) > 1)"


def not_null(table: str, col: str) -> str:
    return f"SELECT COUNT(*) FROM {gold}.{table} WHERE {col} IS NULL"


def references(fact: str, dim: str, fk: str, pk: str | None = None) -> str:
    return (
        f"SELECT COUNT(*) FROM {gold}.{fact} f LEFT ANTI JOIN {gold}.{dim} d "
        f"ON f.{fk} = d.{pk or fk} WHERE f.{fk} IS NOT NULL"
    )


CHECKS = [
    # chaves primárias
    ("dim_customer.customer_id único", "error", unique("dim_customer", "customer_id")),
    ("dim_seller.seller_id único", "error", unique("dim_seller", "seller_id")),
    ("dim_product.product_id único", "error", unique("dim_product", "product_id")),
    ("dim_date.date_key único", "error", unique("dim_date", "date_key")),
    ("fact_orders.order_id único", "error", unique("fact_orders", "order_id")),
    ("fact_order_items (order_id, order_item_id) único", "error", unique("fact_order_items", "order_id", "order_item_id")),
    ("customer_rfm.customer_unique_id único", "error", unique("customer_rfm", "customer_unique_id")),
    # obrigatoriedade
    ("fact_orders.purchase_date_key não nulo", "error", not_null("fact_orders", "purchase_date_key")),
    ("fact_orders.customer_id não nulo", "error", not_null("fact_orders", "customer_id")),
    # integridade referencial
    ("fact_orders -> dim_customer", "error", references("fact_orders", "dim_customer", "customer_id")),
    ("fact_orders -> dim_date", "error", references("fact_orders", "dim_date", "purchase_date_key", "date_key")),
    ("fact_order_items -> dim_product", "error", references("fact_order_items", "dim_product", "product_id")),
    ("fact_order_items -> dim_seller", "error", references("fact_order_items", "dim_seller", "seller_id")),
    ("fact_order_items -> dim_date", "error", references("fact_order_items", "dim_date", "purchase_date_key", "date_key")),
    # regras de negócio
    ("preço do item > 0", "error", f"SELECT COUNT(*) FROM {gold}.fact_order_items WHERE price <= 0"),
    ("review_score entre 1 e 5", "error", f"SELECT COUNT(*) FROM {gold}.fact_orders WHERE review_score NOT BETWEEN 1 AND 5"),
    # reconciliação silver x gold
    (
        "nº de pedidos silver = gold",
        "error",
        f"SELECT ABS((SELECT COUNT(*) FROM {silver}.orders) - (SELECT COUNT(*) FROM {gold}.fact_orders))",
    ),
    # anomalias conhecidas da origem
    ("pedido sem pagamento", "warn", f"SELECT COUNT(*) FROM {gold}.fact_orders WHERE payment_value IS NULL"),
    ("status 'delivered' sem data de entrega", "warn",
     f"SELECT COUNT(*) FROM {gold}.fact_orders WHERE order_status = 'delivered' AND delivered_at IS NULL"),
    ("cliente sem coordenadas", "warn", f"SELECT COUNT(*) FROM {gold}.dim_customer WHERE lat IS NULL"),
]

# COMMAND ----------

run_at = datetime.now(timezone.utc)
rows = []
for name, severity, query in CHECKS:
    violations = int(spark.sql(query).first()[0])
    rows.append((run_at, name, severity, violations, violations == 0))

results = spark.createDataFrame(
    rows, "run_at TIMESTAMP, check_name STRING, severity STRING, violations BIGINT, passed BOOLEAN"
)
results.write.mode("append").saveAsTable(f"{gold}.dq_results")
display(results.orderBy("passed", "severity"))

# COMMAND ----------

failed = [r for r in rows if r[2] == "error" and not r[4]]
if failed:
    raise AssertionError("Falhas de qualidade: " + "; ".join(f"{r[1]} ({r[3]} violações)" for r in failed))
print(f"{len(rows)} verificações executadas, nenhuma falha bloqueante.")

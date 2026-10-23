# Databricks notebook source
# MAGIC %md
# MAGIC # 04 · Qualidade de dados
# MAGIC
# MAGIC Cada verificação é uma função que retorna o **número de violações** (0 = passou).
# MAGIC - `error`: interrompe o job, então o Power BI nunca recebe dados quebrados.
# MAGIC - `warn`: só registra. São anomalias conhecidas do dataset de origem.
# MAGIC
# MAGIC O histórico de execuções fica em `olist_gold.dq_results`.

# COMMAND ----------

from datetime import datetime, timezone

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

dbutils.widgets.text("catalog", "workspace")
catalog = dbutils.widgets.get("catalog")

silver = f"{catalog}.olist_silver"
gold = f"{catalog}.olist_gold"


def table(name: str) -> DataFrame:
    return spark.table(f"{gold}.{name}")


def duplicates(name: str, *keys: str) -> int:
    return table(name).groupBy(*keys).count().filter(F.col("count") > 1).count()


def nulls(name: str, col: str) -> int:
    return table(name).filter(F.col(col).isNull()).count()


def orphans(fact: str, dim: str, fk: str, pk: str | None = None) -> int:
    keys = table(dim).select(F.col(pk or fk).alias(fk))
    return table(fact).filter(F.col(fk).isNotNull()).join(keys, fk, "left_anti").count()


def violations(name: str, condition) -> int:
    return table(name).filter(condition).count()


CHECKS = [
    # chaves primárias
    ("dim_customer.customer_id único", "error", lambda: duplicates("dim_customer", "customer_id")),
    ("dim_seller.seller_id único", "error", lambda: duplicates("dim_seller", "seller_id")),
    ("dim_product.product_id único", "error", lambda: duplicates("dim_product", "product_id")),
    ("dim_date.date_key único", "error", lambda: duplicates("dim_date", "date_key")),
    ("fact_orders.order_id único", "error", lambda: duplicates("fact_orders", "order_id")),
    ("fact_order_items (order_id, order_item_id) único", "error",
     lambda: duplicates("fact_order_items", "order_id", "order_item_id")),
    ("customer_rfm.customer_unique_id único", "error", lambda: duplicates("customer_rfm", "customer_unique_id")),
    # obrigatoriedade
    ("fact_orders.purchase_date_key não nulo", "error", lambda: nulls("fact_orders", "purchase_date_key")),
    ("fact_orders.customer_id não nulo", "error", lambda: nulls("fact_orders", "customer_id")),
    # integridade referencial
    ("fact_orders -> dim_customer", "error", lambda: orphans("fact_orders", "dim_customer", "customer_id")),
    ("fact_orders -> dim_date", "error", lambda: orphans("fact_orders", "dim_date", "purchase_date_key", "date_key")),
    ("fact_order_items -> dim_product", "error", lambda: orphans("fact_order_items", "dim_product", "product_id")),
    ("fact_order_items -> dim_seller", "error", lambda: orphans("fact_order_items", "dim_seller", "seller_id")),
    ("fact_order_items -> dim_date", "error",
     lambda: orphans("fact_order_items", "dim_date", "purchase_date_key", "date_key")),
    # regras de negócio
    ("preço do item > 0", "error", lambda: violations("fact_order_items", F.col("price") <= 0)),
    ("review_score entre 1 e 5", "error",
     lambda: violations("fact_orders", ~F.col("review_score").between(1, 5))),
    # reconciliação silver x gold
    ("nº de pedidos silver = gold", "error",
     lambda: abs(spark.table(f"{silver}.orders").count() - table("fact_orders").count())),
    # anomalias conhecidas da origem
    ("pedido sem pagamento", "warn", lambda: nulls("fact_orders", "payment_value")),
    ("status 'delivered' sem data de entrega", "warn",
     lambda: violations("fact_orders", (F.col("order_status") == "delivered") & F.col("delivered_at").isNull())),
    ("cliente sem coordenadas", "warn", lambda: nulls("dim_customer", "lat")),
]

# COMMAND ----------

run_at = datetime.now(timezone.utc)
rows = []
for name, severity, check in CHECKS:
    found = int(check())
    rows.append((run_at, name, severity, found, found == 0))

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

# Databricks notebook source
# MAGIC %md
# MAGIC # 03 · Gold: modelo estrela para o Power BI
# MAGIC
# MAGIC | Tabela | Grão | Descrição |
# MAGIC |---|---|---|
# MAGIC | `fact_orders` | 1 linha por pedido | Valores, pagamento, entrega e avaliação |
# MAGIC | `fact_order_items` | 1 linha por item do pedido | Receita por produto e vendedor |
# MAGIC | `dim_customer` | `customer_id` | Cliente, cidade, UF, região e coordenadas |
# MAGIC | `dim_seller` | `seller_id` | Vendedor, cidade, UF, região e coordenadas |
# MAGIC | `dim_product` | `product_id` | Categoria (PT/EN) e dimensões |
# MAGIC | `dim_date` | dia | Calendário em português |
# MAGIC | `customer_rfm` | `customer_unique_id` | Segmentação RFM dos clientes |

# COMMAND ----------

from datetime import date, timedelta

from pyspark.sql import DataFrame, Window
from pyspark.sql import functions as F

dbutils.widgets.text("catalog", "workspace")
catalog = dbutils.widgets.get("catalog")

silver = f"{catalog}.olist_silver"
gold = f"{catalog}.olist_gold"


def save(df: DataFrame, name: str, comment: str) -> None:
    table = f"{gold}.{name}"
    df.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(table)
    spark.sql(f"COMMENT ON TABLE {table} IS '{comment}'")
    print(f"{table}: {spark.table(table).count():,} linhas")


orders = spark.table(f"{silver}.orders")
items = spark.table(f"{silver}.order_items")
payments = spark.table(f"{silver}.payments")
reviews = spark.table(f"{silver}.reviews")
geo = spark.table(f"{silver}.geolocation").select("zip_code_prefix", "lat", "lng")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dimensões

# COMMAND ----------

REGIOES = {
    "Norte": ["AC", "AM", "AP", "PA", "RO", "RR", "TO"],
    "Nordeste": ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
    "Centro-Oeste": ["DF", "GO", "MS", "MT"],
    "Sudeste": ["ES", "MG", "RJ", "SP"],
    "Sul": ["PR", "RS", "SC"],
}
regions = spark.createDataFrame(
    [(uf, region) for region, ufs in REGIOES.items() for uf in ufs], "state STRING, region STRING"
)

dim_customer = (
    spark.table(f"{silver}.customers")
    .join(regions, "state", "left")
    .join(geo, "zip_code_prefix", "left")
    .select("customer_id", "customer_unique_id", "zip_code_prefix", "city", "state", "region", "lat", "lng")
)
save(dim_customer, "dim_customer", "Dimensão de clientes (grão: customer_id)")

dim_seller = (
    spark.table(f"{silver}.sellers")
    .join(regions, "state", "left")
    .join(geo, "zip_code_prefix", "left")
    .select("seller_id", "zip_code_prefix", "city", "state", "region", "lat", "lng")
)
save(dim_seller, "dim_seller", "Dimensão de vendedores (grão: seller_id)")

dim_product = spark.table(f"{silver}.products").withColumn(
    "volume_cm3", F.col("length_cm") * F.col("height_cm") * F.col("width_cm")
)
save(dim_product, "dim_product", "Dimensão de produtos (grão: product_id)")

# COMMAND ----------

# calendário cobrindo anos completos do período de vendas
bounds = orders.agg(F.min("purchased_at").alias("mn"), F.max("purchased_at").alias("mx")).first()
start, end = date(bounds.mn.year, 1, 1), date(bounds.mx.year, 12, 31)

MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
         "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]


def lookup(names: list[str], index):
    return F.element_at(F.array(*[F.lit(n) for n in names]), index)


d = F.col("date")
dim_date = (
    spark.range(1)
    .select(F.explode(F.sequence(F.lit(start), F.lit(end))).alias("date"))
    .select(
        F.date_format(d, "yyyyMMdd").cast("int").alias("date_key"),
        d,
        F.year(d).alias("year"),
        F.quarter(d).alias("quarter"),
        F.month(d).alias("month"),
        lookup(MESES, F.month(d)).alias("month_name"),
        F.concat(F.substring(lookup(MESES, F.month(d)), 1, 3), F.lit("/"), F.date_format(d, "yy")).alias("month_year"),
        F.date_format(d, "yyyyMM").cast("int").alias("year_month"),
        F.dayofweek(d).alias("weekday"),
        lookup(DIAS, F.dayofweek(d)).alias("weekday_name"),
        F.dayofweek(d).isin(1, 7).alias("is_weekend"),
    )
)
save(dim_date, "dim_date", "Calendário (grão: dia)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fatos

# COMMAND ----------

items_agg = items.groupBy("order_id").agg(
    F.count("*").alias("item_count"),
    F.countDistinct("seller_id").alias("seller_count"),
    F.sum("price").alias("items_value"),
    F.sum("freight_value").alias("freight_value"),
)
payments_agg = payments.groupBy("order_id").agg(
    F.sum("payment_value").alias("payment_value"),
    F.max("installments").alias("installments"),
    F.max_by("payment_type", "payment_value").alias("main_payment_type"),
)
# se houver mais de uma avaliação, vale a última respondida
reviews_agg = reviews.groupBy("order_id").agg(F.max_by("review_score", "answered_at").alias("review_score"))

fact_orders = (
    orders.join(items_agg, "order_id", "left")
    .join(payments_agg, "order_id", "left")
    .join(reviews_agg, "order_id", "left")
    .withColumn("purchase_date_key", F.date_format("purchased_at", "yyyyMMdd").cast("int"))
    .withColumn("is_delivered", (F.col("order_status") == "delivered") & F.col("delivered_at").isNotNull())
    .withColumn("delivery_days", F.when(F.col("is_delivered"), F.datediff("delivered_at", "purchased_at")))
    .withColumn("estimated_days", F.datediff("estimated_delivery_at", "purchased_at"))
    .withColumn("delay_days", F.when(F.col("is_delivered"), F.datediff("delivered_at", "estimated_delivery_at")))
    .withColumn("is_late", F.when(F.col("is_delivered"), F.col("delay_days") > 0))
    .select(
        "order_id", "customer_id", "purchase_date_key", "order_status",
        "purchased_at", "approved_at", "shipped_at", "delivered_at", "estimated_delivery_at",
        "item_count", "seller_count", "items_value", "freight_value",
        "payment_value", "installments", "main_payment_type", "review_score",
        "is_delivered", "delivery_days", "estimated_days", "delay_days", "is_late",
    )
)
save(fact_orders, "fact_orders", "Fato de pedidos (grão: order_id)")

# COMMAND ----------

fact_order_items = (
    items.join(orders.select("order_id", "customer_id", "order_status", "purchased_at"), "order_id")
    .withColumn("purchase_date_key", F.date_format("purchased_at", "yyyyMMdd").cast("int"))
    .withColumn("total_value", F.col("price") + F.col("freight_value"))
    .select(
        "order_id", "order_item_id", "product_id", "seller_id", "customer_id",
        "purchase_date_key", "order_status", "price", "freight_value", "total_value",
    )
)
save(fact_order_items, "fact_order_items", "Fato de itens de pedido (grão: order_id + order_item_id)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Segmentação RFM
# MAGIC - **R**ecência: dias desde a última compra (quintis, 5 = mais recente)
# MAGIC - **F**requência: ~97% dos clientes do Olist compram uma única vez, então quintis não fazem sentido; uso faixas fixas (1 / 2 / 3+ pedidos)
# MAGIC - **M**onetário: valor total pago (quintis)

# COMMAND ----------

ref_date = orders.agg(F.max("purchased_at")).first()[0].date() + timedelta(days=1)

rfm_base = (
    spark.table(f"{gold}.fact_orders")
    .filter("is_delivered")
    .join(spark.table(f"{gold}.dim_customer").select("customer_id", "customer_unique_id"), "customer_id")
    .groupBy("customer_unique_id")
    .agg(
        F.datediff(F.lit(ref_date), F.max("purchased_at")).alias("recency_days"),
        F.countDistinct("order_id").alias("frequency"),
        F.coalesce(F.sum("payment_value"), F.lit(0)).alias("monetary"),
    )
)

r, f, m = F.col("r_score"), F.col("f_score"), F.col("m_score")
segment = (
    F.when((r >= 4) & (f >= 3), "Campeões")
    .when(f >= 3, "Leais")
    .when((r >= 4) & (m >= 4), "Novos de alto valor")
    .when(r >= 4, "Recentes")
    .when((r <= 2) & (m >= 4), "Em risco (alto valor)")
    .when(r <= 2, "Hibernando")
    .otherwise("Precisam de atenção")
)

customer_rfm = (
    rfm_base.withColumn("r_score", F.ntile(5).over(Window.orderBy(F.col("recency_days").desc())))
    .withColumn("f_score", F.when(F.col("frequency") >= 3, 5).when(F.col("frequency") == 2, 3).otherwise(1))
    .withColumn("m_score", F.ntile(5).over(Window.orderBy("monetary")))
    .withColumn("segment", segment)
)
save(customer_rfm, "customer_rfm", "Segmentação RFM (grão: customer_unique_id)")

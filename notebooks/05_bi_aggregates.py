# Databricks notebook source
# MAGIC %md
# MAGIC # 05 · Agregados para BI
# MAGIC Tabelas agregadas para análises rápidas e para visuais específicos no Power BI.
# MAGIC O modelo principal do Power BI usa as tabelas fato/dimensão diretamente.

# COMMAND ----------

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

dbutils.widgets.text("catalog", "workspace")
catalog = dbutils.widgets.get("catalog")
gold = f"{catalog}.olist_gold"


def save(df: DataFrame, name: str, comment: str) -> None:
    table = f"{gold}.{name}"
    df.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(table)
    spark.sql(f"COMMENT ON TABLE {table} IS '{comment}'")
    print(f"{table}: {spark.table(table).count():,} linhas")


orders = spark.table(f"{gold}.fact_orders")
delivered = F.col("is_delivered")
late_pct = F.round(F.avg(F.when(delivered, F.col("is_late").cast("int"))) * 100, 1)

# COMMAND ----------

kpis_mensais = (
    orders.filter(~F.col("order_status").isin("canceled", "unavailable"))
    .join(spark.table(f"{gold}.dim_customer").select("customer_id", "customer_unique_id"), "customer_id")
    .groupBy(F.trunc("purchased_at", "month").alias("mes"))
    .agg(
        F.count("*").alias("pedidos"),
        F.countDistinct("customer_unique_id").alias("clientes_unicos"),
        F.round(F.sum("payment_value"), 2).alias("receita"),
        F.round(F.avg("review_score"), 2).alias("nota_media"),
        F.round(F.avg(F.when(delivered, F.col("delivery_days"))), 1).alias("prazo_medio_dias"),
        late_pct.alias("pct_atraso"),
    )
    .withColumn("ticket_medio", F.round(F.col("receita") / F.col("pedidos"), 2))
)
save(kpis_mensais, "agg_kpis_mensais", "KPIs mensais de vendas, entrega e satisfação")

# COMMAND ----------

# principal insight do dataset: o atraso derruba a nota da avaliação
delay = F.col("delay_days")
faixa_entrega = (
    F.when(delay <= -10, "1. 10+ dias adiantado")
    .when(delay <= 0, "2. No prazo")
    .when(delay <= 5, "3. 1 a 5 dias de atraso")
    .when(delay <= 15, "4. 6 a 15 dias de atraso")
    .otherwise("5. 15+ dias de atraso")
)

atraso_vs_avaliacao = (
    orders.filter(delivered & F.col("review_score").isNotNull())
    .groupBy(faixa_entrega.alias("faixa_entrega"))
    .agg(
        F.count("*").alias("pedidos"),
        F.round(F.avg("review_score"), 2).alias("nota_media"),
        F.round(F.avg((F.col("review_score") <= 2).cast("int")) * 100, 1).alias("pct_avaliacao_negativa"),
    )
)
save(atraso_vs_avaliacao, "agg_atraso_vs_avaliacao", "Nota média por faixa de atraso na entrega")

# COMMAND ----------

desempenho_vendedores = (
    spark.table(f"{gold}.fact_order_items")
    .join(orders.select("order_id", "review_score", "is_delivered", "is_late"), "order_id")
    .join(spark.table(f"{gold}.dim_seller"), "seller_id")
    .groupBy("seller_id", "city", "state", "region")
    .agg(
        F.countDistinct("order_id").alias("pedidos"),
        F.round(F.sum("price"), 2).alias("receita_produtos"),
        F.round(F.avg("review_score"), 2).alias("nota_media"),
        late_pct.alias("pct_atraso"),
    )
)
save(desempenho_vendedores, "agg_desempenho_vendedores", "Receita, satisfação e pontualidade por vendedor")

# COMMAND ----------

display(spark.table(f"{gold}.agg_atraso_vs_avaliacao").orderBy("faixa_entrega"))

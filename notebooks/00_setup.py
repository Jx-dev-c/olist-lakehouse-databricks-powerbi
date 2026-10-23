# Databricks notebook source
# MAGIC %md
# MAGIC # 00 · Setup
# MAGIC Cria os schemas da arquitetura medalhão e os volumes usados pela ingestão.
# MAGIC
# MAGIC | Objeto | Uso |
# MAGIC |---|---|
# MAGIC | `olist_bronze` | Dados brutos, como chegaram (tudo string + metadados) |
# MAGIC | `olist_silver` | Dados tipados, limpos e deduplicados |
# MAGIC | `olist_gold` | Modelo estrela pronto para o Power BI |
# MAGIC | `olist_bronze.landing` (volume) | Onde os CSVs do Kaggle são enviados |
# MAGIC | `olist_bronze.checkpoints` (volume) | Checkpoints e schemas do Auto Loader |

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace")
catalog = dbutils.widgets.get("catalog")

# COMMAND ----------

for schema in ["olist_bronze", "olist_silver", "olist_gold"]:
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")

spark.sql(f"CREATE VOLUME IF NOT EXISTS {catalog}.olist_bronze.landing")
spark.sql(f"CREATE VOLUME IF NOT EXISTS {catalog}.olist_bronze.checkpoints")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Verifica se os arquivos do Kaggle já foram enviados

# COMMAND ----------

EXPECTED_FILES = [
    "olist_customers_dataset.csv",
    "olist_geolocation_dataset.csv",
    "olist_order_items_dataset.csv",
    "olist_order_payments_dataset.csv",
    "olist_order_reviews_dataset.csv",
    "olist_orders_dataset.csv",
    "olist_products_dataset.csv",
    "olist_sellers_dataset.csv",
    "product_category_name_translation.csv",
]

landing = f"/Volumes/{catalog}/olist_bronze/landing"
found = {f.name for f in dbutils.fs.ls(landing)}
missing = [f for f in EXPECTED_FILES if f not in found]

if missing:
    raise FileNotFoundError(
        f"Arquivos ausentes em {landing}: {missing}. "
        "Baixe o dataset em https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce e envie os CSVs para o volume."
    )
print(f"OK: {len(EXPECTED_FILES)} arquivos encontrados em {landing}")

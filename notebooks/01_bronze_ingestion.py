# Databricks notebook source
# MAGIC %md
# MAGIC # 01 · Bronze: ingestão incremental com Auto Loader
# MAGIC
# MAGIC - Lê os CSVs do volume `landing` com **Auto Loader** (`cloudFiles`), processando só arquivos novos.
# MAGIC - Mantém tudo como `string`: a tipagem fica na Silver, assim nenhum registro é perdido na entrada.
# MAGIC - Adiciona metadados de linhagem (`_source_file`, `_ingested_at`).
# MAGIC - `trigger(availableNow=True)` executa como batch incremental (compatível com serverless / Free Edition).

# COMMAND ----------

from pyspark.sql import functions as F

dbutils.widgets.text("catalog", "workspace")
catalog = dbutils.widgets.get("catalog")

landing = f"/Volumes/{catalog}/olist_bronze/landing"
checkpoints = f"/Volumes/{catalog}/olist_bronze/checkpoints"

# tabela bronze -> padrão do nome do arquivo
ENTITIES = {
    "customers": "olist_customers_dataset*.csv",
    "geolocation": "olist_geolocation_dataset*.csv",
    "order_items": "olist_order_items_dataset*.csv",
    "order_payments": "olist_order_payments_dataset*.csv",
    "order_reviews": "olist_order_reviews_dataset*.csv",
    "orders": "olist_orders_dataset*.csv",
    "products": "olist_products_dataset*.csv",
    "sellers": "olist_sellers_dataset*.csv",
    "category_translation": "product_category_name_translation*.csv",
}

# COMMAND ----------

def ingest(entity: str, pattern: str) -> None:
    stream = (
        spark.readStream.format("cloudFiles")
        .option("cloudFiles.format", "csv")
        .option("cloudFiles.schemaLocation", f"{checkpoints}/{entity}/schema")
        .option("cloudFiles.inferColumnTypes", "false")
        .option("header", "true")
        .option("multiLine", "true")  # comentários das avaliações têm quebras de linha
        .option("escape", '"')
        .option("pathGlobFilter", pattern)
        .load(landing)
    )
    # alguns CSVs do Olist vêm com BOM no cabeçalho
    stream = stream.toDF(*[c.replace("﻿", "").strip() for c in stream.columns])

    query = (
        stream.withColumn("_source_file", F.col("_metadata.file_path"))
        .withColumn("_ingested_at", F.current_timestamp())
        .writeStream.option("checkpointLocation", f"{checkpoints}/{entity}/stream")
        .option("mergeSchema", "true")
        .trigger(availableNow=True)
        .toTable(f"{catalog}.olist_bronze.{entity}")
    )
    query.awaitTermination()


for entity, pattern in ENTITIES.items():
    ingest(entity, pattern)
    total = spark.table(f"{catalog}.olist_bronze.{entity}").count()
    print(f"bronze.{entity}: {total:,} linhas")

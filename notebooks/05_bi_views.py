# Databricks notebook source
# MAGIC %md
# MAGIC # 05 · Views analíticas
# MAGIC Views agregadas para análises rápidas no SQL Editor e para visuais específicos no Power BI.
# MAGIC O modelo principal do Power BI usa as tabelas fato/dimensão diretamente.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace")
catalog = dbutils.widgets.get("catalog")
gold = f"{catalog}.olist_gold"

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE VIEW {gold}.vw_kpis_mensais
COMMENT 'KPIs mensais de vendas, entrega e satisfação'
AS
SELECT
  CAST(date_trunc('MONTH', o.purchased_at) AS DATE)                              AS mes,
  COUNT(*)                                                                       AS pedidos,
  COUNT(DISTINCT c.customer_unique_id)                                           AS clientes_unicos,
  ROUND(SUM(o.payment_value), 2)                                                 AS receita,
  ROUND(SUM(o.payment_value) / COUNT(*), 2)                                      AS ticket_medio,
  ROUND(AVG(o.review_score), 2)                                                  AS nota_media,
  ROUND(AVG(CASE WHEN o.is_delivered THEN o.delivery_days END), 1)               AS prazo_medio_dias,
  ROUND(AVG(CASE WHEN o.is_delivered THEN CAST(o.is_late AS INT) END) * 100, 1)  AS pct_atraso
FROM {gold}.fact_orders o
JOIN {gold}.dim_customer c USING (customer_id)
WHERE o.order_status NOT IN ('canceled', 'unavailable')
GROUP BY 1
""")

# COMMAND ----------

# principal insight do dataset: o atraso derruba a nota da avaliação
spark.sql(f"""
CREATE OR REPLACE VIEW {gold}.vw_atraso_vs_avaliacao
COMMENT 'Nota média por faixa de atraso na entrega'
AS
SELECT
  CASE
    WHEN delay_days <= -10 THEN '1. 10+ dias adiantado'
    WHEN delay_days <= 0   THEN '2. No prazo'
    WHEN delay_days <= 5   THEN '3. 1 a 5 dias de atraso'
    WHEN delay_days <= 15  THEN '4. 6 a 15 dias de atraso'
    ELSE                        '5. 15+ dias de atraso'
  END                                                                      AS faixa_entrega,
  COUNT(*)                                                                 AS pedidos,
  ROUND(AVG(review_score), 2)                                              AS nota_media,
  ROUND(AVG(CASE WHEN review_score <= 2 THEN 1.0 ELSE 0 END) * 100, 1)     AS pct_avaliacao_negativa
FROM {gold}.fact_orders
WHERE is_delivered AND review_score IS NOT NULL
GROUP BY 1
""")

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE VIEW {gold}.vw_desempenho_vendedores
COMMENT 'Receita, satisfação e pontualidade por vendedor'
AS
SELECT
  s.seller_id, s.city, s.state, s.region,
  COUNT(DISTINCT i.order_id)                                                     AS pedidos,
  ROUND(SUM(i.price), 2)                                                         AS receita_produtos,
  ROUND(AVG(o.review_score), 2)                                                  AS nota_media,
  ROUND(AVG(CASE WHEN o.is_delivered THEN CAST(o.is_late AS INT) END) * 100, 1)  AS pct_atraso
FROM {gold}.fact_order_items i
JOIN {gold}.fact_orders o USING (order_id)
JOIN {gold}.dim_seller s USING (seller_id)
GROUP BY ALL
""")

# COMMAND ----------

display(spark.table(f"{gold}.vw_atraso_vs_avaliacao").orderBy("faixa_entrega"))

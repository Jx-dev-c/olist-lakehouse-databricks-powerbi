-- Dados da Olist City. Mesmas definições do painel Power BI:
-- pedido válido = status diferente de canceled/unavailable; receita = itens + frete (total_value) dos pedidos válidos.
-- Gerar: scripts/exportar_dados.ps1  (grava dados/olist_city.json)

-- @kpis
WITH v AS (SELECT * FROM workspace.olist_gold.fact_orders WHERE order_status NOT IN ('canceled', 'unavailable')),
     i AS (SELECT i.* FROM workspace.olist_gold.fact_order_items i JOIN v USING (order_id))
SELECT
  (SELECT ROUND(SUM(total_value), 2) FROM i) receita,
  (SELECT COUNT(DISTINCT order_id) FROM i) pedidos,
  (SELECT COUNT(DISTINCT c.customer_unique_id) FROM i JOIN workspace.olist_gold.dim_customer c USING (customer_id)) clientes,
  (SELECT COUNT(DISTINCT seller_id) FROM i) vendedores,
  (SELECT ROUND(AVG(review_score), 3) FROM workspace.olist_gold.fact_orders o WHERE o.order_id IN (SELECT order_id FROM i)) nota,
  (SELECT ROUND(AVG(CASE WHEN is_late THEN 1.0 ELSE 0 END), 4) FROM v WHERE is_delivered) pct_atraso,
  (SELECT ROUND(AVG(delivery_days), 1) FROM v WHERE is_delivered) prazo_medio,
  (SELECT ROUND(AVG(freight_value), 2) FROM v) frete_medio

-- @mensal
WITH v AS (SELECT * FROM workspace.olist_gold.fact_orders WHERE order_status NOT IN ('canceled', 'unavailable')
             AND purchased_at >= '2017-01-01' AND purchased_at < '2018-09-01'),
     r AS (SELECT o.order_id, SUM(i.total_value) receita FROM v o JOIN workspace.olist_gold.fact_order_items i USING (order_id) GROUP BY 1)
SELECT date_format(v.purchased_at, 'yyyy-MM') mes,
       ROUND(SUM(r.receita), 0) receita,
       COUNT(*) pedidos,
       ROUND(AVG(CASE WHEN v.is_delivered THEN CASE WHEN v.is_late THEN 1.0 ELSE 0 END END), 4) pct_atraso,
       ROUND(AVG(CASE WHEN v.is_delivered THEN v.delivery_days END), 1) prazo,
       ROUND(AVG(v.review_score), 3) nota
FROM v JOIN r USING (order_id) GROUP BY 1 ORDER BY 1

-- @calor_compras
SELECT dayofweek(purchased_at) dia, hour(purchased_at) hora, COUNT(*) pedidos
FROM workspace.olist_gold.fact_orders WHERE order_status NOT IN ('canceled', 'unavailable')
GROUP BY 1, 2 ORDER BY 1, 2

-- @categorias
WITH v AS (SELECT order_id FROM workspace.olist_gold.fact_orders WHERE order_status NOT IN ('canceled', 'unavailable'))
SELECT p.category_pt categoria, ROUND(SUM(i.total_value), 0) receita, COUNT(DISTINCT i.order_id) pedidos
FROM workspace.olist_gold.fact_order_items i JOIN v USING (order_id) JOIN workspace.olist_gold.dim_product p USING (product_id)
GROUP BY 1 ORDER BY 2 DESC LIMIT 8

-- @estados
WITH v AS (SELECT * FROM workspace.olist_gold.fact_orders WHERE order_status NOT IN ('canceled', 'unavailable'))
SELECT c.state uf, c.region regiao, COUNT(*) pedidos, ROUND(SUM(v.payment_value), 0) pagamentos,
       ROUND(AVG(CASE WHEN v.is_delivered THEN CASE WHEN v.is_late THEN 1.0 ELSE 0 END END), 4) pct_atraso,
       ROUND(AVG(CASE WHEN v.is_delivered THEN v.delivery_days END), 1) prazo,
       ROUND(AVG(v.review_score), 3) nota
FROM v JOIN workspace.olist_gold.dim_customer c USING (customer_id)
GROUP BY 1, 2 ORDER BY 3 DESC

-- @entrega_nota
SELECT faixa_entrega, pedidos, ROUND(nota_media, 3) nota, ROUND(pct_avaliacao_negativa, 4) pct_negativa
FROM workspace.olist_gold.agg_atraso_vs_avaliacao ORDER BY faixa_entrega

-- @notas
SELECT review_score nota, COUNT(*) pedidos FROM workspace.olist_gold.fact_orders
WHERE review_score IS NOT NULL AND order_status NOT IN ('canceled', 'unavailable') GROUP BY 1 ORDER BY 1

-- @pagamentos
SELECT main_payment_type tipo, COUNT(*) pedidos, ROUND(AVG(payment_value), 2) ticket, ROUND(AVG(installments), 2) parcelas
FROM workspace.olist_gold.fact_orders WHERE order_status NOT IN ('canceled', 'unavailable') AND main_payment_type IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC

-- @parcelas
SELECT CASE WHEN installments <= 1 THEN '1x' WHEN installments <= 3 THEN '2–3x' WHEN installments <= 6 THEN '4–6x'
            WHEN installments <= 10 THEN '7–10x' ELSE '11x+' END faixa, COUNT(*) pedidos
FROM workspace.olist_gold.fact_orders WHERE order_status NOT IN ('canceled', 'unavailable') AND main_payment_type = 'credit_card'
GROUP BY 1 ORDER BY MIN(installments)

-- @vendedores_pareto
WITH v AS (SELECT order_id FROM workspace.olist_gold.fact_orders WHERE order_status NOT IN ('canceled', 'unavailable')),
     s AS (SELECT seller_id, SUM(total_value) receita FROM workspace.olist_gold.fact_order_items JOIN v USING (order_id) GROUP BY 1),
     r AS (SELECT receita, ROW_NUMBER() OVER (ORDER BY receita DESC) n, COUNT(*) OVER () total, SUM(receita) OVER () soma FROM s)
SELECT MAX(total) vendedores,
       ROUND(SUM(CASE WHEN n <= total * 0.1 THEN receita END) / MAX(soma), 4) share_top10pct,
       ROUND(SUM(CASE WHEN n <= total * 0.2 THEN receita END) / MAX(soma), 4) share_top20pct,
       ROUND(SUM(CASE WHEN n <= 100 THEN receita END) / MAX(soma), 4) share_top100
FROM r

-- @vendedores_estado
WITH v AS (SELECT order_id FROM workspace.olist_gold.fact_orders WHERE order_status NOT IN ('canceled', 'unavailable'))
SELECT s.state uf, COUNT(DISTINCT i.seller_id) vendedores, ROUND(SUM(i.total_value), 0) receita
FROM workspace.olist_gold.fact_order_items i JOIN v USING (order_id) JOIN workspace.olist_gold.dim_seller s USING (seller_id)
GROUP BY 1 ORDER BY 3 DESC LIMIT 8

-- @recompra
WITH v AS (SELECT o.order_id, c.customer_unique_id FROM workspace.olist_gold.fact_orders o
           JOIN workspace.olist_gold.dim_customer c USING (customer_id) WHERE o.order_status NOT IN ('canceled', 'unavailable')),
     k AS (SELECT customer_unique_id, COUNT(DISTINCT order_id) n FROM v GROUP BY 1)
SELECT COUNT(*) clientes, SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END) recompram, ROUND(AVG(CASE WHEN n > 1 THEN 1.0 ELSE 0 END), 4) taxa
FROM k

-- @rfm
SELECT segment segmento, COUNT(*) clientes, ROUND(AVG(monetary), 2) valor_medio FROM workspace.olist_gold.customer_rfm GROUP BY 1 ORDER BY 2 DESC

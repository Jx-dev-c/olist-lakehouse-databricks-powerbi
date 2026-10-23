# Power BI: conexão, modelo e páginas

## 1. Conectar ao Databricks

1. No Databricks: **SQL Warehouses** > seu warehouse > **Connection details**. Copie *Server hostname* e *HTTP path*.
2. Crie um token: **Settings > Developer > Access tokens > Generate new token**.
3. No Power BI Desktop: **Obter dados > Azure Databricks** (funciona também para workspaces AWS/Free Edition).
   - Server hostname / HTTP path: os valores copiados
   - Modo: **Importar** (o dataset tem ~100 mil pedidos, então o import é rápido e permite DAX completo)
   - Autenticação: **Personal Access Token**
4. Navegue até `workspace > olist_gold` e selecione:
   `fact_orders`, `fact_order_items`, `dim_customer`, `dim_seller`, `dim_product`, `dim_date`, `customer_rfm`, `agg_atraso_vs_avaliacao`.

## 2. Modelo de dados

```
                 dim_date (date_key)
                  1 │        │ 1
                    *        *
dim_customer 1──* fact_orders    fact_order_items *──1 dim_product
  │  1──────────────────────────────*   │ *
  │ *                                   └──1 dim_seller
  1
customer_rfm (customer_unique_id)
```

| De (muitos) | Para (um) | Coluna |
|---|---|---|
| `fact_orders` | `dim_date` | `purchase_date_key` → `date_key` |
| `fact_orders` | `dim_customer` | `customer_id` |
| `fact_order_items` | `dim_date` | `purchase_date_key` → `date_key` |
| `fact_order_items` | `dim_customer` | `customer_id` |
| `fact_order_items` | `dim_product` | `product_id` |
| `fact_order_items` | `dim_seller` | `seller_id` |
| `dim_customer` | `customer_rfm` | `customer_unique_id` |

> **Não** relacione `fact_order_items` com `fact_orders`. Isso cria caminhos ambíguos até `dim_date`. As duas fatos já compartilham as dimensões.

Ajustes:
- `dim_date`: **Marcar como tabela de datas** (coluna `date`); ordenar `month_name` por `month` e `month_year` por `year_month`.
- `dim_customer[state]` e `dim_seller[state]`: categoria de dados **Estado ou província**; `lat`/`lng` como **Latitude/Longitude**.
- Oculte as colunas de chave (`*_key`, `*_id`) da exibição de relatório.
- Cole as medidas de [`medidas.dax`](medidas.dax) numa tabela `_Medidas`.

## 3. Páginas sugeridas

| Página | Pergunta de negócio | Visuais |
|---|---|---|
| **Visão Executiva** | Como as vendas evoluíram? | Cartões (Receita, Pedidos, Ticket Médio, Nota Média), linha de Receita por `month_year` com MoM %, receita por região (mapa) |
| **Logística** | Onde e quanto atrasamos? | Mapa de % atraso por UF, prazo real × prometido por mês, barras de `agg_atraso_vs_avaliacao` |
| **Produtos & Vendedores** | O que vende e quem vende bem? | Top 10 categorias (Receita Produtos), dispersão de vendedores (receita × nota, tamanho = pedidos) |
| **Clientes** | Quem são nossos clientes? | Treemap por `segment` do RFM, % Clientes Recorrentes, receita por segmento |

Filtro recomendado: **jan/2017 a ago/2018**. Os meses de 2016 e de set–out/2018 têm pouquíssimos pedidos e distorcem as tendências.

Ao terminar, salve `olist_dashboard.pbix` nesta pasta e capturas de tela em `docs/img/` para o README principal.

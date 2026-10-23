# Power BI: Olist | E-commerce Analytics

O relatório está versionado como **projeto do Power BI** (`olist_dashboard.pbip`):

| Pasta | Conteúdo |
|---|---|
| `olist_dashboard.SemanticModel/definition` | Modelo em TMDL: tabelas, relacionamentos e medidas (`tables/_Medidas.tmdl`) |
| `olist_dashboard.Report/definition` | Páginas e visuais em JSON (PBIR) |
| `olist_dashboard.Report/StaticResources/RegisteredResources` | Tema `OlistLight.json` e imagens de fundo |

Para abrir: abra o `.pbip` no Power BI Desktop, informe o token do Databricks (escopo *BI tools*) e clique em **Atualizar**.

## Conexão

| Campo | Valor |
|---|---|
| Conector | **Databricks** (não "Azure Databricks": o workspace roda na AWS) |
| Host | `dbc-a48959b5-98b7.cloud.databricks.com` |
| Caminho HTTP | `/sql/1.0/warehouses/5bc0d92575b8996b` |
| Modo | Importar |

## Modelo

```
            dim_date ─┬─────────────┐
                      │             │
dim_customer ── fact_orders    fact_order_items ── dim_product
     │      └───────────────────────┘        └──── dim_seller
customer_rfm
```

- Duas fatos (pedido e item) compartilham as dimensões, sem relacionamento direto entre si: isso evita caminhos ambíguos até `dim_date`.
- As medidas usam `TREATAS` para propagar o filtro de uma fato para a outra. Assim, filtrar por **categoria/vendedor** (itens) afeta prazo e nota (pedidos), e filtrar por **forma de pagamento/parcelas** (pedidos) afeta a receita (itens).
- Colunas calculadas em `fact_orders`: `faixa_entrega`, `forma_pagamento`, `faixa_parcelas` (prefixo numérico garante a ordem nos eixos).
- **Receita** = preço + frete dos itens. Pedidos sem itens (cancelados/indisponíveis, <1%) ficam fora dos indicadores.
- `dim_date` marcada como tabela de datas; data/hora automática desativada.

## Layout (canvas 1280×720, grade de 8 px)

Pirâmide invertida em todas as páginas: **KPIs no topo → tendência/comparação no meio → detalhe embaixo**, com filtros sincronizados na barra lateral (Período, Estado, Região, Categoria) e navegação entre páginas no cabeçalho.

| Zona | x | y | largura | altura |
|---|---:|---:|---:|---:|
| Cabeçalho (imagem de fundo) | 0 | 0 | 1280 | 56 |
| Navegação entre páginas | 640 | 12 | 624 | 32 |
| Barra lateral de filtros | 0 | 59 | 184 | 661 |
| Linha de KPIs | 200 | 72 | 1064 | 104 |
| Meio | 200 | 192 | 1064 | 248–256 |
| Base | 200 | 456–464 | 1064 | 240–248 |

| Página | KPIs | Meio | Base |
|---|---|---|---|
| **Visão Geral** | Receita, Pedidos, Ticket Médio, Nota Média, % Atraso (com ▲▼ vs mês anterior) | Linha: receita mensal · Barras: top 10 categorias | Barras: top 10 estados · Insight |
| **Vendas & Produtos** | Receita, Ticket Médio, Itens/Pedido, % receita dos 20% maiores vendedores | Barras: top 10 categorias · Dispersão: volume × ticket por categoria · Insight | Rosca: forma de pagamento · Combo: parcelamento × ticket · Pareto: top 20 vendedores |
| **Logística** | Tempo médio de entrega, Prazo estimado, % Atraso, Atraso médio dos atrasados | Linhas: real × estimado por mês · Barras: % atraso por estado (27 UFs) | Colunas: evolução do % atraso · Insight |
| **Clientes & Avaliações** | Nota Média, % Negativas, Clientes Únicos, % Recompra | Colunas: distribuição 1–5 · Combo: nota × pontualidade · Insight | Barras: top 10 estados por clientes · Barras: segmentos RFM |

Páginas ocultas: **Dica - Resumo** (dica de ferramenta 320×240) e **Detalhe do Vendedor** (drill-through).

### Por que cada gráfico

- **Barras horizontais** para categorias e estados: rótulos longos ficam legíveis e o ranking é imediato. Um mapa de 27 UFs esconderia as diferenças de 2–3 p.p. entre estados.
- **Linha** para tudo que é mensal: o eixo contínuo mostra tendência melhor que colunas.
- **Dispersão volume × ticket**: separa categorias de "muito volume, ticket baixo" das de "nicho caro" num visual só, em vez de dois rankings.
- **Rosca só para forma de pagamento**, com 4 fatias. Pizza com 70 categorias seria ilegível.
- **Pareto (colunas + % acumulado)** para vendedores: responde "quem concentra o faturamento" melhor que uma tabela de 3 mil linhas.
- **Sem gauges**: o card com ▲▼ e cor já comunica a meta implícita (subir/cair) ocupando um quarto do espaço.

## Período

O dataset tem pouquíssimos pedidos em 2016 e em set–out/2018. Um **filtro no nível do relatório** limita a `dim_date[year_month]` a **201701–201808**, e uma nota na barra lateral explica o recorte. Para ver tudo, remova o filtro em **Filtros → Filtros em todas as páginas**.

A variação "vs mês anterior" compara sempre o **último mês com vendas no contexto** com o mês anterior a ele (ex.: ago/18 vs jul/18).

## Checklist de limpeza aplicado no tema

- Sem linhas de grade; eixo de valores oculto em barras/colunas (o rótulo de dados já mostra o número).
- Sem títulos de eixo (o título do visual já diz o que é).
- Legenda só quando há mais de uma série, no topo à esquerda.
- Valores: R$ sem centavos (exceto ticket), % com 1 casa, dias com 1 casa, nota com 2 casas.
- Cards sem borda, sobre caixas desenhadas no fundo, com faixa azul de destaque.

## Configuração manual pendente (2 minutos)

O formato PBIR não garante esses dois tipos de página quando criados por arquivo, então faça no Desktop:

1. **Dica de ferramenta:** página *Dica - Resumo* → painel **Formatar página** → **Informações da página** → ative **Permitir uso como dica de ferramenta**. Depois, nos gráficos "Top 10 categorias" e "% de pedidos atrasados por estado", vá em **Formatar visual → Geral → Dicas de ferramenta → Tipo: Página de relatório → Página: Dica - Resumo**.
2. **Drill-through:** página *Detalhe do Vendedor* → painel **Visualizações** → **Detalhamento** → arraste `dim_seller[seller_id]` para "Adicionar campos de detalhamento aqui". O botão **Voltar** é criado automaticamente. No Pareto de vendedores, clique com o botão direito numa coluna → **Detalhamento → Detalhe do Vendedor**.

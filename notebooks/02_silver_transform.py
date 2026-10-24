# Databricks notebook source
# MAGIC %md
# MAGIC # 02 · Silver: tipagem, limpeza e deduplicação
# MAGIC
# MAGIC - Converte tipos com `try_cast` / `try_to_timestamp`: valores inválidos viram `NULL` em vez de quebrar o job.
# MAGIC - Padroniza nomes de colunas e textos (trim, cidades em *Title Case*, UF em maiúsculas).
# MAGIC - Deduplica pela chave de negócio, mantendo a versão mais recente (`_ingested_at`), então reenviar um arquivo corrigido é seguro.
# MAGIC - Geolocalização: um ponto médio por CEP, filtrando coordenadas fora do Brasil.

# COMMAND ----------

from pyspark.sql import DataFrame, Window
from pyspark.sql import functions as F

dbutils.widgets.text("catalog", "workspace")
catalog = dbutils.widgets.get("catalog")

bronze = f"{catalog}.olist_bronze"
silver = f"{catalog}.olist_silver"

# COMMAND ----------

def latest(df: DataFrame, keys: list[str]) -> DataFrame:
    """Mantém apenas a versão mais recente de cada chave."""
    w = Window.partitionBy(*keys).orderBy(F.col("_ingested_at").desc())
    return df.withColumn("_rn", F.row_number().over(w)).filter("_rn = 1").drop("_rn")


def ts(col: str):
    return F.try_to_timestamp(F.col(col), F.lit("yyyy-MM-dd HH:mm:ss"))


def num(col: str, dtype: str = "double"):
    # Column.try_cast só existe a partir do Spark 4; a expressão funciona em qualquer runtime
    return F.expr(f"try_cast({col} AS {dtype})")


def txt(col: str):
    return F.nullif(F.trim(F.col(col)), F.lit(""))


def city(col: str):
    return F.initcap(txt(col))


def uf(col: str):
    return F.upper(txt(col))


def save(df: DataFrame, name: str) -> None:
    table = f"{silver}.{name}"
    df.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(table)
    print(f"{table}: {spark.table(table).count():,} linhas")


def read(name: str) -> DataFrame:
    return spark.table(f"{bronze}.{name}")

# COMMAND ----------

customers = latest(read("customers"), ["customer_id"]).select(
    txt("customer_id").alias("customer_id"),
    txt("customer_unique_id").alias("customer_unique_id"),
    txt("customer_zip_code_prefix").alias("zip_code_prefix"),
    city("customer_city").alias("city"),
    uf("customer_state").alias("state"),
)
save(customers.filter("customer_id IS NOT NULL"), "customers")

# COMMAND ----------

sellers = latest(read("sellers"), ["seller_id"]).select(
    txt("seller_id").alias("seller_id"),
    txt("seller_zip_code_prefix").alias("zip_code_prefix"),
    city("seller_city").alias("city"),
    uf("seller_state").alias("state"),
)
save(sellers.filter("seller_id IS NOT NULL"), "sellers")

# COMMAND ----------

geolocation = (
    read("geolocation")
    .select(
        txt("geolocation_zip_code_prefix").alias("zip_code_prefix"),
        num("geolocation_lat").alias("lat"),
        num("geolocation_lng").alias("lng"),
        city("geolocation_city").alias("city"),
        uf("geolocation_state").alias("state"),
    )
    # bounding box aproximado do Brasil
    .filter("lat BETWEEN -34 AND 6 AND lng BETWEEN -74 AND -34")
    .groupBy("zip_code_prefix")
    .agg(
        F.avg("lat").alias("lat"),
        F.avg("lng").alias("lng"),
        F.mode("city").alias("city"),
        F.mode("state").alias("state"),
    )
)
save(geolocation, "geolocation")

# COMMAND ----------

translation = latest(read("category_translation"), ["product_category_name"]).select(
    "product_category_name", "product_category_name_english"
)

# A origem traz o nome da categoria sem acento e com "_" (ex.: beleza_saude).
# Nome de exibição em PT-BR; categoria nova fora da lista cai no initcap como antes.
CATEGORIAS_PT = {
    "agro_industria_e_comercio": "Agroindústria e Comércio", "alimentos": "Alimentos",
    "alimentos_bebidas": "Alimentos e Bebidas", "artes": "Artes", "artes_e_artesanato": "Artes e Artesanato",
    "artigos_de_festas": "Artigos de Festa", "artigos_de_natal": "Artigos de Natal", "audio": "Áudio",
    "automotivo": "Automotivo", "bebes": "Bebês", "bebidas": "Bebidas", "beleza_saude": "Beleza e Saúde",
    "brinquedos": "Brinquedos", "cama_mesa_banho": "Cama, Mesa e Banho", "casa_conforto": "Casa e Conforto",
    "casa_conforto_2": "Casa e Conforto 2", "casa_construcao": "Casa e Construção",
    "cds_dvds_musicais": "CDs e DVDs Musicais", "cine_foto": "Cinema e Foto", "climatizacao": "Climatização",
    "consoles_games": "Consoles e Games", "construcao_ferramentas_construcao": "Construção: Materiais",
    "construcao_ferramentas_ferramentas": "Construção: Ferramentas",
    "construcao_ferramentas_iluminacao": "Construção: Iluminação", "construcao_ferramentas_jardim": "Construção: Jardim",
    "construcao_ferramentas_seguranca": "Construção: Segurança", "cool_stuff": "Cool Stuff",
    "dvds_blu_ray": "DVDs e Blu-ray", "eletrodomesticos": "Eletrodomésticos", "eletrodomesticos_2": "Eletrodomésticos 2",
    "eletronicos": "Eletrônicos", "eletroportateis": "Eletroportáteis", "esporte_lazer": "Esporte e Lazer",
    "fashion_bolsas_e_acessorios": "Moda: Bolsas e Acessórios", "fashion_calcados": "Moda: Calçados",
    "fashion_esporte": "Moda: Esporte", "fashion_roupa_feminina": "Moda: Feminina",
    "fashion_roupa_infanto_juvenil": "Moda: Infantojuvenil", "fashion_roupa_masculina": "Moda: Masculina",
    "fashion_underwear_e_moda_praia": "Moda: Íntima e Praia", "ferramentas_jardim": "Ferramentas e Jardim",
    "flores": "Flores", "fraldas_higiene": "Fraldas e Higiene",
    "industria_comercio_e_negocios": "Indústria, Comércio e Negócios", "informatica_acessorios": "Informática e Acessórios",
    "instrumentos_musicais": "Instrumentos Musicais", "la_cuisine": "La Cuisine", "livros_importados": "Livros Importados",
    "livros_interesse_geral": "Livros de Interesse Geral", "livros_tecnicos": "Livros Técnicos",
    "malas_acessorios": "Malas e Acessórios", "market_place": "Marketplace",
    "moveis_colchao_e_estofado": "Móveis: Colchões e Estofados",
    "moveis_cozinha_area_de_servico_jantar_e_jardim": "Móveis: Cozinha, Jantar e Jardim",
    "moveis_decoracao": "Móveis e Decoração", "moveis_escritorio": "Móveis de Escritório",
    "moveis_quarto": "Móveis de Quarto", "moveis_sala": "Móveis de Sala", "musica": "Música", "papelaria": "Papelaria",
    "pc_gamer": "PC Gamer", "pcs": "PCs", "perfumaria": "Perfumaria", "pet_shop": "Pet Shop",
    "portateis_casa_forno_e_cafe": "Portáteis: Forno e Café",
    "portateis_cozinha_e_preparadores_de_alimentos": "Portáteis: Cozinha",
    "relogios_presentes": "Relógios e Presentes", "seguros_e_servicos": "Seguros e Serviços",
    "sinalizacao_e_seguranca": "Sinalização e Segurança", "tablets_impressao_imagem": "Tablets, Impressão e Imagem",
    "telefonia": "Telefonia", "telefonia_fixa": "Telefonia Fixa", "utilidades_domesticas": "Utilidades Domésticas",
}
nomes_categoria = spark.createDataFrame(
    list(CATEGORIAS_PT.items()), "product_category_name string, nome_exibicao string"
)

products = (
    latest(read("products"), ["product_id"])
    .join(translation, "product_category_name", "left")
    .join(F.broadcast(nomes_categoria), "product_category_name", "left")
    .select(
        txt("product_id").alias("product_id"),
        F.coalesce(
            "nome_exibicao",
            F.initcap(F.regexp_replace("product_category_name", "_", " ")),
            F.lit("Sem categoria"),
        ).alias("category_pt"),
        F.coalesce(
            F.regexp_replace("product_category_name_english", "_", " "), F.lit("unknown")
        ).alias("category_en"),
        num("product_photos_qty", "int").alias("photos_qty"),
        num("product_weight_g").alias("weight_g"),
        num("product_length_cm").alias("length_cm"),
        num("product_height_cm").alias("height_cm"),
        num("product_width_cm").alias("width_cm"),
    )
)
save(products.filter("product_id IS NOT NULL"), "products")

# COMMAND ----------

orders = latest(read("orders"), ["order_id"]).select(
    txt("order_id").alias("order_id"),
    txt("customer_id").alias("customer_id"),
    F.lower(txt("order_status")).alias("order_status"),
    ts("order_purchase_timestamp").alias("purchased_at"),
    ts("order_approved_at").alias("approved_at"),
    ts("order_delivered_carrier_date").alias("shipped_at"),
    ts("order_delivered_customer_date").alias("delivered_at"),
    ts("order_estimated_delivery_date").alias("estimated_delivery_at"),
)
save(orders.filter("order_id IS NOT NULL"), "orders")

# COMMAND ----------

order_items = latest(read("order_items"), ["order_id", "order_item_id"]).select(
    txt("order_id").alias("order_id"),
    num("order_item_id", "int").alias("order_item_id"),
    txt("product_id").alias("product_id"),
    txt("seller_id").alias("seller_id"),
    ts("shipping_limit_date").alias("shipping_limit_at"),
    num("price", "decimal(12,2)").alias("price"),
    num("freight_value", "decimal(12,2)").alias("freight_value"),
)
save(order_items.filter("order_id IS NOT NULL"), "order_items")

# COMMAND ----------

payments = latest(read("order_payments"), ["order_id", "payment_sequential"]).select(
    txt("order_id").alias("order_id"),
    num("payment_sequential", "int").alias("payment_sequential"),
    F.lower(txt("payment_type")).alias("payment_type"),
    num("payment_installments", "int").alias("installments"),
    num("payment_value", "decimal(12,2)").alias("payment_value"),
)
save(payments.filter("order_id IS NOT NULL"), "payments")

# COMMAND ----------

# no Olist o mesmo review_id pode aparecer em mais de um pedido, por isso a chave é composta
reviews = latest(read("order_reviews"), ["review_id", "order_id"]).select(
    txt("review_id").alias("review_id"),
    txt("order_id").alias("order_id"),
    num("review_score", "int").alias("review_score"),
    txt("review_comment_title").alias("comment_title"),
    txt("review_comment_message").alias("comment_message"),
    ts("review_creation_date").alias("created_at"),
    ts("review_answer_timestamp").alias("answered_at"),
)
save(reviews.filter("order_id IS NOT NULL"), "reviews")

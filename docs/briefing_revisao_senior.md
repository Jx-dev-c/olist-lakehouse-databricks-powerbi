Você é um especialista sênior em BI e Power BI, com experiência em modelagem dimensional, DAX e storytelling com dados. Vou te passar o contexto de um dashboard de portfólio e quero uma **avaliação crítica e um plano de melhoria concreto**.

## Contexto
- **Dataset:** Olist (e-commerce brasileiro, dados públicos). Período do relatório: jan/2017 a ago/2018. Os meses das pontas (2016, set–out/2018) são esparsos e ficam fora.
- **Stack:** Databricks (medalhão bronze → silver → gold, PySpark, testes de qualidade) e Power BI (PBIP, modelo importado).
- **Páginas:** Visão Geral | Vendas & Produtos | Logística | Clientes & Avaliações.
- **Objetivo:** projeto de portfólio para vagas de Analista de BI / Dados. Preciso explicar e justificar cada escolha em entrevista.

## O que já existe (avalie e critique; não proponha do zero)
- **Modelo estrela:**
  - `fact_orders` (grão pedido: status, datas, prazo, atraso, nota, pagamento);
  - `fact_order_items` (grão item: preço, frete, produto, vendedor);
  - dimensões `dim_date` (marcada como tabela de datas, sem data/hora automática), `dim_customer`, `dim_product`, `dim_seller`;
  - `customer_rfm`.
  - As duas fatos **não** se relacionam diretamente. As medidas usam `TREATAS` pelo `order_id` para propagar filtros entre elas.
- **Tabela `_Medidas`** com pastas numeradas (Vendas, Vendedores, Logística, Satisfação, Clientes, Variação mensal, Séries).
- **Medidas de variação contra o mês anterior** (receita, pedidos e ticket em %; nota em pontos; % atraso como diferença), texto ▲▼ e cor condicional verde/vermelha, invertida para atraso.
- **Visual personalizado de KPI** (HTML/CSS: valor, pílula de variação, minigráfico) e **mapa 3D** próprio (three.js).

## Estado atual da Visão Geral
- **5 cards de KPI com minigráfico.** O valor é o **total do período**; a pílula compara **ago/18 com jul/18**:

  | KPI | Valor | Pílula |
  |---|---|---|
  | Receita | R$ 15,8M | −5,2% |
  | Pedidos | 98.353 | +2,9% |
  | Ticket Médio | R$ 160,51 | −7,9% |
  | Nota Média | 4,11 | "▲ 0,00" |
  | % Atraso | 6,8% | "▲ 2,8%" |

- **Linha de receita mensal:**
  - crescimento forte em 2017, com pico em nov/17 (R$ 1,18 mi, Black Friday);
  - em 2018, **platô** de R$ 1,0–1,16 mi/mês;
  - contra o ano anterior a receita ainda cresce: **acumulado jan–ago 2018 +139% sobre 2017** e ago/18 +50% sobre ago/17. O crescimento anual **desacelera** (de +245% em fev/18 para +50% em ago/18).
- **Barras:** top 8 estados e top 10 categorias por receita.
- **Card de texto estático "Insight":** pedidos no prazo têm nota 4,29; atrasados, 2,27; com 6+ dias de atraso, 78% das avaliações são negativas.
- **Filtros:** período, estado do cliente, região, categoria (sincronizados).
- **Visual:** cards com hierarquia (KPI em destaque, pílulas verde/vermelha, insight escuro), mas **gráficos todos no mesmo azul** e nenhum destaque no pico.

## Problemas identificados (validados contra os dados)
1. A página não tem público nem pergunta de negócio definidos; mistura indicadores comerciais e operacionais.
2. O achado principal não está destacado. Não é "estagnação": é **platô mensal em 2018 com desaceleração do crescimento anual**.
3. O insight atraso → nota é o achado que liga logística e satisfação. Discuta se ele abre a Visão Geral ou vai para Clientes/Logística.
4. Os cards misturam recortes: o valor é o total do período e a variação é mês contra mês ("vs jul/18").
5. "% Atraso ▲2,8%" é na verdade **+2,8 p.p.** (6,19% − 3,38%), mas o formato mostra "%".
6. **A seta da nota mente:** a variação real é −0,007 e o card mostra "▲ 0,00" em verde. Variações abaixo da precisão exibida deveriam ser neutras.
7. O card de insight é estático e fica errado quando o usuário filtra.
8. **A receita inclui pedidos cancelados** (448 pedidos, R$ 102 mil) e pedidos ainda não entregues (~1.700, R$ 310 mil). A medida não filtra status.
9. **O % de atraso dos meses recentes está subestimado** (dado censurado): só 97,5% dos pedidos de ago/18 estavam entregues no corte da base, e os pendentes são candidatos a atraso.
10. As definições das métricas estão no README e em comentários do modelo, **não no relatório** (receita inclui frete? quais status? qual data?). A nota muda com a definição (4,11 com pedidos com itens; 4,09 com todos).
11. Eixo de receita com poucas marcações. Top 8 × top 10 escolhidos por espaço, sem critério de negócio.
12. A cor não destaca o que importa nos gráficos (pico, ano anterior, piora).

## O que eu quero de você
1. **Pergunta de negócio por página:** público e pergunta principal das 4 páginas; reescreva o título de cada página como essa pergunta.
2. **Redesenho da Visão Geral:**
   - quais KPIs manter, trocar ou remover;
   - qual comparativo usar (mês de referência contra o mês anterior, contra o mesmo mês do ano anterior, acumulado do ano contra o mesmo período do ano anterior) e como deixar isso inequívoco no card.
3. **Definições de métricas** para o Olist: receita, pedidos, ticket médio, nota média e % atraso, com tabelas, colunas, status considerados e data de referência. Justifique a escolha de status (entregues × não cancelados).
4. **DAX** (avalie as existentes e proponha):
   - variação contra o mês anterior, contra o ano anterior e acumulado do ano contra o mesmo período do ano anterior;
   - variação de taxa em p.p. com formato inequívoco;
   - regra de neutralidade para variações abaixo da precisão;
   - texto de insight dinâmico que respeite os filtros (com proteção para amostra pequena);
   - formatação condicional quando o atraso piora.
5. **Modelo:** critique a escolha de duas fatos sem relação direta + `TREATAS` contra as alternativas (fato única, ponte, relacionamento bidirecional), e a organização de medidas.
6. **Design:** cor de destaque com significado, anotação do pico de nov/17, série do ano anterior, critério para top N, onde documentar as definições (dica de ferramenta, página de glossário).
7. **Roteiro de entrevista:** 5 perguntas que um avaliador sênior faria e como responder com base nas melhorias, incluindo os itens 8 e 9 (definição de receita e dado censurado).

Priorize por impacto (alto/médio/baixo) e esforço, e explique o porquê de cada recomendação, para que eu entenda e consiga defender as decisões, não só copiar.

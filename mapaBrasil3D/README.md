# Mapa Brasil 3D: visual personalizado do Power BI

Visual próprio, escrito em TypeScript com [three.js](https://threejs.org/). Desenha os 27 estados em 3D, com altura e cor definidas por medidas. Não depende de visual pago e não tem marca d'água.

| Recurso | Como funciona |
|---|---|
| Altura | Proporcional à medida em **Altura** (ex.: `Pedidos`) |
| Cor | Gradiente entre duas cores pela medida em **Cor** (ex.: `% Atraso`); se vazia, usa a altura |
| Animação | Os estados "crescem" em onda, de oeste para leste, sempre que um filtro muda |
| Câmera | Arrastar gira, roda do mouse dá zoom; opção de girar automaticamente |
| Dica de ferramenta | Nome da UF + todas as medidas; aceita página de dica do relatório |
| Filtro cruzado | Clique num estado filtra o resto da página (Ctrl+clique para vários); clique no vazio limpa |
| Formatação | Painel **Mapa 3D**: cores, altura máxima, rótulos, legenda, rotação automática |

## Usar no relatório

1. Power BI Desktop → painel **Visualizações** → `...` → **Importar um visual de um arquivo** → `dist/*.pbiviz`.
2. Campos: **Estado (UF)** = `dim_customer[state]`, **Altura** = `Pedidos`, **Cor** = `% Atraso`, **Dicas de ferramenta** = `Nota Média`, `Receita`.

## Desenvolver

```powershell
npm install
node geo/gerar_geo.mjs      # regenera src/geo.ts a partir da malha do IBGE (geo/ibge_uf_minima.json)
npm run package             # gera dist/*.pbiviz
```

- **Geometria:** malha de UFs do IBGE (API de malhas v3, qualidade mínima), projetada num plano equiretangular corrigido pela latitude central (-15°). Cada estado é um `ExtrudeGeometry` de altura 1, e a altura real vem de `scale.z`. Assim a animação não recria geometria.
- **Rótulos:** sprites com textura de canvas, posicionados no centroide do maior polígono de cada UF.
- **Desempenho:** 27 malhas, 1 luz com sombra e `devicePixelRatio` limitado a 2.
- **Limitação:** visual não certificado, então não aparece em exportação para PDF/PowerPoint nem em assinaturas por e-mail. Na tela e no Power BI Service funciona normalmente.

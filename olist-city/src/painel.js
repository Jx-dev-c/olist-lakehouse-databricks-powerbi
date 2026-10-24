// Conteúdo dos painéis: KPIs, gráficos (SVG/HTML) e insights calculados a partir de dados/olist_city.json.
// Nenhum número é digitado à mão: tudo sai do JSON exportado do Databricks.

const nf = (v, d = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmt = {
  moedaCurta: v => v >= 1e6 ? `R$ ${nf(v / 1e6, 1)} mi` : v >= 1e4 ? `R$ ${nf(v / 1e3, 0)} mil` : `R$ ${nf(v, 2)}`,
  moeda: v => `R$ ${nf(v, 2)}`,
  int: v => nf(v),
  milCurto: v => v >= 1e3 ? `${nf(v / 1e3, 1)} mil` : nf(v),
  pct: (v, d = 1) => `${nf(v * 100, d)}%`,
  num: (v, d = 1) => nf(v, d),
  sinal: (v, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(Math.abs(v * 100), d)}%`,
};
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotMes = m => `${MESES[+m.slice(5, 7) - 1]}/${m.slice(2, 4)}`;
const soma = (lista, f) => lista.reduce((s, x) => s + f(x), 0);
const maior = (lista, f) => lista.reduce((a, b) => (f(b) > f(a) ? b : a));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const PAGAMENTO = { credit_card: "Cartão de crédito", boleto: "Boleto", voucher: "Voucher", debit_card: "Cartão de débito" };
const DIAS = { 1: "Dom", 2: "Seg", 3: "Ter", 4: "Qua", 5: "Qui", 6: "Sex", 7: "Sáb" };
const DIAS_LONGO = { 1: "domingo", 2: "segunda", 3: "terça", 4: "quarta", 5: "quinta", 6: "sexta", 7: "sábado" };

// ---------- números derivados (usados em vários lugares) ----------
export function derivar(D) {
  const k = D.kpis[0];
  const m = D.mensal;
  const doAno = a => m.filter(x => x.mes.startsWith(a));
  const janAgo = a => soma(doAno(a).filter(x => +x.mes.slice(5) <= 8), x => x.receita);
  const pico = maior(m, x => x.receita);
  const r18 = doAno("2018").map(x => x.receita);
  const ago18 = m.find(x => x.mes === "2018-08"), ago17 = m.find(x => x.mes === "2017-08");
  const totalNotas = soma(D.notas, x => x.pedidos);
  const totalPag = soma(D.pagamentos, x => x.pedidos);
  const totalPedEstados = soma(D.estados, x => x.pedidos);
  const porDia = {}, porHora = {};
  for (const c of D.calor_compras) { porDia[c.dia] = (porDia[c.dia] || 0) + c.pedidos; porHora[c.hora] = (porHora[c.hora] || 0) + c.pedidos; }
  const melhorDia = +Object.keys(porDia).reduce((a, b) => (porDia[b] > porDia[a] ? b : a));
  const horasOrdenadas = Object.keys(porHora).map(Number).sort((a, b) => porHora[b] - porHora[a]);
  const atrasoFaixa = D.entrega_nota.map(x => ({ ...x, faixa: x.faixa_entrega.replace(/^\d+\.\s*/, "") }));
  const piorMes = maior(m.filter(x => x.pedidos >= 1000 && x.mes < "2018-08"), x => x.pct_atraso);
  const estadosAtraso = D.estados.filter(x => x.pedidos >= 500).sort((a, b) => b.pct_atraso - a.pct_atraso);
  const sp = D.estados.find(x => x.uf === "SP");
  return {
    k, pico, ytd18: janAgo("2018"), ytd17: janAgo("2017"),
    varYtd: janAgo("2018") / janAgo("2017") - 1,
    min18: Math.min(...r18), max18: Math.max(...r18),
    ago18, ago17, varAgoAA: ago18.receita / ago17.receita - 1,
    ticket: k.receita / k.pedidos,
    share5: D.notas.find(x => x.nota === 5).pedidos / totalNotas,
    share1: D.notas.find(x => x.nota === 1).pedidos / totalNotas,
    totalNotas, totalPag, totalPedEstados,
    cartao: D.pagamentos.find(x => x.tipo === "credit_card"),
    boleto: D.pagamentos.find(x => x.tipo === "boleto"),
    porDia, porHora, melhorDia, horasOrdenadas,
    atrasoFaixa, piorMes, estadosAtraso, sp,
    pareto: D.vendedores_pareto[0], recompra: D.recompra[0],
    top8Share: soma(D.categorias, x => x.receita) / k.receita,
  };
}

// ---------- peças visuais ----------
function faixa(valores) {
  const v = valores.filter(x => x != null);
  const min = Math.min(...v), max = Math.max(...v), w = 54, h = 22;
  const pts = v.map((y, i) => `${(i / (v.length - 1)) * w},${h - ((y - min) / (max - min || 1)) * h}`);
  const [ux, uy] = pts[pts.length - 1].split(",");
  return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.join(" ")}" fill="none" stroke="var(--cor)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${ux}" cy="${uy}" r="2.6" fill="var(--cor)"/></svg>`;
}
function kpis(lista) {
  return `<div class="kpis">${lista.map((x, i) => `
    <div class="kpi" style="animation-delay:${i * 60}ms">
      ${x.serie ? faixa(x.serie) : ""}
      <small>${esc(x.rotulo)}</small>
      <b>${esc(x.valor)}</b>
      <span class="${x.tom || ""}">${esc(x.detalhe || "")}</span>
    </div>`).join("")}</div>`;
}
function bloco(titulo, sub, corpo, nota) {
  return `<section class="bloco"><h3>${esc(titulo)}${sub ? ` <small>${esc(sub)}</small>` : ""}</h3>${corpo}${nota ? `<p class="nota">${esc(nota)}</p>` : ""}</section>`;
}
function barras(itens, formato, { cor } = {}) {
  const max = Math.max(...itens.map(x => x.valor));
  return `<div class="barras">${itens.map(x => `
    <div class="barra" title="${esc(x.rotulo)}: ${esc(formato(x.valor))}">
      <span class="rot">${esc(x.rotulo)}</span>
      <span class="trilho"><span class="preench" data-w="${(x.valor / max) * 100}%" style="${x.cor || cor ? `background:${x.cor || cor}` : ""}"></span></span>
      <span class="val">${esc(x.texto ?? formato(x.valor))}</span>
    </div>`).join("")}</div>`;
}
function colunas(itens, formato) {
  const max = Math.max(...itens.map(x => x.valor));
  return `<div class="colunas">${itens.map(x => `
    <div class="coluna" title="${esc(x.rotulo)}: ${esc(formato(x.valor))}">
      <b>${esc(formato(x.valor))}</b>
      <span class="c" data-h="${(x.valor / max) * 100}%" style="${x.cor ? `background:${x.cor}` : ""}"></span>
      <span>${esc(x.rotulo)}</span>
    </div>`).join("")}</div>`;
}
function calor(D) {
  const max = Math.max(...D.calor_compras.map(c => c.pedidos));
  const mapa = new Map(D.calor_compras.map(c => [`${c.dia}-${c.hora}`, c.pedidos]));
  let html = `<div class="calor"><span></span>${Array.from({ length: 24 }, (_, h) => `<span class="hora">${h % 6 === 0 ? h + "h" : ""}</span>`).join("")}`;
  for (const dia of [2, 3, 4, 5, 6, 7, 1]) {
    html += `<span class="dia">${DIAS[dia]}</span>`;
    for (let h = 0; h < 24; h++) {
      const v = mapa.get(`${dia}-${h}`) || 0;
      html += `<span class="cel" style="opacity:${(0.06 + 0.94 * v / max).toFixed(2)}" title="${DIAS[dia]} ${h}h: ${fmt.int(v)} pedidos"></span>`;
    }
  }
  return html + `</div><div class="calor-legenda">menos <i></i> mais pedidos</div>`;
}
function linhas({ rotulos, series, formato, altura = 150 }) {
  const W = 360, H = altura, pl = 40, pr = 12, pt = 14, pb = 20;
  const todos = series.flatMap(s => s.valores.filter(v => v != null));
  const bruto = Math.max(...todos), mag = 10 ** Math.floor(Math.log10(bruto));
  const max = Math.ceil(bruto / mag * 2) / 2 * mag;
  const x = i => pl + i * (W - pl - pr) / (rotulos.length - 1);
  const y = v => pt + (1 - v / max) * (H - pt - pb);
  let svg = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img">`;
  for (const f of [0, 0.5, 1]) svg += `<line class="grade" x1="${pl}" x2="${W - pr}" y1="${y(max * f)}" y2="${y(max * f)}"/><text x="${pl - 6}" y="${y(max * f) + 3}" text-anchor="end">${esc(formato(max * f))}</text>`;
  const passo = Math.ceil(rotulos.length / 6);
  rotulos.forEach((r, i) => { if (i % passo === 0 || i === rotulos.length - 1) svg += `<text x="${x(i)}" y="${H - 4}" text-anchor="middle">${esc(r)}</text>`; });
  series.forEach((s, si) => {
    const pts = s.valores.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
    let comp = 0;
    for (let i = 1; i < pts.length; i++) comp += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
    if (s.area) {
      svg += `<defs><linearGradient id="ga${si}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.cor}" stop-opacity=".28"/><stop offset="1" stop-color="${s.cor}" stop-opacity="0"/></linearGradient></defs>`;
      svg += `<path d="${d}L${pts[pts.length - 1][0]},${y(0)}L${pts[0][0]},${y(0)}Z" fill="url(#ga${si})"/>`;
    }
    svg += `<path class="serie" d="${d}" stroke="${s.cor}" style="--comp:${Math.ceil(comp)}${s.tracejado ? ";stroke-width:1.8" : ""}"/>`;
    const u = pts[pts.length - 1];
    if (s.rotuloFinal) svg += `<circle cx="${u[0]}" cy="${u[1]}" r="3.5" fill="${s.cor}" stroke="#fff" stroke-width="1.5"/>`;
    for (const mk of s.marcas || []) {
      const px = x(mk.i), py = y(s.valores[mk.i]);
      svg += `<circle cx="${px}" cy="${py}" r="4.5" fill="${mk.cor}" stroke="#fff" stroke-width="2"/><text class="rotulo-ponto" x="${px}" y="${py - 9}" text-anchor="middle">${esc(mk.texto)}</text>`;
    }
  });
  // colunas invisíveis para o hover
  const larg = (W - pl - pr) / (rotulos.length - 1);
  rotulos.forEach((r, i) => {
    const titulo = `${r}: ` + series.filter(s => s.valores[i] != null).map(s => `${s.nome} ${formato(s.valores[i])}`).join(" · ");
    svg += `<g class="coluna-hover"><title>${esc(titulo)}</title><rect x="${x(i) - larg / 2}" y="${pt}" width="${larg}" height="${H - pt - pb}"/>`;
    series.forEach(s => { if (s.valores[i] != null) svg += `<circle class="ponto" cx="${x(i)}" cy="${y(s.valores[i])}" r="3" fill="${s.cor}"/>`; });
    svg += `</g>`;
  });
  svg += `</svg>`;
  const leg = `<div class="legenda">${series.map(s => `<span><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join("")}</div>`;
  return svg + leg;
}
function insight(titulo, texto) {
  return `<section class="insight"><small>INSIGHT</small><strong>${esc(titulo)}</strong>${esc(texto)}</section>`;
}

// ---------- painéis por prédio ----------
export function conteudo(id, D, X) {
  const k = X.k, m = D.mensal;
  const rec = m.map(x => x.receita), ped = m.map(x => x.pedidos);
  switch (id) {
    case "torre": {
      const mesesAno = MESES.map(n => n);
      const de = a => MESES.map((_, i) => m.find(x => x.mes === `${a}-${String(i + 1).padStart(2, "0")}`)?.receita ?? null);
      const s17 = de("2017"), s18 = de("2018");
      const iPico = Number(X.pico.mes.slice(5)) - 1;
      return {
        pergunta: "O negócio está crescendo?",
        html: kpis([
          { rotulo: "Receita total", valor: fmt.moedaCurta(k.receita), detalhe: "pedidos válidos, 2016–2018", serie: rec },
          { rotulo: "Pedidos", valor: fmt.int(k.pedidos), detalhe: "sem cancelados/indisponíveis", serie: ped },
          { rotulo: "Ticket médio", valor: fmt.moeda(X.ticket), detalhe: "itens + frete por pedido", serie: m.map(x => x.receita / x.pedidos) },
          { rotulo: "Receita jan–ago/18", valor: fmt.sinal(X.varYtd, 0), detalhe: "vs jan–ago/17", tom: X.varYtd >= 0 ? "sobe" : "desce" },
        ]) + bloco("Receita mensal: 2018 × 2017", "R$ mil", linhas({
          rotulos: mesesAno, formato: v => nf(v / 1e3, 0),
          series: [
            { nome: "2017", cor: "#94A3B8", valores: s17, tracejado: true, marcas: X.pico.mes.startsWith("2017") ? [{ i: iPico, texto: `pico ${fmt.moedaCurta(X.pico.receita)}`, cor: "#F59E0B" }] : [] },
            { nome: "2018", cor: "#6366F1", valores: s18, area: true, rotuloFinal: true },
          ],
        }), "2018 vai até agosto, último mês completo da base.")
          + insight("Platô em 2018, ainda acima de 2017",
            `Em 2018 a receita mensal oscilou entre ${fmt.moedaCurta(X.min18)} e ${fmt.moedaCurta(X.max18)}: parou de subir. O acumulado de jan–ago ainda é ${fmt.sinal(X.varYtd, 0)} sobre 2017, mas a vantagem encolhe mês a mês (ago: ${fmt.sinal(X.varAgoAA, 0)}).`),
      };
    }
    case "shopping": {
      const h = X.horasOrdenadas;
      return {
        pergunta: "O que vende e quando?",
        html: kpis([
          { rotulo: "Receita", valor: fmt.moedaCurta(k.receita), detalhe: `${fmt.int(k.pedidos)} pedidos`, serie: rec },
          { rotulo: "Top 8 categorias", valor: fmt.pct(X.top8Share, 0), detalhe: "da receita total" },
          { rotulo: "Mês recorde", valor: rotMes(X.pico.mes), detalhe: `${fmt.moedaCurta(X.pico.receita)} · Black Friday` },
          { rotulo: "Dia mais forte", valor: DIAS_LONGO[X.melhorDia], detalhe: `pico de pedidos às ${h[0]}h` },
        ]) + bloco("Quando o cliente compra", "pedidos por dia × hora", calor(D))
          + bloco("Top 8 categorias", "receita", barras(D.categorias.map(c => ({ rotulo: c.categoria, valor: c.receita })), fmt.moedaCurta))
          + insight(`${D.categorias[0].categoria} lidera, mas sem dono absoluto`,
            `As 8 maiores categorias somam ${fmt.pct(X.top8Share, 0)} da receita, e a líder tem só ${fmt.pct(D.categorias[0].receita / k.receita, 1)}. ${DIAS_LONGO[X.melhorDia][0].toUpperCase() + DIAS_LONGO[X.melhorDia].slice(1)} é o dia mais forte, e as 6 horas de maior movimento ficam entre ${Math.min(...h.slice(0, 6))}h e ${Math.max(...h.slice(0, 6)) + 1}h: é a janela para campanhas e mídia.`),
      };
    }
    case "galpao": {
      const top = X.estadosAtraso.slice(0, 8);
      const comAtraso = X.atrasoFaixa.filter(x => /atraso/i.test(x.faixa));
      return {
        pergunta: "Onde e quando atrasamos?",
        html: kpis([
          { rotulo: "% entregas com atraso", valor: fmt.pct(k.pct_atraso), detalhe: "sobre pedidos entregues", serie: m.slice(0, -1).map(x => x.pct_atraso) },
          { rotulo: "Prazo médio", valor: `${fmt.num(k.prazo_medio)} dias`, detalhe: "compra → entrega", serie: m.map(x => x.prazo) },
          { rotulo: "Frete médio", valor: fmt.moeda(k.frete_medio), detalhe: "por pedido" },
          { rotulo: "Pior mês", valor: rotMes(X.piorMes.mes), detalhe: `${fmt.pct(X.piorMes.pct_atraso)} com atraso`, tom: "desce" },
        ]) + bloco("% de atraso por mês", "pedidos entregues", linhas({
          rotulos: m.map(x => rotMes(x.mes)), formato: v => fmt.pct(v, 0),
          series: [{ nome: "% atraso", cor: "#2563EB", valores: m.map(x => (x.mes === "2018-08" ? null : x.pct_atraso)), area: true, marcas: [{ i: m.indexOf(X.piorMes), texto: fmt.pct(X.piorMes.pct_atraso, 0), cor: "#EF4444" }] }],
        }), "ago/18 fica de fora: parte dos pedidos ainda não tinha sido entregue (o atraso sairia subestimado).")
          + bloco("Estados com mais atraso", "500+ pedidos", barras(top.map(e => ({ rotulo: `${e.uf} · ${e.regiao}`, valor: e.pct_atraso, cor: e.pct_atraso >= k.pct_atraso * 1.5 ? "#EF4444" : undefined })), v => fmt.pct(v)))
          + insight(`${top[0].uf} atrasa ${fmt.num(top[0].pct_atraso / X.sp.pct_atraso, 1)}× mais que SP`,
            `O atraso não é nacional: ${top.slice(0, 3).map(e => `${e.uf} (${fmt.pct(e.pct_atraso, 0)})`).join(", ")} puxam a média, enquanto SP fica em ${fmt.pct(X.sp.pct_atraso, 0)}. O pior mês foi ${rotMes(X.piorMes.mes)}, com ${fmt.pct(X.piorMes.pct_atraso, 0)}. Entregas atrasadas somam ${fmt.int(soma(comAtraso, x => x.pedidos))} pedidos.`),
      };
    }
    case "bairro": {
      const r = X.recompra;
      const estados = D.estados.slice(0, 8);
      const emRisco = D.rfm.find(x => /risco/i.test(x.segmento));
      return {
        pergunta: "Quem compra e quem volta?",
        html: kpis([
          { rotulo: "Clientes únicos", valor: fmt.int(k.clientes), detalhe: "com pedido válido", serie: m.map(x => x.pedidos) },
          { rotulo: "Taxa de recompra", valor: fmt.pct(r.taxa), detalhe: `${fmt.int(r.recompram)} voltaram`, tom: "desce" },
          { rotulo: "Pedidos de SP", valor: fmt.pct(X.sp.pedidos / X.totalPedEstados, 0), detalhe: `${fmt.int(X.sp.pedidos)} pedidos` },
          { rotulo: "Em risco (alto valor)", valor: fmt.int(emRisco.clientes), detalhe: `gasto médio ${fmt.moeda(emRisco.valor_medio)}` },
        ]) + bloco("Segmentos RFM", "clientes", barras(D.rfm.map(s => ({ rotulo: s.segmento, valor: s.clientes })), fmt.int))
          + bloco("Pedidos por estado", "top 8", barras(estados.map(e => ({ rotulo: `${e.uf} · ${e.regiao}`, valor: e.pedidos })), fmt.int))
          + insight("Quase ninguém volta",
            `Só ${fmt.pct(r.taxa)} dos clientes fizeram mais de um pedido. O segmento "${emRisco.segmento}" reúne ${fmt.int(emRisco.clientes)} clientes que gastaram em média ${fmt.moeda(emRisco.valor_medio)} e não voltaram: é o público natural de uma campanha de reativação.`),
      };
    }
    case "feira": {
      const p = X.pareto;
      return {
        pergunta: "Quem concentra a receita?",
        html: kpis([
          { rotulo: "Vendedores ativos", valor: fmt.int(p.vendedores), detalhe: "com ao menos uma venda válida" },
          { rotulo: "Top 10% dos vendedores", valor: fmt.pct(p.share_top10pct, 0), detalhe: "da receita", tom: "desce" },
          { rotulo: "Top 100 vendedores", valor: fmt.pct(p.share_top100, 0), detalhe: "da receita" },
          { rotulo: "Vendedores em SP", valor: fmt.pct(D.vendedores_estado[0].vendedores / p.vendedores, 0), detalhe: `${fmt.int(D.vendedores_estado[0].vendedores)} vendedores` },
        ]) + bloco("Concentração da receita", "fatia por grupo de vendedores", barras([
          { rotulo: "Top 10%", valor: p.share_top10pct, cor: "#EF4444" },
          { rotulo: "10% seguintes", valor: p.share_top20pct - p.share_top10pct, cor: "#F59E0B" },
          { rotulo: "Demais 80%", valor: 1 - p.share_top20pct, cor: "#94A3B8" },
        ], v => fmt.pct(v, 0)))
          + bloco("Receita por estado do vendedor", "top 8", barras(D.vendedores_estado.map(e => ({ rotulo: `${e.uf} · ${fmt.int(e.vendedores)} vend.`, valor: e.receita })), fmt.moedaCurta))
          + insight("Uma feira grande com poucas bancas cheias",
            `${fmt.int(Math.round(p.vendedores * 0.1))} vendedores (10%) fazem ${fmt.pct(p.share_top10pct, 0)} da receita, e os 80% menores somam só ${fmt.pct(1 - p.share_top20pct, 0)}. Perder um grande vendedor pesa mais que perder centenas de pequenos: vale um programa de retenção para o topo.`),
      };
    }
    case "banco": {
      const c = X.cartao, b = X.boleto;
      return {
        pergunta: "Como o cliente paga?",
        html: kpis([
          { rotulo: "Cartão de crédito", valor: fmt.pct(c.pedidos / X.totalPag, 0), detalhe: "dos pedidos" },
          { rotulo: "Boleto", valor: fmt.pct(b.pedidos / X.totalPag, 0), detalhe: "dos pedidos" },
          { rotulo: "Ticket no cartão", valor: fmt.moeda(c.ticket), detalhe: `boleto: ${fmt.moeda(b.ticket)}` },
          { rotulo: "Parcelas médias", valor: `${fmt.num(c.parcelas, 1)}x`, detalhe: "no cartão de crédito" },
        ]) + bloco("Forma de pagamento", "pedidos", barras(D.pagamentos.map(p => ({ rotulo: PAGAMENTO[p.tipo] || p.tipo, valor: p.pedidos })), fmt.int))
          + bloco("Parcelamento no cartão", "pedidos por faixa", colunas(D.parcelas.map(p => ({ rotulo: p.faixa, valor: p.pedidos })), fmt.milCurto))
          + insight("O cartão parcelado sustenta o ticket",
            `${fmt.pct(c.pedidos / X.totalPag, 0)} dos pedidos vão no cartão, com ticket ${fmt.pct(c.ticket / b.ticket - 1, 0)} maior que o do boleto e média de ${fmt.num(c.parcelas, 1)} parcelas. Condições de parcelamento são alavanca direta de receita.`),
      };
    }
    case "praca": {
      const f = X.atrasoFaixa;
      const noPrazo = f.filter(x => !/atraso/i.test(x.faixa)), atraso = f.filter(x => /atraso/i.test(x.faixa));
      const notaPrazo = soma(noPrazo, x => x.nota * x.pedidos) / soma(noPrazo, x => x.pedidos);
      const pior = f[f.length - 1];
      return {
        pergunta: "O que derruba a satisfação?",
        html: kpis([
          { rotulo: "Nota média", valor: fmt.num(k.nota, 2), detalhe: "de 1 a 5", serie: m.map(x => x.nota) },
          { rotulo: "Notas 5", valor: fmt.pct(X.share5, 0), detalhe: "das avaliações", tom: "sobe" },
          { rotulo: "Notas 1", valor: fmt.pct(X.share1, 0), detalhe: "das avaliações", tom: "desce" },
          { rotulo: "Nota com atraso", valor: fmt.num(soma(atraso, x => x.nota * x.pedidos) / soma(atraso, x => x.pedidos), 2), detalhe: `vs ${fmt.num(notaPrazo, 2)} no prazo`, tom: "desce" },
        ]) + bloco("Distribuição das notas", "avaliações", colunas(D.notas.map(n => ({ rotulo: "★".repeat(n.nota), valor: n.pedidos, cor: n.nota <= 2 ? "#EF4444" : n.nota === 3 ? "#F59E0B" : "#22C55E" })), fmt.milCurto))
          + bloco("Nota por situação da entrega", "nota média", barras(f.map(x => ({ rotulo: x.faixa, valor: x.nota, cor: /atraso/i.test(x.faixa) ? "#EF4444" : "#22C55E" })), v => fmt.num(v, 2)))
          + insight("O atraso derruba a nota",
            `Entregue no prazo, a nota média é ${fmt.num(notaPrazo, 2)}. Com ${pior.faixa.toLowerCase()}, cai para ${fmt.num(pior.nota, 2)} e ${fmt.num(pior.pct_negativa, 0)}% das avaliações são negativas. Cumprir o prazo protege a nota diretamente.`),
      };
    }
  }
  return { pergunta: "", html: "" };
}

export function kpisTopo(D, X) {
  const k = X.k;
  return [
    { rotulo: "Receita", valor: fmt.moedaCurta(k.receita), extra: `${fmt.sinal(X.varYtd, 0)} jan–ago`, tom: "sobe" },
    { rotulo: "Pedidos", valor: fmt.int(k.pedidos) },
    { rotulo: "Clientes", valor: fmt.int(k.clientes) },
    { rotulo: "Nota média", valor: fmt.num(k.nota, 2) },
    { rotulo: "% atraso", valor: fmt.pct(k.pct_atraso) },
  ];
}

export function insightsLetreiro(D, X) {
  const p = X.pareto, top = X.estadosAtraso[0];
  const f = X.atrasoFaixa, pior = f[f.length - 1];
  return [
    `Receita jan–ago/18 <b>${fmt.sinal(X.varYtd, 0)}</b> sobre jan–ago/17`,
    `Recorde: <b>${rotMes(X.pico.mes)}</b> (Black Friday) com <b>${fmt.moedaCurta(X.pico.receita)}</b>`,
    `Com ${pior.faixa.toLowerCase()}, a nota cai para <b>${fmt.num(pior.nota, 2)}</b>`,
    `<b>10%</b> dos vendedores concentram <b>${fmt.pct(p.share_top10pct, 0)}</b> da receita`,
    `Só <b>${fmt.pct(X.recompra.taxa)}</b> dos clientes compraram mais de uma vez`,
    `Cartão de crédito em <b>${fmt.pct(X.cartao.pedidos / X.totalPag, 0)}</b> dos pedidos, média de ${fmt.num(X.cartao.parcelas, 1)} parcelas`,
    `${top.uf}: <b>${fmt.pct(top.pct_atraso, 0)}</b> de entregas atrasadas, contra ${fmt.pct(X.sp.pct_atraso, 0)} em SP`,
    `${D.categorias[0].categoria} lidera com <b>${fmt.moedaCurta(D.categorias[0].receita)}</b>`,
    `Dados: Databricks gold · ${fmt.int(X.k.pedidos)} pedidos válidos · atualizado em ${D.geradoEm.split("-").reverse().join("/")}`,
  ];
}

export function textoOutdoor(D, X) {
  return `Recorde ${rotMes(X.pico.mes)}: ${fmt.moedaCurta(X.pico.receita)}`;
}

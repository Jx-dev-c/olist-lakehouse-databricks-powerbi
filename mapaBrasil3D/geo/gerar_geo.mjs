// Converte a malha de UFs do IBGE (GeoJSON, qualidade mínima) em src/geo.ts,
// já projetada num plano (equiretangular corrigida pela latitude central).
// Fonte: https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=UF&formato=application/vnd.geo%2Bjson&qualidade=minima
// Uso: node geo/gerar_geo.mjs
import { readFileSync, writeFileSync } from "node:fs";

const UFS = {
    11: ["RO", "Rondônia"], 12: ["AC", "Acre"], 13: ["AM", "Amazonas"], 14: ["RR", "Roraima"],
    15: ["PA", "Pará"], 16: ["AP", "Amapá"], 17: ["TO", "Tocantins"],
    21: ["MA", "Maranhão"], 22: ["PI", "Piauí"], 23: ["CE", "Ceará"], 24: ["RN", "Rio Grande do Norte"],
    25: ["PB", "Paraíba"], 26: ["PE", "Pernambuco"], 27: ["AL", "Alagoas"], 28: ["SE", "Sergipe"], 29: ["BA", "Bahia"],
    31: ["MG", "Minas Gerais"], 32: ["ES", "Espírito Santo"], 33: ["RJ", "Rio de Janeiro"], 35: ["SP", "São Paulo"],
    41: ["PR", "Paraná"], 42: ["SC", "Santa Catarina"], 43: ["RS", "Rio Grande do Sul"],
    50: ["MS", "Mato Grosso do Sul"], 51: ["MT", "Mato Grosso"], 52: ["GO", "Goiás"], 53: ["DF", "Distrito Federal"]
};
const REGIOES = { 1: "Norte", 2: "Nordeste", 3: "Sudeste", 4: "Sul", 5: "Centro-Oeste" };

const LON0 = -53, LAT0 = -15, K = Math.cos(LAT0 * Math.PI / 180);
const proj = ([lon, lat]) => [+((lon - LON0) * K).toFixed(2), +(lat - LAT0).toFixed(2)];

// centroide por área (fórmula do polígono) do maior anel externo, para posicionar o rótulo
function centroide(anel) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < anel.length; i++) {
        const [x0, y0] = anel[i], [x1, y1] = anel[(i + 1) % anel.length];
        const f = x0 * y1 - x1 * y0;
        a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
    return { area: Math.abs(a / 2), c: [+(cx / (3 * a)).toFixed(2), +(cy / (3 * a)).toFixed(2)] };
}

const src = JSON.parse(readFileSync(new URL("./ibge_uf_minima.json", import.meta.url), "utf8"));
const saida = src.features.map(f => {
    const cod = +f.properties.codarea;
    const [uf, nome] = UFS[cod];
    const poligonos = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const aneis = poligonos.map(p => p.map(anel => {
        const pts = anel.map(proj);
        const [a, b] = [pts[0], pts[pts.length - 1]];
        if (a[0] === b[0] && a[1] === b[1]) pts.pop();
        return pts;
    }));
    const maior = aneis.map(p => centroide(p[0])).sort((x, y) => y.area - x.area)[0];
    return { uf, nome, regiao: REGIOES[Math.floor(cod / 10)], centro: maior.c, poligonos: aneis.map(p => p.map(a => a.flat())) };
}).sort((a, b) => a.uf.localeCompare(b.uf));

const ts = `// Gerado por geo/gerar_geo.mjs a partir da malha de UFs do IBGE. Não editar à mão.
// Coordenadas projetadas: x = (lon ${LON0}) * cos(${LAT0}°), y = lat - (${LAT0}); 1 unidade ≈ 111 km.
export interface UfGeo {
    uf: string;
    nome: string;
    regiao: string;
    centro: [number, number];
    /** polígonos → anéis (o primeiro é o contorno, os demais são buracos) → [x0, y0, x1, y1, ...] */
    poligonos: number[][][];
}

export const UFS: UfGeo[] = ${JSON.stringify(saida)};
`;
writeFileSync(new URL("../src/geo.ts", import.meta.url), ts);
console.log(`ok: ${saida.length} UFs, ${(ts.length / 1024).toFixed(0)} KB`);

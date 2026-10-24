// @ts-nocheck
// Mesma cena da versão web (olist-city/src/cena.js): manter as duas em sincronia.
// Construção da cidade: terreno, ruas, prédios (um por área do negócio), decoração e tudo que se move.
// Tudo é geometria simples gerada em código (sem modelos externos): leve e sem problema de licença.
import * as THREE from "three";

// ---------- aleatório com semente: a cidade sai igual em todo carregamento ----------
let semente = 20180901;
function aleatorio() {
  semente = (semente + 0x6D2B79F5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entre = (a, b) => a + (b - a) * aleatorio();
const escolher = lista => lista[Math.floor(aleatorio() * lista.length)];

// materiais que mudam no modo noite
export const noturnos = { janelas: [], placas: [], lampadas: [] };

const cacheMat = new Map();
function mat(cor, extra) {
  if (extra) return new THREE.MeshStandardMaterial({ color: cor, roughness: 0.82, metalness: 0, ...extra });
  if (!cacheMat.has(cor)) cacheMat.set(cor, new THREE.MeshStandardMaterial({ color: cor, roughness: 0.82, metalness: 0 }));
  return cacheMat.get(cor);
}
// sem mapa de ambiente, metal puro fica escuro: pouca metalicidade + brilho próprio
const ouro = new THREE.MeshStandardMaterial({ color: "#FCD34D", roughness: 0.35, metalness: 0.25, emissive: "#F59E0B", emissiveIntensity: 0.35 });
const agua = new THREE.MeshStandardMaterial({ color: "#38BDF8", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88, emissive: "#0EA5E9", emissiveIntensity: 0.15 });
const vidroCupula = new THREE.MeshStandardMaterial({ color: "#BAE6FD", roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 });

function sombra(m) { m.castShadow = true; m.receiveShadow = true; return m; }
function caixa(pai, w, h, d, material, x = 0, y = 0, z = 0) {
  const m = sombra(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof material === "string" ? mat(material) : material));
  m.position.set(x, y + h / 2, z);
  pai.add(m);
  return m;
}
function cil(pai, rTopo, rBase, h, material, x = 0, y = 0, z = 0, seg = 16) {
  const m = sombra(new THREE.Mesh(new THREE.CylinderGeometry(rTopo, rBase, h, seg), typeof material === "string" ? mat(material) : material));
  m.position.set(x, y + h / 2, z);
  pai.add(m);
  return m;
}
function bola(pai, r, material, x, y, z, detalhe = 0) {
  const m = sombra(new THREE.Mesh(new THREE.IcosahedronGeometry(r, detalhe), typeof material === "string" ? mat(material, { flatShading: true }) : material));
  m.position.set(x, y, z);
  pai.add(m);
  return m;
}
// telhado de duas águas; eixo = direção da cumeeira
function prisma(pai, larg, alt, prof, material, x, y, z, eixo = "x") {
  const comp = eixo === "x" ? larg : prof, base = eixo === "x" ? prof : larg;
  const forma = new THREE.Shape();
  forma.moveTo(-base / 2, 0); forma.lineTo(base / 2, 0); forma.lineTo(0, alt); forma.lineTo(-base / 2, 0);
  const geo = new THREE.ExtrudeGeometry(forma, { depth: comp, bevelEnabled: false });
  geo.translate(0, 0, -comp / 2);
  if (eixo === "x") geo.rotateY(Math.PI / 2);
  const m = sombra(new THREE.Mesh(geo, typeof material === "string" ? mat(material) : material));
  m.position.set(x, y, z);
  pai.add(m);
  return m;
}

// ---------- texturas desenhadas em canvas ----------
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
function textura(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// fachada com janelas: o mapa de emissão acende parte das janelas à noite
function fachada(colunas, andares, parede, vidro) {
  const cw = 32, ch = 32;
  const [c, g] = canvas(colunas * cw, andares * ch);
  const [e, ge] = canvas(colunas * cw, andares * ch);
  g.fillStyle = parede; g.fillRect(0, 0, c.width, c.height);
  ge.fillStyle = "#000"; ge.fillRect(0, 0, e.width, e.height);
  for (let j = 0; j < andares; j++) for (let i = 0; i < colunas; i++) {
    const x = i * cw + 6, y = j * ch + 7, w = cw - 12, h = ch - 13;
    g.fillStyle = vidro; g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(255,255,255,.38)"; g.fillRect(x, y, w, 3);
    if (aleatorio() < 0.6) { ge.fillStyle = escolher(["#FFE7A3", "#FFD27A", "#FFF3C4"]); ge.fillRect(x, y, w, h); }
  }
  const m = new THREE.MeshStandardMaterial({ map: textura(c), emissiveMap: textura(e), emissive: "#FFFFFF", emissiveIntensity: 0, roughness: 0.55 });
  noturnos.janelas.push(m);
  return m;
}
function predio(pai, w, h, d, { parede, vidro, teto, andar = 1.3, coluna = 1.3 }, x = 0, y = 0, z = 0) {
  const andares = Math.max(1, Math.round(h / andar));
  const lado = fachada(Math.max(1, Math.round(d / coluna)), andares, parede, vidro);
  const frente = fachada(Math.max(1, Math.round(w / coluna)), andares, parede, vidro);
  const topo = mat(teto);
  return caixa(pai, w, h, d, [lado, lado, topo, topo, frente, frente], x, y, z);
}

// placa com texto (brilha à noite)
function placa(pai, texto, { w, h, fundo = "#FFFFFF", cor = "#0F172A", peso = 800, borda = null }, x, y, z, rotY = 0) {
  const pxW = 512, pxH = Math.round(512 * h / w);
  const [c, g] = canvas(pxW, pxH);
  const r = Math.min(pxH * 0.25, 40);
  g.fillStyle = fundo;
  g.beginPath(); g.roundRect(0, 0, pxW, pxH, r); g.fill();
  if (borda) { g.lineWidth = 8; g.strokeStyle = borda; g.beginPath(); g.roundRect(4, 4, pxW - 8, pxH - 8, r); g.stroke(); }
  let tam = pxH * 0.62;
  g.font = `${peso} ${tam}px Inter, Segoe UI, sans-serif`;
  while (g.measureText(texto).width > pxW * 0.88 && tam > 8) { tam -= 2; g.font = `${peso} ${tam}px Inter, Segoe UI, sans-serif`; }
  g.fillStyle = cor; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(texto, pxW / 2, pxH / 2 + tam * 0.04);
  const t = textura(c);
  const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: "#FFFFFF", emissiveIntensity: 0.08, roughness: 0.5, transparent: true });
  noturnos.placas.push(m);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  p.position.set(x, y, z); p.rotation.y = rotY;
  pai.add(p);
  return p;
}

function listras(cor1, cor2, n = 6) {
  const [c, g] = canvas(256, 64);
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? cor2 : cor1; g.fillRect(i * 256 / n, 0, 256 / n + 1, 64); }
  return new THREE.MeshStandardMaterial({ map: textura(c), roughness: 0.8 });
}

// ---------- peças pequenas ----------
const VERDES = ["#4ADE80", "#22C55E", "#86EFAC", "#16A34A", "#65A30D"];
function arvore(pai, x, z, esc = 1, y = 0) {
  const g = new THREE.Group();
  cil(g, 0.1, 0.14, 0.7, "#92400E", 0, 0, 0, 6);
  const verde = escolher(VERDES);
  if (aleatorio() < 0.3) {
    // pinheiro
    const c = sombra(new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.8, 7), mat(verde, { flatShading: true })));
    c.position.y = 1.5; g.add(c);
  } else {
    bola(g, 0.75, mat(verde, { flatShading: true }), 0, 1.35, 0);
    if (aleatorio() < 0.5) bola(g, 0.45, mat(verde, { flatShading: true }), 0.3, 1.95, 0.1);
  }
  g.position.set(x, y, z); g.scale.setScalar(esc); g.rotation.y = entre(0, Math.PI);
  pai.add(g);
  return g;
}
const matLampada = new THREE.MeshStandardMaterial({ color: "#FEF3C7", emissive: "#FDE68A", emissiveIntensity: 0.1 });
noturnos.lampadas.push(matLampada);
function poste(pai, x, z, y = 0) {
  cil(pai, 0.05, 0.07, 2.2, "#334155", x, y, z, 6);
  const l = sombra(new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), matLampada));
  l.position.set(x, y + 2.3, z); pai.add(l);
}
function banco(pai, x, z, rot) {
  const g = new THREE.Group();
  caixa(g, 1.2, 0.1, 0.42, "#B45309", 0, 0.32, 0);
  caixa(g, 1.2, 0.35, 0.08, "#B45309", 0, 0.42, -0.2);
  caixa(g, 0.08, 0.32, 0.4, "#334155", -0.5, 0, 0);
  caixa(g, 0.08, 0.32, 0.4, "#334155", 0.5, 0, 0);
  g.position.set(x, 0, z); g.rotation.y = rot; pai.add(g);
}

export function carro(cor) {
  const g = new THREE.Group();
  caixa(g, 1.5, 0.42, 0.74, mat(cor, { roughness: 0.35, metalness: 0.3 }), 0, 0.16, 0);
  caixa(g, 0.82, 0.34, 0.66, "#1E293B", -0.08, 0.58, 0);
  caixa(g, 0.1, 0.1, 0.18, "#FEF9C3", 0.76, 0.32, 0.22);
  caixa(g, 0.1, 0.1, 0.18, "#FEF9C3", 0.76, 0.32, -0.22);
  for (const [x, z] of [[0.48, 0.36], [-0.48, 0.36], [0.48, -0.36], [-0.48, -0.36]]) {
    const r = cil(g, 0.17, 0.17, 0.12, "#111827", x, 0, z, 10);
    r.rotation.x = Math.PI / 2; r.position.y = 0.17;
  }
  return g;
}
export function caminhao(cor) {
  const g = new THREE.Group();
  caixa(g, 0.85, 0.95, 0.86, mat(cor, { roughness: 0.4, metalness: 0.2 }), 1.15, 0.2, 0);
  caixa(g, 0.1, 0.36, 0.7, "#1E293B", 1.58, 0.68, 0);
  caixa(g, 2.3, 1.25, 0.92, "#F8FAFC", -0.5, 0.22, 0);
  caixa(g, 2.32, 0.18, 0.94, mat(cor), -0.5, 1.0, 0);
  for (const [x, z] of [[1.1, 0.42], [-1.2, 0.42], [1.1, -0.42], [-1.2, -0.42], [-0.4, 0.42], [-0.4, -0.42]]) {
    const r = cil(g, 0.2, 0.2, 0.14, "#111827", x, 0, z, 10);
    r.rotation.x = Math.PI / 2; r.position.y = 0.2;
  }
  return g;
}
const PELE = ["#FDE68A", "#F5D0A9", "#D6A77A", "#A16207", "#7C4A2D"];
const ROUPA = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#0EA5E9", "#F97316", "#FFFFFF"];
function pessoa() {
  const g = new THREE.Group();
  cil(g, 0.13, 0.16, 0.5, escolher(ROUPA), 0, 0.12, 0, 8);
  cil(g, 0.06, 0.06, 0.14, "#334155", -0.06, 0, 0, 5);
  cil(g, 0.06, 0.06, 0.14, "#334155", 0.06, 0, 0, 5);
  bola(g, 0.12, mat(escolher(PELE), { flatShading: true }), 0, 0.76, 0, 1);
  return g;
}

function instanciado(pai, geo, material, posicoes, rotY = 0) {
  const im = new THREE.InstancedMesh(geo, material, posicoes.length);
  const d = new THREE.Object3D();
  posicoes.forEach((p, i) => { d.position.set(...p); d.rotation.set(0, p[3] ?? rotY, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
  im.receiveShadow = true;
  pai.add(im);
  return im;
}

// ---------- prédios ----------
function torre(g, a) {
  caixa(g, 14, 0.12, 14, "#E2E8F0");
  predio(g, 11, 2.4, 11, { parede: "#E2E8F0", vidro: "#93C5FD", teto: "#CBD5E1", andar: 1.2 }, 0, 0.12, 0);
  predio(g, 6.4, 12, 6.4, { parede: "#4338CA", vidro: "#C7D2FE", teto: "#312E81" }, 0, 2.52, 0);
  caixa(g, 7, 0.6, 7, "#312E81", 0, 14.52, 0);
  caixa(g, 5.2, 1, 5.2, "#6366F1", 0, 15.12, 0);
  cil(g, 1.7, 1.7, 0.06, "#1F2937", 0, 16.12, 0, 28);
  const h = placa(g, "H", { w: 1.6, h: 1.6, fundo: "rgba(0,0,0,0)", cor: "#FDE047" }, 0, 16.2, 0);
  h.rotation.x = -Math.PI / 2;
  cil(g, 0.05, 0.07, 2.6, "#CBD5E1", 2.2, 16.12, -2.2, 6);
  const luz = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: "#EF4444" }));
  luz.position.set(2.2, 18.8, -2.2); g.add(luz);
  a.push((dt, t) => { luz.visible = Math.sin(t * 3) > 0; });
  placa(g, "olist", { w: 4.6, h: 1.3, fundo: "#FFFFFF", cor: "#1E3A8A" }, 0, 13.4, 3.23);
  placa(g, "olist", { w: 4.6, h: 1.3, fundo: "#FFFFFF", cor: "#1E3A8A" }, 3.23, 13.4, 0, Math.PI / 2);
  caixa(g, 4, 0.2, 1.6, "#FFFFFF", 0, 2.2, 6.2);
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6.3], [6, 6.3]]) arvore(g, x, z, 0.9, 0.12);
  for (const x of [-2.2, 2.2]) { cil(g, 0.04, 0.04, 3.2, "#94A3B8", x, 0.12, 6.6, 6); caixa(g, 0.9, 0.55, 0.03, x < 0 ? "#22C55E" : "#2563EB", x + 0.47, 2.7, 6.6); }
  return 19.2;
}

function shopping(g, a, pessoas) {
  caixa(g, 15, 0.1, 15, "#E7E5E4");
  predio(g, 13, 3.4, 9, { parede: "#F97316", vidro: "#BAE6FD", teto: "#C2410C", andar: 1.7, coluna: 1.6 }, 0, 0.1, -1.5);
  predio(g, 10, 2.4, 6.4, { parede: "#FDBA74", vidro: "#E0F2FE", teto: "#EA580C", andar: 1.2 }, 0, 3.5, -2);
  const cupula = sombra(new THREE.Mesh(new THREE.SphereGeometry(1.8, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), vidroCupula));
  cupula.position.set(-2, 5.9, -2); g.add(cupula);
  for (const [x, z] of [[2.5, -3.5], [3.6, -3.5], [2.5, -0.8]]) caixa(g, 0.8, 0.5, 0.8, "#CBD5E1", x, 5.9, z);
  placa(g, "SHOPPING OLIST", { w: 7, h: 1.1, fundo: "#FFFFFF", cor: "#EA580C" }, 0, 4.7, 1.23);
  caixa(g, 6, 0.22, 1.8, "#FFFFFF", 0, 2.3, 3.8);
  for (const x of [-2.8, 2.8]) cil(g, 0.06, 0.06, 2.2, "#E2E8F0", x, 0.1, 4.5, 6);
  const cores = ["#EC4899", "#8B5CF6", "#06B6D4", "#FACC15"];
  [-5.6, -4.2, 4.2, 5.6].forEach((x, i) => caixa(g, 0.8, 2, 0.06, cores[i], x, 1, 3.04));
  for (const x of [-6.2, -3.4, 3.4, 6.2]) arvore(g, x, 6.4, 0.85, 0.1);
  for (let i = 0; i < 8; i++) {
    const p = pessoa(); g.add(p);
    pessoas.push({ obj: p, tipo: "linha", a: new THREE.Vector3(-6, 0.1, 5.2 + entre(-0.6, 0.6)), b: new THREE.Vector3(6, 0.1, 5.2 + entre(-0.6, 0.6)), t: aleatorio(), vel: entre(0.05, 0.09) });
  }
  return 8;
}

function banco_(g, a) {
  caixa(g, 11, 0.25, 9.6, "#E7E5E4");
  caixa(g, 10.2, 0.25, 8.8, "#F5F5F4", 0, 0.25, -0.1);
  caixa(g, 9.4, 0.25, 8, "#FAFAF9", 0, 0.5, -0.2);
  predio(g, 8.4, 4, 5.8, { parede: "#F5EEDC", vidro: "#7DD3FC", teto: "#D6CBB3", andar: 2, coluna: 1.4 }, 0, 0.75, -1);
  for (let i = 0; i < 6; i++) cil(g, 0.26, 0.3, 3.6, "#FFFBEB", -3.5 + i * 1.4, 0.75, 2.75, 14);
  caixa(g, 9, 0.5, 1.6, "#F5EEDC", 0, 4.35, 2.4);
  caixa(g, 9, 0.35, 7.4, "#E7DFC9", 0, 4.75, -0.6);
  prisma(g, 9, 1.5, 7.4, mat("#F5EEDC"), 0, 5.1, -0.6, "z");
  placa(g, "BANCO OLIST", { w: 5.2, h: 0.42, fundo: "#14532D", cor: "#FDE68A" }, 0, 4.6, 3.21);
  const moeda = sombra(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.22, 32), ouro));
  moeda.rotation.x = Math.PI / 2; moeda.position.set(0, 8.2, 0); g.add(moeda);
  const cifrao = placa(g, "R$", { w: 1.3, h: 1.3, fundo: "rgba(0,0,0,0)", cor: "#92400E" }, 0, 0, 0.12);
  cifrao.rotation.x = -Math.PI / 2; moeda.add(cifrao);
  const cifrao2 = cifrao.clone(); cifrao2.position.y = -0.12; cifrao2.rotation.x = Math.PI / 2; cifrao2.rotation.z = Math.PI; moeda.add(cifrao2);
  a.push((dt, t) => { moeda.rotation.z = t * 1.2; moeda.position.y = 8.2 + Math.sin(t * 1.6) * 0.18; });
  for (const [x, z] of [[-5.6, 4.6], [5.6, 4.6], [-5.6, -5.4], [5.6, -5.4]]) arvore(g, x, z, 0.9, 0);
  return 9.4;
}

function feira(g, a, pessoas) {
  caixa(g, 15, 0.1, 15, "#E8DCC6");
  const cores = [["#EF4444", "#FFFFFF"], ["#F59E0B", "#FFFFFF"], ["#2563EB", "#FFFFFF"], ["#10B981", "#FFFFFF"], ["#8B5CF6", "#FFFFFF"], ["#EC4899", "#FFFFFF"]];
  let k = 0;
  for (const z of [-4.4, 0, 4.4]) for (const x of [-4.4, 0, 4.4]) {
    const b = new THREE.Group();
    caixa(b, 2.6, 0.7, 1.3, "#A16207", 0, 0.1, 0);
    for (const [px, pz] of [[-1.3, -0.75], [1.3, -0.75], [-1.3, 0.75], [1.3, 0.75]]) cil(b, 0.04, 0.04, 2.1, "#475569", px, 0.1, pz, 5);
    const [c1, c2] = cores[k++ % cores.length];
    const toldo = caixa(b, 3, 0.1, 1.9, listras(c1, c2), 0, 2.15, 0);
    toldo.rotation.x = 0.16;
    for (let i = 0; i < 6; i++) bola(b, 0.15, escolher(["#EF4444", "#F97316", "#FACC15", "#84CC16", "#A855F7"]), -1 + i * 0.4, 0.95, entre(-0.25, 0.25));
    b.position.set(x, 0, z);
    g.add(b);
    const v = pessoa(); v.position.set(x + entre(-0.6, 0.6), 0.1, z - 1.1); g.add(v);
    a.push((dt, t) => { v.position.y = 0.1 + Math.abs(Math.sin(t * 2 + x + z)) * 0.05; });
  }
  // portal de entrada
  for (const x of [-3.2, 3.2]) cil(g, 0.18, 0.18, 3.2, "#7C2D12", x, 0.1, 6.9, 8);
  caixa(g, 7, 0.35, 0.35, "#7C2D12", 0, 3.2, 6.9);
  placa(g, "FEIRA DOS VENDEDORES", { w: 5.6, h: 0.7, fundo: "#FEF3C7", cor: "#9A3412" }, 0, 3.05, 7.1);
  for (let i = 0; i < 7; i++) {
    const p = pessoa(); g.add(p);
    const z = escolher([-2.2, 2.2]);
    pessoas.push({ obj: p, tipo: "linha", a: new THREE.Vector3(-6.5, 0.1, z + entre(-0.4, 0.4)), b: new THREE.Vector3(6.5, 0.1, z + entre(-0.4, 0.4)), t: aleatorio(), vel: entre(0.04, 0.08) });
  }
  return 4.2;
}

function bairro(g) {
  caixa(g, 15, 0.1, 15, "#BBF7D0");
  caixa(g, 15, 0.11, 1.4, "#E7E5E4", 0, 0, 0);
  const paredes = ["#FCA5A5", "#FDE68A", "#A7F3D0", "#BFDBFE", "#DDD6FE", "#FBCFE8"];
  const telhados = ["#B91C1C", "#7C2D12", "#1E3A8A", "#9A3412", "#4C1D95", "#065F46"];
  let i = 0;
  for (const z of [-3.9, 3.9]) for (const x of [-4.8, 0, 4.8]) {
    const casa = new THREE.Group();
    const w = entre(2.8, 3.3), d = entre(2.4, 2.8), h = entre(1.7, 2.2);
    caixa(casa, w, h, d, paredes[i], 0, 0.1, 0);
    prisma(casa, w + 0.4, 1.2, d + 0.4, mat(telhados[i]), 0, h + 0.1, 0, "x");
    const frente = z < 0 ? 1 : -1;
    caixa(casa, 0.6, 1.1, 0.06, "#78350F", 0, 0.1, frente * (d / 2 + 0.02));
    for (const wx of [-w / 3.2, w / 3.2]) caixa(casa, 0.5, 0.5, 0.06, "#E0F2FE", wx, 0.9, frente * (d / 2 + 0.02));
    if (aleatorio() < 0.6) caixa(casa, 0.35, 0.8, 0.35, "#57534E", w / 4, h + 0.5, 0);
    casa.position.set(x, 0, z);
    g.add(casa);
    i++;
  }
  // cerca e árvores entre as casas
  const geoCerca = new THREE.BoxGeometry(0.08, 0.4, 0.08);
  const pos = [];
  for (let x = -7; x <= 7; x += 0.5) { pos.push([x, 0.3, -7]); pos.push([x, 0.3, 7]); }
  instanciado(g, geoCerca, mat("#FFFFFF"), pos);
  for (const x of [-2.4, 2.4]) for (const z of [-5.8, 5.8]) arvore(g, x, z, 0.75, 0.1);
  caixa(g, 1.6, 0.12, 1.1, agua, 6.1, 0.1, -5.8);
  return 4.5;
}

function galpao(g, a) {
  caixa(g, 15, 0.1, 15, "#CBD5E1");
  const [c, ctx] = canvas(512, 128);
  ctx.fillStyle = "#94A3B8"; ctx.fillRect(0, 0, 512, 128);
  for (let x = 0; x < 512; x += 8) { ctx.fillStyle = x % 16 ? "#A5B4C4" : "#8796AA"; ctx.fillRect(x, 0, 4, 128); }
  const parede = new THREE.MeshStandardMaterial({ map: textura(c), roughness: 0.7 });
  caixa(g, 12, 4, 8, parede, 0, 0.1, -2);
  const geo = new THREE.CylinderGeometry(4, 4, 12.2, 28, 1, false, 0, Math.PI);
  geo.rotateZ(Math.PI / 2); geo.scale(1, 0.42, 1);
  const teto = sombra(new THREE.Mesh(geo, mat("#475569")));
  teto.position.set(0, 4.1, -2); g.add(teto);
  for (const x of [-4, 0, 4]) {
    caixa(g, 2.2, 2.6, 0.08, "#334155", x, 0.1, 2.02);
    caixa(g, 2.2, 0.16, 0.1, listras("#FACC15", "#111827", 10), x, 2.7, 2.04);
  }
  placa(g, "OLIST LOG", { w: 4.4, h: 0.8, fundo: "#1D4ED8", cor: "#FFFFFF" }, -2, 3.45, 2.07);
  const tc = ["#2563EB", "#0EA5E9"];
  [-4, 4].forEach((x, i) => { const t = caminhao(tc[i]); t.rotation.y = -Math.PI / 2; t.position.set(x, 0.1, 4.6); g.add(t); });
  for (let i = 0; i < 9; i++) caixa(g, 0.6, 0.5, 0.6, "#D6A770", 5.4 + (i % 3) * 0.65, 0.1 + Math.floor(i / 3) * 0.5, 4.2 + (i % 2) * 0.1);
  // empilhadeira indo e voltando
  const emp = new THREE.Group();
  caixa(emp, 0.9, 0.6, 0.6, "#F59E0B", 0, 0.1, 0); caixa(emp, 0.1, 1.3, 0.5, "#1F2937", 0.5, 0.1, 0); caixa(emp, 0.5, 0.4, 0.5, "#D6A770", 0.8, 0.2, 0);
  g.add(emp);
  a.push((dt, t) => { const s = Math.sin(t * 0.6); emp.position.set(s * 2.2, 0, 3.4); emp.rotation.y = Math.cos(t * 0.6) > 0 ? 0 : Math.PI; });
  return 6.6;
}

function praca(g, a, pessoas) {
  caixa(g, 15, 0.1, 15, "#E2E8F0");
  for (const x of [-5.3, 5.3]) for (const z of [-5.3, 5.3]) { caixa(g, 4.4, 0.14, 4.4, "#86EFAC", x, 0.1, z); arvore(g, x, z, 1, 0.24); }
  cil(g, 6.2, 6.2, 0.05, "#F8FAFC", 0, 0.1, 0, 40);
  cil(g, 3, 3.2, 0.6, "#CBD5E1", 0, 0.1, 0, 32);
  const espelho = sombra(new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.75, 0.06, 32), agua));
  espelho.position.set(0, 0.62, 0); g.add(espelho);
  cil(g, 0.45, 0.7, 2.6, "#E2E8F0", 0, 0.1, 0, 16);
  // estrela dourada: a nota média da plataforma
  const forma = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.55 : 1.3, ang = Math.PI / 2 + i * Math.PI / 5;
    i ? forma.lineTo(Math.cos(ang) * r, Math.sin(ang) * r) : forma.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
  }
  const geo = new THREE.ExtrudeGeometry(forma, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 });
  geo.center();
  const estrela = sombra(new THREE.Mesh(geo, ouro));
  estrela.position.set(0, 4.2, 0); g.add(estrela);
  a.push((dt, t) => { estrela.rotation.y = t * 0.9; estrela.position.y = 4.2 + Math.sin(t * 1.4) * 0.2; });
  // jatos d'água
  const n = 160, pos = new Float32Array(n * 3), fase = Array.from({ length: n }, () => aleatorio()), angs = Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2);
  const geoAgua = new THREE.BufferGeometry(); geoAgua.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const jatos = new THREE.Points(geoAgua, new THREE.PointsMaterial({ color: "#E0F2FE", size: 0.13, transparent: true, opacity: 0.9 }));
  g.add(jatos);
  a.push((dt, t) => {
    for (let i = 0; i < n; i++) {
      const s = (fase[i] + t * 0.45) % 1, r = 2.5 - s * 1.7;
      pos[i * 3] = Math.cos(angs[i]) * r; pos[i * 3 + 1] = 0.7 + Math.sin(s * Math.PI) * 1.6; pos[i * 3 + 2] = Math.sin(angs[i]) * r;
    }
    geoAgua.attributes.position.needsUpdate = true;
  });
  for (let i = 0; i < 6; i++) { const ang = (i / 6) * Math.PI * 2 + Math.PI / 6; banco(g, Math.cos(ang) * 4.7, Math.sin(ang) * 4.7, -ang - Math.PI / 2); }
  for (const ang of [0.785, 2.356, 3.927, 5.498]) poste(g, Math.cos(ang) * 5.6, Math.sin(ang) * 5.6, 0.1);
  for (let i = 0; i < 14; i++) {
    const p = pessoa(); g.add(p);
    pessoas.push({ obj: p, tipo: "circulo", raio: entre(3.6, 4.1), ang: entre(0, Math.PI * 2), vel: entre(0.12, 0.22) * (aleatorio() < 0.5 ? 1 : -1) });
  }
  return 5.4;
}

// ---------- decoração: parque e estacionamento com outdoor ----------
function parque(g) {
  caixa(g, 15, 0.12, 15, "#86EFAC");
  const lago = sombra(new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.08, 28), agua));
  lago.scale.z = 0.7; lago.position.set(1.5, 0.14, 1); g.add(lago);
  caixa(g, 1.2, 0.1, 15, "#E7D9C3", -3.2, 0.12, 0);
  for (let i = 0; i < 16; i++) {
    let x, z;
    do { x = entre(-6.6, 6.6); z = entre(-6.6, 6.6); } while ((Math.hypot(x - 1.5, (z - 1) / 0.7) < 3.4) || Math.abs(x + 3.2) < 1);
    arvore(g, x, z, entre(0.8, 1.15), 0.12);
  }
  for (const z of [-4, 4]) banco(g, -2.2, z, -Math.PI / 2);
}
function estacionamento(g, textoOutdoor) {
  caixa(g, 15, 0.1, 15, "#64748B");
  const linhas = [];
  for (let x = -6; x <= 6; x += 2) { linhas.push([x, 0.11, -4.5]); linhas.push([x, 0.11, 0.5]); }
  instanciado(g, new THREE.BoxGeometry(0.08, 0.02, 2.2), mat("#F8FAFC"), linhas);
  for (let i = 0; i < 9; i++) {
    const c = carro(escolher(["#EF4444", "#FACC15", "#F8FAFC", "#1E293B", "#3B82F6", "#10B981"]));
    c.rotation.y = Math.PI / 2 * (aleatorio() < 0.5 ? 1 : -1);
    c.position.set(-5 + Math.floor(aleatorio() * 6) * 2, 0.1, i % 2 ? -4.5 : 0.5);
    g.add(c);
  }
  // outdoor com o insight do pico
  const o = new THREE.Group();
  for (const x of [-2.4, 2.4]) cil(o, 0.12, 0.12, 3.4, "#334155", x, 0, 0, 8);
  caixa(o, 6.2, 2.1, 0.2, "#1E1B4B", 0, 3.2, -0.12);
  placa(o, textoOutdoor, { w: 5.9, h: 1.85, fundo: "#FDE68A", cor: "#7C2D12", borda: "#F59E0B" }, 0, 4.25, 0.0);
  o.position.set(1, 0.1, 4.4); o.rotation.y = Math.PI / 4;
  g.add(o);
  for (const x of [-6.4, 6.4]) arvore(g, x, 6.4, 0.85, 0.1);
}

// ---------- montagem ----------
export const QUADRA = 20; // distância entre centros de quadra
const BORDA = 31;

export function construirCidade(cena, predios, { textoOutdoor }) {
  const animaveis = [];
  const pessoas = [];
  const veiculos = [];
  const nuvens = [];

  // ilha
  caixa(cena, 66, 0.5, 66, "#A3E635", 0, -0.5, 0).receiveShadow = true;
  caixa(cena, 66, 2.2, 66, "#A16207", 0, -2.7, 0);
  caixa(cena, 66, 1.2, 66, "#78716C", 0, -3.9, 0);

  // ruas, faixas e cruzamentos
  const asfalto = mat("#3F4654");
  for (const c of [-10, 10]) {
    caixa(cena, 66, 0.05, 4, asfalto, 0, 0, c).castShadow = false;
    caixa(cena, 4, 0.052, 66, asfalto, c, 0, 0).castShadow = false;
  }
  const tracos = [], zebras = [];
  for (const c of [-10, 10]) for (let s = -32; s <= 32; s += 2) {
    if (Math.abs(Math.abs(s) - 10) < 3) continue;
    tracos.push([s, 0.06, c, 0]); tracos.push([c, 0.06, s, Math.PI / 2]);
  }
  for (const cx of [-10, 10]) for (const cz of [-10, 10]) for (let k = -1.6; k <= 1.6; k += 0.8) {
    zebras.push([cx + k, 0.061, cz + 2.6, 0]); zebras.push([cx + k, 0.061, cz - 2.6, 0]);
    zebras.push([cx + 2.6, 0.061, cz + k, Math.PI / 2]); zebras.push([cx - 2.6, 0.061, cz + k, Math.PI / 2]);
  }
  instanciado(cena, new THREE.BoxGeometry(0.9, 0.01, 0.12), mat("#F8FAFC"), tracos);
  instanciado(cena, new THREE.BoxGeometry(0.4, 0.01, 1.1), mat("#F8FAFC"), zebras);

  // quadras (calçada) e postes nas esquinas
  for (const qx of [-1, 0, 1]) for (const qz of [-1, 0, 1]) {
    const cx = qx * QUADRA, cz = qz * QUADRA;
    caixa(cena, 16, 0.2, 16, "#E5E7EB", cx, 0, cz);
    for (const [dx, dz] of [[-7.5, -7.5], [7.5, -7.5], [-7.5, 7.5], [7.5, 7.5]]) poste(cena, cx + dx, cz + dz, 0.2);
  }

  // árvores na borda da ilha
  for (let s = -30; s <= 30; s += 3.2) {
    if (Math.abs(Math.abs(s) - 10) < 3.2) continue;
    for (const [x, z] of [[s, -29.4], [s, 29.4], [-29.4, s], [29.4, s]]) arvore(cena, x + entre(-0.4, 0.4), z + entre(-0.4, 0.4), entre(0.7, 1), 0);
  }

  const construtores = { torre, shopping, banco: banco_, feira, bairro, galpao, praca };
  for (const p of predios) {
    const g = new THREE.Group();
    g.position.set(p.pos[0], 0.2, p.pos[1]);
    p.topo = construtores[p.id](g, animaveis, pessoas) + 1.6;
    g.traverse(o => { if (o.isMesh) o.userData.predio = p.id; });
    // anel de seleção no chão
    const anel = new THREE.Mesh(new THREE.RingGeometry(7.3, 7.75, 64), new THREE.MeshBasicMaterial({ color: p.cor, transparent: true, opacity: 0, depthWrite: false }));
    anel.rotation.x = -Math.PI / 2; anel.position.y = 0.06;
    g.add(anel);
    p.grupo = g; p.anel = anel;
    cena.add(g);
  }
  const deco1 = new THREE.Group(); deco1.position.set(-QUADRA, 0.2, QUADRA); parque(deco1); cena.add(deco1);
  const deco2 = new THREE.Group(); deco2.position.set(QUADRA, 0.2, QUADRA); estacionamento(deco2, textoOutdoor); cena.add(deco2);

  // trânsito: mão direita (Brasil)
  const coresCarro = ["#EF4444", "#3B82F6", "#FACC15", "#F8FAFC", "#10B981", "#F97316", "#8B5CF6", "#1E293B"];
  const faixas = [];
  for (const c of [-10, 10]) {
    faixas.push({ eixo: "x", linha: c + 1, sentido: 1 }, { eixo: "x", linha: c - 1, sentido: -1 });
    faixas.push({ eixo: "z", linha: c - 1, sentido: 1 }, { eixo: "z", linha: c + 1, sentido: -1 });
  }
  faixas.forEach((f, i) => {
    const qtd = i % 3 === 0 ? 2 : 1;
    for (let k = 0; k < qtd; k++) {
      const ehCaminhao = (i === 2 || i === 5) && k === 0;
      const obj = ehCaminhao ? caminhao(escolher(["#2563EB", "#0EA5E9"])) : carro(coresCarro[(i + k * 3) % coresCarro.length]);
      cena.add(obj);
      veiculos.push({ obj, ...f, pos: -BORDA + ((i * 7.3 + k * 31) % (2 * BORDA)), vel: ehCaminhao ? 3.2 : entre(4, 6.5) });
    }
  });

  // nuvens
  const matNuvem = new THREE.MeshStandardMaterial({ color: "#FFFFFF", roughness: 1, transparent: true, opacity: 0.92, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const n = new THREE.Group();
    for (let k = 0; k < 4; k++) bola(n, entre(1, 1.8), matNuvem, k * 1.4 - 2, entre(-0.2, 0.4), entre(-0.6, 0.6), 1).castShadow = false;
    // só atrás da ilha: viram céu e nunca cobrem um prédio
    n.position.set(entre(-50, 50), entre(18, 26), entre(-62, -42));
    n.userData.vel = entre(0.6, 1.2);
    cena.add(n); nuvens.push(n);
  }

  function atualizar(dt, t) {
    for (const f of animaveis) f(dt, t);
    for (const v of veiculos) {
      v.pos += v.vel * v.sentido * dt;
      if (v.pos > BORDA + 2) v.pos = -BORDA - 2;
      if (v.pos < -BORDA - 2) v.pos = BORDA + 2;
      v.obj.visible = Math.abs(v.pos) < BORDA;
      if (v.eixo === "x") { v.obj.position.set(v.pos, 0.02, v.linha); v.obj.rotation.y = v.sentido > 0 ? 0 : Math.PI; }
      else { v.obj.position.set(v.linha, 0.02, v.pos); v.obj.rotation.y = v.sentido > 0 ? -Math.PI / 2 : Math.PI / 2; }
    }
    for (const p of pessoas) {
      const passo = Math.abs(Math.sin(t * 9 + p.obj.id)) * 0.06;
      if (p.tipo === "circulo") {
        p.ang += p.vel * dt;
        p.obj.position.set(Math.cos(p.ang) * p.raio, 0.15 + passo, Math.sin(p.ang) * p.raio);
        p.obj.rotation.y = -p.ang + (p.vel > 0 ? Math.PI : 0);
      } else {
        p.t += p.vel * dt;
        const s = (p.t % 2) < 1 ? p.t % 1 : 1 - (p.t % 1);
        p.obj.position.lerpVectors(p.a, p.b, s); p.obj.position.y += passo;
        p.obj.rotation.y = (p.t % 2) < 1 ? -Math.PI / 2 : Math.PI / 2;
      }
    }
    for (const n of nuvens) { n.position.x += n.userData.vel * dt; if (n.position.x > 50) n.position.x = -50; }
  }
  return { atualizar };
}

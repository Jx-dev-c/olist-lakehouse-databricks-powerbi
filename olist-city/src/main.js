import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { construirCidade, noturnos } from "./cena.js";
import { conteudo, derivar, insightsLetreiro, kpisTopo, textoOutdoor } from "./painel.js";

// Cada prédio é uma área do negócio. pos = centro da quadra (x, z).
const PREDIOS = [
  { id: "torre", nome: "Torre Olist", curto: "Visão geral", area: "Visão geral", icone: "🏢", cor: "#6366F1", cor2: "#8B5CF6", pos: [0, 0], zoom: 1.7 },
  { id: "shopping", nome: "Shopping Olist", curto: "Vendas", area: "Vendas e produtos", icone: "🛍️", cor: "#F97316", cor2: "#EC4899", pos: [0, -20], zoom: 2.1 },
  { id: "galpao", nome: "Galpão Olist Log", curto: "Logística", area: "Logística", icone: "🚚", cor: "#2563EB", cor2: "#06B6D4", pos: [20, 0], zoom: 2.1 },
  { id: "bairro", nome: "Vila dos Clientes", curto: "Clientes", area: "Clientes", icone: "🏘️", cor: "#EC4899", cor2: "#A855F7", pos: [-20, 0], zoom: 2.2 },
  { id: "feira", nome: "Feira dos Vendedores", curto: "Vendedores", area: "Vendedores", icone: "🧺", cor: "#F59E0B", cor2: "#EF4444", pos: [-20, -20], zoom: 2.2 },
  { id: "banco", nome: "Banco Olist", curto: "Pagamentos", area: "Pagamentos", icone: "🏦", cor: "#059669", cor2: "#14B8A6", pos: [20, -20], zoom: 2.1 },
  { id: "praca", nome: "Praça das Avaliações", curto: "Avaliações", area: "Satisfação do cliente", icone: "⭐", cor: "#EAB308", cor2: "#F97316", pos: [0, 20], zoom: 2.2 },
];
const porId = Object.fromEntries(PREDIOS.map(p => [p.id, p]));
const $ = id => document.getElementById(id);
const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento: segue sem lembrar */ } };
const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };

let D, X;
try {
  D = await (await fetch("dados/olist_city.json")).json();
  X = derivar(D);
} catch (erro) {
  $("carregando").innerHTML = `<span>Não foi possível carregar os dados (${erro.message}).</span>`;
  throw erro;
}

// ---------- renderer, câmera, luz ----------
const host = $("cena");
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
host.appendChild(renderer.domElement);

const cena = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);
const DIRECAO = new THREE.Vector3(1, 0.86, 1).normalize();
camera.position.copy(DIRECAO).multiplyScalar(120);

const hemi = new THREE.HemisphereLight("#EEF2FF", "#A8A29E", 1.25);
const sol = new THREE.DirectionalLight("#FFF7ED", 2.3);
sol.position.set(35, 60, 18);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
Object.assign(sol.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 200 });
sol.shadow.bias = -0.0005;
sol.shadow.normalBias = 0.03;
cena.add(hemi, sol);

const controles = new OrbitControls(camera, renderer.domElement);
Object.assign(controles, {
  enableDamping: true, dampingFactor: 0.08, screenSpacePanning: false,
  minZoom: 0.7, maxZoom: 4.5, minPolarAngle: 0.55, maxPolarAngle: 1.12,
  minAzimuthAngle: Math.PI / 4 - 0.9, maxAzimuthAngle: Math.PI / 4 + 0.9, zoomToCursor: true,
});
controles.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controles.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controles.addEventListener("change", () => {
  controles.target.x = THREE.MathUtils.clamp(controles.target.x, -30, 30);
  controles.target.z = THREE.MathUtils.clamp(controles.target.z, -30, 30);
});

function redimensionar() {
  const w = host.clientWidth, h = host.clientHeight, asp = w / h;
  // a ilha inteira cabe no zoom 1 em qualquer proporção de tela
  let meiaAlt = 36, meiaLarg = meiaAlt * asp;
  if (meiaLarg < 52) { meiaLarg = 52; meiaAlt = meiaLarg / asp; }
  Object.assign(camera, { left: -meiaLarg, right: meiaLarg, top: meiaAlt, bottom: -meiaAlt });
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
addEventListener("resize", redimensionar);
redimensionar();

// ---------- cidade ----------
const cidade = construirCidade(cena, PREDIOS, { textoOutdoor: textoOutdoor(D, X) });
const alvos = PREDIOS.map(p => p.grupo);

// ---------- interface fixa ----------
$("topoKpis").innerHTML = kpisTopo(D, X).map(k => `<li><small>${k.rotulo}</small><b>${k.valor}${k.extra ? `<em style="color:var(--${k.tom})">${k.extra}</em>` : ""}</b></li>`).join("");
const frases = insightsLetreiro(D, X).map(f => `<span>${f}</span>`).join("");
$("letreiro").innerHTML = frases + frases;

$("doca").innerHTML = PREDIOS.map(p => `<button data-id="${p.id}" style="--cor:${p.cor}" aria-label="${p.nome}: ${p.area}"><span>${p.icone}</span>${p.curto}</button>`).join("");
$("doca").addEventListener("click", e => { const b = e.target.closest("button"); if (b) abrir(b.dataset.id); });

const etiquetas = {};
for (const p of PREDIOS) {
  const el = document.createElement("div");
  el.className = "etiqueta oculta";
  el.style.setProperty("--cor", p.cor);
  el.innerHTML = `<i>${p.icone}</i>${p.curto}<span class="ok">✓</span>`;
  el.addEventListener("click", () => abrir(p.id));
  $("etiquetas").appendChild(el);
  etiquetas[p.id] = el;
  p.ancora = new THREE.Vector3(p.pos[0], p.topo, p.pos[1]);
}

// passaporte do tour
const visitados = new Set(ler("olistCity.visitados", []).filter(id => porId[id]));
$("passaporteSelos").innerHTML = PREDIOS.map(p => `<button class="selo" data-id="${p.id}" style="--cor:${p.cor}" title="${p.nome}" aria-label="${p.nome}">${p.icone}</button>`).join("");
$("passaporteSelos").addEventListener("click", e => { const b = e.target.closest("button"); if (b) abrir(b.dataset.id); });
function atualizarPassaporte() {
  $("passaporteConta").textContent = `${visitados.size}/${PREDIOS.length}`;
  for (const b of $("passaporteSelos").children) b.classList.toggle("visitado", visitados.has(b.dataset.id));
  for (const p of PREDIOS) etiquetas[p.id].classList.toggle("visitado", visitados.has(p.id));
}
atualizarPassaporte();
function avisar(texto) {
  const a = $("aviso");
  a.textContent = texto; a.classList.add("mostrar");
  clearTimeout(avisar.t); avisar.t = setTimeout(() => a.classList.remove("mostrar"), 3200);
}

// ---------- voo da câmera ----------
let voo = null;
const suave = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function voar(alvo, zoom, ms = 1100) {
  voo = { de: controles.target.clone(), para: alvo, zde: camera.zoom, zpara: zoom, t0: performance.now(), ms: calmo ? 1 : ms };
}
function enquadrar(p) {
  // desloca o alvo para o prédio aparecer na área livre (fora do painel)
  const alvo = new THREE.Vector3(p.pos[0], p.topo * 0.35, p.pos[1]);
  const upp = (camera.right - camera.left) / p.zoom / host.clientWidth;
  camera.updateMatrixWorld();
  if (innerWidth > 900) {
    const direita = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    alvo.addScaledVector(direita, ((400 + 24) / 2) * upp);
  } else {
    const cima = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    alvo.addScaledVector(cima, -(innerHeight * 0.62 / 2) * upp * 0.85);
  }
  voar(alvo, p.zoom);
}

// ---------- painel ----------
const painel = $("painel");
let selecionado = null;
function abrir(id) {
  const i = PREDIOS.findIndex(p => p.id === id), p = PREDIOS[i];
  const c = conteudo(id, D, X);
  painel.style.setProperty("--cor", p.cor);
  painel.style.setProperty("--cor-2", p.cor2);
  painel.innerHTML = `
    <div class="painel-cabeca">
      <button class="painel-fechar" aria-label="Fechar painel">✕</button>
      <div class="linha1"><div class="painel-icone" aria-hidden="true">${p.icone}</div>
        <div><div class="painel-area">${p.area}</div><h2 id="painelTitulo">${p.nome}</h2></div></div>
      <div class="painel-nav"><button data-nav="-1" aria-label="Prédio anterior">‹ Anterior</button><span>Prédio ${i + 1} de ${PREDIOS.length}</span><button data-nav="1" aria-label="Próximo prédio">Próximo ›</button></div>
    </div>
    <div class="painel-corpo"><p class="pergunta">Pergunta de negócio: <b>${c.pergunta}</b></p>${c.html}</div>`;
  painel.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    painel.classList.add("aberto");
    painel.querySelectorAll("[data-w]").forEach(e => { e.style.width = e.dataset.w; });
    painel.querySelectorAll("[data-h]").forEach(e => { e.style.height = e.dataset.h; });
  }));
  document.body.classList.add("painel-aberto");
  selecionado = id;
  for (const b of $("doca").children) b.classList.toggle("ativa", b.dataset.id === id);
  for (const q of PREDIOS) etiquetas[q.id].classList.toggle("ativa", q.id === id);
  enquadrar(p);
  if (!visitados.has(id)) {
    visitados.add(id); guardar("olistCity.visitados", [...visitados]); atualizarPassaporte();
    if (visitados.size === PREDIOS.length) avisar("🎉 Tour completo: você visitou os 7 prédios!");
  }
}
function fechar() {
  painel.classList.remove("aberto");
  document.body.classList.remove("painel-aberto");
  selecionado = null;
  for (const b of $("doca").children) b.classList.remove("ativa");
  for (const q of PREDIOS) etiquetas[q.id].classList.remove("ativa");
  voar(new THREE.Vector3(0, 0, 0), 1);
}
painel.addEventListener("click", e => {
  if (e.target.closest(".painel-fechar")) return fechar();
  const nav = e.target.closest("[data-nav]");
  if (nav) {
    const i = PREDIOS.findIndex(p => p.id === selecionado);
    abrir(PREDIOS[(i + Number(nav.dataset.nav) + PREDIOS.length) % PREDIOS.length].id);
  }
});
addEventListener("keydown", e => {
  if (e.key === "Escape" && selecionado) fechar();
  if (selecionado && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
    const i = PREDIOS.findIndex(p => p.id === selecionado);
    abrir(PREDIOS[(i + (e.key === "ArrowRight" ? 1 : -1) + PREDIOS.length) % PREDIOS.length].id);
  }
});

// ---------- botões ----------
$("zoomMais").onclick = () => voar(controles.target.clone(), Math.min(camera.zoom * 1.35, controles.maxZoom), 400);
$("zoomMenos").onclick = () => voar(controles.target.clone(), Math.max(camera.zoom / 1.35, controles.minZoom), 400);
$("zoomReset").onclick = () => (selecionado ? fechar() : voar(new THREE.Vector3(0, 0, 0), 1));

let noite = false, mistura = 0;
function definirNoite(v) {
  noite = v;
  document.documentElement.dataset.noite = v ? "1" : "0";
  $("botaoNoite").textContent = v ? "☀️" : "🌙";
  guardar("olistCity.noite", v);
}
$("botaoNoite").onclick = () => definirNoite(!noite);
definirNoite(ler("olistCity.noite", false));
mistura = noite ? 1 : 0;

// ---------- seleção com o mouse ----------
const raio = new THREE.Raycaster(), mouse = new THREE.Vector2();
let sobre = null, mouseMudou = false, inicio = null;
renderer.domElement.addEventListener("pointermove", e => {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  mouseMudou = true;
});
renderer.domElement.addEventListener("pointerleave", () => { sobre = null; host.classList.remove("sobre-predio"); });
renderer.domElement.addEventListener("pointerdown", e => { inicio = { x: e.clientX, y: e.clientY, t: performance.now() }; voo = null; });
renderer.domElement.addEventListener("pointerup", e => {
  if (!inicio || Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 6 || performance.now() - inicio.t > 500) return;
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const id = escolherPredio();
  if (id) abrir(id);
});
function escolherPredio() {
  raio.setFromCamera(mouse, camera);
  const acerto = raio.intersectObjects(alvos, true).find(h => h.object.userData.predio && h.object.visible);
  return acerto ? acerto.object.userData.predio : null;
}

// ---------- entrada: prédios sobem do chão ----------
const t0 = performance.now();
for (const p of PREDIOS) p.grupo.scale.y = calmo ? 1 : 0.001;
camera.zoom = calmo ? 1 : 0.62;
camera.updateProjectionMatrix();
if (!calmo) voar(new THREE.Vector3(0, 0, 0), 1, 1800);
const voltaSuave = t => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
setTimeout(() => $("carregando").classList.add("sumir"), 150);

// ---------- laço ----------
const COR_DIA = new THREE.Color("#EEF2FF"), COR_NOITE = new THREE.Color("#6366F1");
const relogio = new THREE.Clock();
const v = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(relogio.getDelta(), 0.05), t = relogio.elapsedTime;
  const agora = performance.now();

  if (voo) {
    const k = Math.min(1, (agora - voo.t0) / voo.ms), e = suave(k);
    const desloc = camera.position.clone().sub(controles.target);
    controles.target.lerpVectors(voo.de, voo.para, e);
    camera.position.copy(controles.target).add(desloc);
    camera.zoom = voo.zde + (voo.zpara - voo.zde) * e;
    camera.updateProjectionMatrix();
    if (k >= 1) voo = null;
  }
  controles.update();

  PREDIOS.forEach((p, i) => {
    if (!calmo) {
      const k = THREE.MathUtils.clamp((agora - t0 - 250 - i * 140) / 900, 0, 1);
      p.grupo.scale.y = Math.max(0.001, voltaSuave(k));
    }
    const alvoY = p.id === sobre && p.id !== selecionado ? 0.45 : 0.2;
    p.grupo.position.y += (alvoY - p.grupo.position.y) * 0.18;
    const opAnel = p.id === selecionado ? 0.65 + Math.sin(t * 4) * 0.3 : p.id === sobre ? 0.5 : 0;
    p.anel.material.opacity += (opAnel - p.anel.material.opacity) * 0.15;
  });

  if (mouseMudou && !voo) {
    mouseMudou = false;
    const id = escolherPredio();
    if (id !== sobre) { sobre = id; host.classList.toggle("sobre-predio", !!id); }
  }

  cidade.atualizar(calmo ? 0 : dt, calmo ? 0 : t);

  // dia ↔ noite
  mistura += ((noite ? 1 : 0) - mistura) * 0.06;
  hemi.intensity = 1.25 - mistura * 0.85;
  hemi.color.lerpColors(COR_DIA, COR_NOITE, mistura);
  sol.intensity = 2.3 - mistura * 2.0;
  sol.color.set(mistura > 0.5 ? "#A5B4FC" : "#FFF7ED");
  for (const m of noturnos.janelas) m.emissiveIntensity = mistura * 1.1;
  for (const m of noturnos.placas) m.emissiveIntensity = 0.08 + mistura * 0.75;
  for (const m of noturnos.lampadas) m.emissiveIntensity = 0.1 + mistura * 2.4;

  renderer.render(cena, camera);

  // etiquetas acompanham os prédios
  const w = host.clientWidth, h = host.clientHeight, pronta = agora - t0 > 1400 || calmo;
  const pos = PREDIOS.map(p => {
    v.copy(p.ancora).project(camera);
    return { p, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, prof: v.z, larg: etiquetas[p.id].offsetWidth };
  });
  // etiquetas que se sobrepõem: a do prédio mais distante sobe
  for (let volta = 0; volta < 3; volta++) for (const a of pos) for (const b of pos) {
    if (a === b || a.prof <= b.prof) continue;
    const dy = b.y - a.y;
    if (Math.abs(a.x - b.x) < (a.larg + b.larg) / 2 + 4 && dy > -30 && dy < 30) a.y = b.y - 30;
  }
  for (const q of pos) {
    const el = etiquetas[q.p.id];
    el.style.transform = `translate(${q.x}px, ${q.y}px) translate(-50%, -100%)`;
    el.classList.toggle("oculta", !pronta);
  }
});

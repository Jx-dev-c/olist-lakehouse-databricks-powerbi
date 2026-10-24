// Servidor estático mínimo para abrir teste/index.html: node teste/servidor.mjs → http://localhost:8766/teste/
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

createServer(async (req, res) => {
    let caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (caminho.endsWith("/")) caminho += "index.html";
    const arquivo = normalize(join(RAIZ, caminho));
    if (!arquivo.startsWith(normalize(RAIZ))) { res.writeHead(403).end(); return; }
    let conteudo;
    try {
        conteudo = await readFile(arquivo);
    } catch {
        res.writeHead(404).end("não encontrado");
        return;
    }
    res.writeHead(200, { "Content-Type": TIPOS[extname(arquivo)] ?? "application/octet-stream" }).end(conteudo);
}).listen(8766, "127.0.0.1", () => console.log("http://localhost:8766/teste/"));


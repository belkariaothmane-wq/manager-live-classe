"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { networkInterfaces } = require("node:os");
const { randomBytes, createHash, timingSafeEqual } = require("node:crypto");

const port = Number(process.env.PORT || 3000);
const secret = randomBytes(24).toString("hex");
const hosted = process.env.MANAGER_HOSTED === "1" || process.env.RENDER === "true" || Boolean(process.env.TEACHER_PASSWORD);
const password = process.env.TEACHER_PASSWORD;
if (hosted && (!password || password.length < 16)) throw Error("Configurez TEACHER_PASSWORD (16 caractères minimum).");
const hash = value => createHash("sha256").update(value).digest();
const inviteCode = () => randomBytes(4).toString("hex").toUpperCase();
let code = inviteCode();
let roomId = null;
let display = null;
const joined = new Set();
let stage = null;
const rounds = new Map();
const presence = new Map();
const files = new Map([
  ["/style.css", ["style.css", "text/css"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/scenarios.js", ["scenarios.js", "text/javascript"]],
  ["/teacher-lan.js", ["teacher-lan.js", "text/javascript"]],
  ["/student-lan.js", ["student-lan.js", "text/javascript"]],
  ["/projection", ["projection.html", "text/html"]],
  ["/projection.js", ["projection.js", "text/javascript"]],
  ["/student", ["student.html", "text/html"]],
  ["/assets/manager.png", ["assets/manager.png", "image/png"]]
]);

function send(response, status, body, type = "application/json") {
  response.writeHead(status, {
    "Content-Type": type === "image/png" ? type : type + "; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  });
  response.end(type === "application/json" ? JSON.stringify(body) : body);
}

async function readJSON(request) {
  if (!request.headers["content-type"]?.startsWith("application/json")) throw Error("JSON requis.");
  let contents = "";
  request.setEncoding("utf8");
  for await (const chunk of request) {
    contents += chunk;
    if (contents.length > 32000) throw new Error("Requête trop volumineuse.");
  }
  return JSON.parse(contents);
}

function validId(value) {
  return typeof value === "string" && /^[a-f0-9]{24,64}$/.test(value);
}

function participants() {
  const cutoff = Date.now() - 15000;
  for (const [id, lastSeen] of presence) if (lastSeen < cutoff) presence.delete(id);
  return presence.size;
}

function teacherView(key) {
  const votes = rounds.get(key);
  return { code: hosted ? code : null, participants: participants(), available: Boolean(votes), ballots: votes ? [...votes] : [] };
}

function studentView(id) {
  return stage ? {
    position:stage.position, title:stage.title, context:stage.context, fact:stage.fact,
    question:stage.question, choices:stage.choices,
    open:stage.open, key:stage.key, learning:stage.learning,
    voted:rounds.get(stage.key)?.has(id) || false
  } : null;
}

function validateStage(incoming) {
  if (incoming === null) return;
  if (!incoming || !validId(incoming.key) || !Number.isInteger(incoming.position) ||
      !Array.isArray(incoming.choices) || incoming.choices.length < 3 || incoming.choices.length > 4 ||
      !incoming.choices.every(choice => typeof choice === "string" && choice.length <= 350) ||
      !["title","context","fact","question","learning"].every(field => typeof incoming[field] === "string" && incoming[field].length <= 1200) ||
      typeof incoming.open !== "boolean") throw new Error("Étape invalide.");
}

function updateStage(incoming) {
  stage = incoming;
  if (stage?.open && !rounds.has(stage.key)) {
    if (rounds.size >= 1500) rounds.delete(rounds.keys().next().value);
    rounds.set(stage.key, new Map());
  }
}

function updateSession(data) {
  if (!data || typeof data !== "object" || (data.room !== null && !validId(data.room)) ||
      (data.display !== null && (typeof data.display !== "object" || Array.isArray(data.display)))) throw Error("Séance invalide.");
  validateStage(data.stage);
  if (data.room && data.room !== roomId) {
    roomId = data.room;
    code = inviteCode();
    rounds.clear();
    presence.clear();
    joined.clear();
  }
  updateStage(data.stage);
  display = data.display;
}

function projectedView() {
  if (!display) return null;
  if (!stage || !display.results) return {
    ...display,
    ...(stage ? {total:rounds.get(stage.key)?.size ?? display.total} : {})
  };
  const ballots = rounds.get(stage.key);
  const current = ballots ? stage.choices.map((_, i) => [...ballots.values()].filter(choice => choice === i).length) : display.results.current;
  const before = rounds.get(display.results.previousKey);
  const paired = before && ballots ? [...ballots].filter(([id]) => before.has(id)) : [];
  const changes = paired.length
    ? {paired:paired.length, changed:paired.filter(([id, choice]) => before.get(id) !== choice).length}
    : display.results.changes;
  return {...display, results:{...display.results,current,changes}};
}

function localTeacher(request) {
  const host = request.headers.host || "";
  return ["127.0.0.1","::1","::ffff:127.0.0.1"].includes(request.socket.remoteAddress) &&
    /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
}

const server = http.createServer(async (request, response) => {
  try {
    const target = new URL(request.url, "http://localhost");
    const route = target.pathname;
    if (request.method === "GET" && route === "/teacher") {
      if (!hosted && !localTeacher(request)) return send(response, 403, "Ouvrez l’écran enseignant depuis le PC qui exécute le serveur.", "text/plain");
      const html = await fs.readFile(path.join(__dirname, "index.html"), "utf8");
      return send(response, 200, html.replace('<script defer src="app.js">', '<script defer src="teacher-lan.js"></script>\n  <script defer src="app.js">').replace("<body>", hosted ? '<body data-hosted="true">' : "<body>"), "text/html");
    }
    if (route.startsWith("/api/teacher/")) {
      if (!hosted && !localTeacher(request)) return send(response, 403, {error:"Accès réservé au PC serveur."});
      if (route === "/api/teacher/key") {
        if (!hosted && request.method === "GET") return send(response, 200, {key:secret});
        if (hosted && request.method === "POST") {
          const data = await readJSON(request);
          if (typeof data?.password !== "string" || !timingSafeEqual(hash(data.password),hash(password))) {
            return send(response, 401, {error:"Mot de passe enseignant incorrect."});
          }
          return send(response, 200, {key:secret});
        }
      }
      if (request.headers["x-manager-key"] !== secret) return send(response, 401, {error:"Connexion enseignant requise."});
      if (request.method === "GET" && route === "/api/teacher/counts") return send(response, 200, teacherView(target.searchParams.get("key")));
      if (request.method === "POST" && route === "/api/teacher/stage") {
        updateSession(await readJSON(request));
        return send(response, 200, teacherView(stage?.key));
      }
    }
    if (request.method === "GET" && route === "/health") return send(response, 200, {ok:true});
    if (request.method === "GET" && route === "/api/projection") return send(response, 200, projectedView());
    if (route.startsWith("/api/student/") && hosted && request.headers["x-session-code"] !== code) {
      return send(response, 401, {error:"Code de séance incorrect ou expiré."});
    }
    if (route === "/api/student/join" && request.method === "POST" && hosted) {
      if (joined.size >= 1000) return send(response, 409, {error:"Séance complète."});
      const id = randomBytes(16).toString("hex");
      joined.add(id);
      return send(response, 200, {id});
    }
    if (route === "/api/student/state" && request.method === "GET") {
      const id = target.searchParams.get("id");
      if (hosted && !joined.has(id)) return send(response, 401, {error:"Inscription à la séance requise."});
      if (!validId(id)) return send(response, 400, {error:"Identifiant de vote invalide."});
      participants();
      if (presence.size < 1000 || presence.has(id)) presence.set(id, Date.now());
      return send(response, 200, studentView(id));
    }
    if (route === "/api/student/vote" && request.method === "POST") {
      const vote = await readJSON(request);
      if (!validId(vote?.id) || !Number.isInteger(vote.choice)) return send(response, 400, {error:"Vote invalide."});
      if (hosted && (request.headers["x-session-code"] !== code || !joined.has(vote.id))) {
        return send(response, 401, {error:"Code de séance incorrect ou expiré."});
      }
      if (!stage?.open || stage.key !== vote.key) return send(response, 409, {error:"Ce tour de vote est fermé."});
      const ballots = rounds.get(stage.key);
      if (ballots.has(vote.id)) return send(response, 200, {voted:true});
      if (vote.choice < 0 || vote.choice >= stage.choices.length || ballots.size >= 1000) {
        return send(response, 400, {error:"Choix indisponible ou limite de participants atteinte."});
      }
      ballots.set(vote.id, vote.choice);
      return send(response, 200, {voted:true});
    }
    if (request.method === "GET" && route === "/student" && hosted) {
      const html = await fs.readFile(path.join(__dirname, "student.html"),"utf8");
      return send(response, 200, html.replace("<body>",'<body data-hosted="true">'),"text/html");
    }
    if (request.method === "GET" && files.has(route)) {
      const [filename, type] = files.get(route);
      return send(response, 200, await fs.readFile(path.join(__dirname, filename)), type);
    }
    if (request.method === "GET" && route === "/") {
      response.writeHead(302, {Location:hosted || !localTeacher(request) ? "/student" : "/teacher"});
      return response.end();
    }
    return send(response, 404, {error:"Page introuvable."});
  } catch (error) {
    if (response.destroyed || response.headersSent) return;
    send(response, error.code === "ENOENT" ? 404 : 400, {error:"Ressource ou requête invalide."});
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log("\nMANAGER LIVE EST PRÊT\n");
  if (hosted) return;
  console.log(`Enseignant : http://localhost:${port}/teacher`);
  const addresses = new Set(Object.values(networkInterfaces()).flat().filter(info =>
    info.family === "IPv4" && !info.internal).map(info => info.address));
  for (const address of addresses) console.log(`Étudiants  : http://${address}:${port}/student`);
  if (!addresses.size) console.log("Aucune adresse IPv4 réseau détectée.");
});
server.on("error", error => {
  console.error(error.code === "EADDRINUSE" ? `Le port ${port} est déjà utilisé.` : error.message);
  process.exitCode = 1;
});

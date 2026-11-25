"use strict";

const stage = document.querySelector("#student-stage");
const message = document.querySelector("#student-message");
const hosted = document.body.dataset.hosted === "true";
const suggested = new URLSearchParams(location.search).get("code");
let id = hosted ? "" : Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2,"0")).join("");
let code = "";
try {
  const saved = JSON.parse(sessionStorage.getItem("manager-live-participant"));
  if (saved && (!suggested || saved.code === suggested) && Boolean(saved.code) === hosted) {
    id = saved.id;
    code = saved.code;
  }
} catch {}
if (!hosted) saveIdentity();

function saveIdentity() {
  try { sessionStorage.setItem("manager-live-participant",JSON.stringify({id,code})); } catch {}
}

function joinForm(value = suggested || "") {
  const heading = element("h1","Rejoindre la séance");
  const form = element("form","","join-form");
  const label = element("label","Code de séance");
  label.htmlFor = "student-code";
  const input = element("input","");
  input.id = "student-code";
  input.required = true;
  input.maxLength = 8;
  input.autocapitalize = "characters";
  input.value = value;
  const submit = element("button","Continuer","btn primary");
  form.append(label,input,submit);
  form.onsubmit = async event => {
    event.preventDefault();
    submit.disabled = true;
    const proposed = input.value.trim().toUpperCase();
    try {
      const response = await fetch("/api/student/join",{
        method:"POST",headers:{"X-Session-Code":proposed},signal:AbortSignal.timeout(8000)
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      id = data.id;
      code = proposed;
      currentSignature = "";
      saveIdentity();
      await poll();
    } catch (error) { message.textContent = error.message || "Connexion indisponible."; }
    finally { submit.disabled = false; }
  };
  stage.replaceChildren(heading,form);
}

function leaveRoom() {
  const previous = code;
  code = id = "";
  saveIdentity();
  joinForm(previous);
  message.textContent = "Cette séance a changé. Demandez le nouveau code.";
}
let currentSignature = "";
let pending = false;
let sendingVote = false;

function element(tag, text, className = "") {
  const result = document.createElement(tag);
  result.className = className;
  result.textContent = text;
  return result;
}

function renderStudentStage(data) {
  const signature = JSON.stringify(data);
  if (signature === currentSignature) return;
  currentSignature = signature;
  message.textContent = "";
  if (!data) {
    stage.replaceChildren(element("h1","En attente de la séance"),element("p","Gardez cette page ouverte."));
    return;
  }
  const elements = [
    element("p","Situation " + data.position,"eyebrow"),
    element("h1",data.title),
    element("p",data.context,"context")
  ];
  if (data.fact) elements.push(element("p",data.fact,"panel reveal"));
  if (data.learning) elements.push(element("h2","Ce qu’on peut retenir"),element("p",data.learning,"panel"));
  else if (data.voted) elements.push(element("h2","Vote enregistré"),element("p","Regardez maintenant l’écran principal."));
  else if (data.open) {
    elements.push(element("p",data.question,"question"));
    const choices = element("div","","choices");
    for (const [index, choice] of data.choices.entries()) {
      const button = element("button","","choice");
      button.append(element("span","ABCD"[index],"letter"),element("span",choice));
      button.onclick = () => cast(data.key, index);
      choices.append(button);
    }
    elements.push(choices);
  } else elements.push(element("p","Regardez maintenant l’écran principal.","panel"));
  stage.replaceChildren(...elements);
}

async function poll() {
  if (pending || sendingVote || !id) return;
  pending = true;
  try {
    const response = await fetch("/api/student/state?id=" + encodeURIComponent(id),{
      headers:{"X-Session-Code":code},signal:AbortSignal.timeout(8000)
    });
    if (response.status === 401 && hosted) return leaveRoom();
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (!sendingVote) renderStudentStage(data);
    if (message.textContent === "Connexion interrompue. Nouvelle tentative…") message.textContent = "";
  } catch { message.textContent = "Connexion interrompue. Nouvelle tentative…"; }
  finally { pending = false; }
}

async function cast(key, choice) {
  if (sendingVote) return;
  sendingVote = true;
  stage.querySelectorAll("button").forEach(button => { button.disabled = true; });
  try {
    const response = await fetch("/api/student/vote", {
      method:"POST", headers:{"Content-Type":"application/json","X-Session-Code":code},
      body:JSON.stringify({id,key,choice}),signal:AbortSignal.timeout(8000)
    });
    if (response.status === 401 && hosted) return leaveRoom();
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    stage.replaceChildren(element("h1","Vote enregistré"),element("p","Regardez maintenant l’écran principal."));
    currentSignature = "";
    message.textContent = "";
  } catch (error) {
    message.textContent = error.message;
    stage.querySelectorAll("button").forEach(button => { button.disabled = false; });
  } finally {
    sendingVote = false;
    poll();
  }
}

if (hosted && !id) joinForm();
else poll();
setInterval(poll, 1100);

"use strict";

const stage = document.querySelector("#projection-stage");
const status = document.querySelector("#projection-status");
let signature = "";
let pending = false;

function node(tag, text = "", className = "") {
  const result = document.createElement(tag);
  result.textContent = text;
  result.className = className;
  return result;
}

function bar(label, amount, max) {
  const wrapper = node("div");
  const summary = node("div", "", "bar-head");
  const meter = node("meter");
  meter.max = max || 1;
  meter.value = amount;
  meter.setAttribute("aria-label",label);
  summary.append(node("span",label),node("strong",max ? Math.round(amount * 100 / max) + " %" : "—"));
  wrapper.append(summary,meter);
  return wrapper;
}

function resultColumn(counts, data, title) {
  const section = node("section","","results");
  const sum = counts.reduce((a,b) => a+b,0);
  if (title) section.append(node("h3",title));
  section.append(node("p",sum + " vote(s)"));
  data.choices.forEach((choice,i) => section.append(bar("ABCD"[i] + " · " + choice,counts[i],sum)));
  return section;
}

function renderSituation(data) {
  const contents = [
    node("p",`${data.card ? "Carte" : "Situation"} ${data.position} / ${data.length} · ${data.category}`,"eyebrow"),
    node("h1",data.title), node("p",data.context,"context")
  ];
  if (data.fact) {
    const fact = node("section","","panel reveal");
    fact.append(node("h2","Nouvelle information"),node("p",data.fact,"context"));
    contents.push(fact);
  }
  if (["intro","open","closed"].includes(data.phase)) {
    const choices = node("div","","choices");
    data.choices.forEach((choice,i) => {
      const row = node("div","","choice");
      row.append(node("span","ABCD"[i],"letter"),node("span",choice));
      choices.append(row);
    });
    contents.push(node("h2",data.question,"question"),choices);
    if (["open","closed"].includes(data.phase)) contents.push(node("p",`Vote ${data.phase === "open" ? "ouvert" : "fermé"} · ${data.total} vote(s) reçu(s)${Number.isInteger(data.registered) ? " sur " + data.registered + " inscrits" : ""}`,"question"));
  }
  if (data.oral) contents.push(node("p",data.oral,"panel"));
  if (data.results) {
    const panel = node("section","","panel");
    panel.append(node("h2",data.phase === "debate" ? "Qui veut défendre son choix ?" : "Résultats"));
    const {current,previous,changes} = data.results;
    if (previous) {
      const columns = node("div","","comparison");
      columns.append(resultColumn(previous,data,"Avant"), resultColumn(current,data,"Après"));
      panel.append(columns);
      if (changes?.paired) panel.append(node("p",`${Math.round(100 * changes.changed / changes.paired)} % ont changé d’avis · ${changes.paired} bulletin(s) apparié(s)`,"comparison-note"));
    } else panel.append(resultColumn(current,data,""));
    contents.push(panel);
  }
  if (data.phase === "update") contents.push(node("h2","Maintenez-vous votre décision ?"));
  if (data.learning) {
    const panel = node("section","","panel reveal");
    panel.append(node("h2","Ce qu’on peut retenir"),node("p",data.learning,"context"));
    contents.push(panel);
  }
  return contents;
}

function renderCards(data) {
  const deck = node("div","","card-deck");
  data.cards.forEach(card => {
    const tile = node("div","","deck-tile " + (card.played ? "played" : card.locked ? "locked" : ""));
    tile.append(node("strong",String(card.number)));
    if (card.played) tile.append(node("span",card.title));
    else if (card.locked) tile.append(node("span","Finale réservée"));
    deck.append(tile);
  });
  return [node("h1","Choisissez une carte"),node("p","À tour de rôle, un étudiant propose un numéro.","context"),deck];
}

function renderSummary(data) {
  const profile = node("section","","results");
  if (data.type === "final") profile.append(node("h2","Votre management aujourd’hui"));
  data.dimensions.forEach(({label,score}) => profile.append(bar(label,score,100)));
  if (!data.dimensions.length) profile.append(node("p","Le profil apparaît après la révélation de votes."));
  return [
    node("h1",data.type === "final" ? "Fin de la journée" : "Votre management aujourd’hui"),
    node("p",`${data.situations} / ${data.length} situations votées · ${data.decisions} décisions enregistrées`,"context"),
    profile, node("p","Ce profil reflète les décisions prises pendant cette simulation.","muted")
  ];
}

async function poll() {
  if (pending) return;
  pending = true;
  try {
    const response = await fetch("/api/projection",{signal:AbortSignal.timeout(7000)});
    if (!response.ok) throw Error();
    const data = await response.json();
    const next = JSON.stringify(data);
    if (next !== signature) {
      const contents = !data ? [node("h1","En attente de la séance")] :
        data.type === "situation" ? renderSituation(data) : data.type === "cards" ? renderCards(data) : renderSummary(data);
      const reveal = data?.card && data.phase === "intro" && !stage.classList.contains("card-reveal");
      if (!data?.card || data.phase !== "intro") stage.classList.remove("card-reveal");
      stage.replaceChildren(...contents);
      if (reveal) stage.classList.add("card-reveal");
      signature = next;
    }
    status.textContent = "";
  } catch {
    status.textContent = "Connexion interrompue. Reconnexion en cours…";
  } finally { pending = false; }
}
poll();
setInterval(poll,1100);

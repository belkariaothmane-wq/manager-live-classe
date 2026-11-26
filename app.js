"use strict";

const app = document.querySelector("#app");
const nav = document.querySelector("#nav");
const notice = document.querySelector("#notice");
const importInput = document.querySelector("#import");
const storageKey = "manager-live-v1";
const finale = SCENARIOS.at(-1);
const defaultSelection = ["S001", "S003", "S008", "S013", "S033", finale.id];
const dimensionLabels = ["Cadre", "Humain", "Résultat", "Écoute", "Autonomie", "Prudence"];
const tendencies = ["Le cadreur", "Le facilitateur", "Le décideur", "Le facilitateur", "L’autonomisant", "L’analyste"];
const reflection = ["Les faits", "L’avis des autres", "Les conséquences", "Le risque", "L’humain", "La pression du résultat"];
let saved = {};
let storageOK = true;
try { saved = JSON.parse(localStorage.getItem(storageKey)) || {}; }
catch { storageOK = false; }

let bank = [...SCENARIOS];
const savedSelection = Array.isArray(saved.selection) ? saved.selection : defaultSelection;
let selection = [...new Set(savedSelection)].filter(id => bank.some(item => item.id === id));
if (savedSelection.length && !selection.length) selection = defaultSelection.slice();
let settings = { classroom: 32, ...saved.settings };
let teacherSession = saved.session && Array.isArray(saved.session.scenarios) && saved.session.scenarios.length ? saved.session : null;
let session = teacherSession;
let screen = "home";
let projection = false;
let manual = false;
let prompts = false;
let selected = null;
let bankFilter = "";
let categoryFilter = "";
let toastTimer;
let artPresent = null;
let network = null;
let networkBusy = false;
let connectedParticipants = 0;
let roster = [];
let rosterOpen = false;
let networkDegraded = false;
const labels = { intro: "Situation", open: "Vote ouvert", closed: "Vote fermé", results: "Résultats", debate: "Débat", update: "Nouvelle information", learning: "À retenir" };

const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const total = counts => counts.reduce((sum, count) => sum + count, 0);
const percent = (count, sum) => sum ? Math.round(100 * count / sum) : 0;
const makeRound = size => ({ counts: Array(size).fill(0), ballots: null, source: null, published: false });
const makeState = scenario => ({ phase: "intro", rounds: [makeRound(scenario.choices.length)], index: 0 });
const scenario = () => session.scenarios[session.position];
const current = () => session.states[session.position];
const round = () => current().rounds[current().index];
const usesNetwork = vote => network && (!vote.source || vote.source === "network");
const updates = item => item.updates || (item.surprise ? [item.surprise] : []);
const button = (label, action, options = {}) => `<button type="button" class="btn ${options.kind || ""}" data-action="${action}"${options.value === undefined ? "" : ` data-value="${escape(options.value)}"`}${options.disabled ? " disabled" : ""}>${label}</button>`;
const small = (label, action, options = {}) => button(label, action, { ...options, kind: "small " + (options.kind || "") });

function toast(message) {
  notice.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { notice.textContent = ""; }, 4200);
}

function persist() {
  if (session?.drawn && ["cards","session"].includes(screen)) session.atDeck = screen === "cards";
  try {
    localStorage.setItem(storageKey, JSON.stringify({ settings, selection, session: teacherSession }));
    storageOK = true;
  } catch { storageOK = false; }
}

function render() {
  document.body.classList.toggle("project", projection);
  const active = ["session","cards","final","profile"].includes(screen);
  nav.innerHTML = [
    screen !== "home" && !projection ? small("Accueil", "home") : "",
    screen === "home" ? small("Banque de situations", "bank") : "",
    network && !projection ? '<a class="btn small" href="/projection" target="_blank" rel="noopener">Ouvrir la projection ↗</a>' : "",
    network && !network.hosted && !projection ? small("Quitter le mode connecté", "offline") : "",
    active && !session.demo ? small(projection ? "Quitter la projection · F" : "Projection · F", "projection") : ""
  ].join("");
  const views = { home: renderHome, bank: renderBank, settings: renderSettings, cards:renderCards, session: renderSession, profile: renderSummary, final: renderSummary };
  const showInvite = network?.hosted && !projection && active && !session.demo;
  app.innerHTML = (showInvite ? invitation() : "") + views[screen]();
  updateNetworkStatus();
  if (screen === "home" && artPresent) document.querySelector(".visual").classList.add("has-art");
}

function invitation() {
  return `<section class="card invite teacher-only" aria-label="Accès étudiant">
    <div><span class="eyebrow">Code de séance</span><strong id="room-code">—</strong></div>
    <a id="student-link" class="btn primary" href="/student" target="_blank" rel="noopener">Lien de vote étudiant ↗</a>
    ${small("Copier le lien", "copy-link")}
    <details id="roster" ${rosterOpen ? "open" : ""}><summary id="live-participants"></summary><div id="roster-lists"></div></details>
    <span id="live-status" class="muted"></span>
  </section>`;
}

function refresh(moveFocus = false) {
  persist();
  render();
  if (moveFocus) {
    window.scrollTo(0, 0);
    const heading = app.querySelector("h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }
}

function renderHome() {
  return `<section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">BUT QLIO • Management</p>
      <h1>MANAGER <span>LIVE</span></h1>
      <h2>Dans la peau d’un manager</h2>
      <p class="manifesto">Des décisions.<br>Des conséquences.<br>Pas toujours une bonne réponse.</p>
      <div class="actions">${button("COMMENCER LA SÉANCE", "start", {kind:"primary"})}
      ${button("Jouer avec les cartes", "start-cards")}
      ${button("Mode étudiant / Démonstration", "demo", {kind:"dark"})}</div>
      <p class="mode-name">Mode enseignant${network ? " connecté" : ""} · ${selection.length} situation(s) sélectionnée(s)</p>
    </div>
    <div class="visual" aria-hidden="true">
      <div class="decision-art"><i></i><i></i><i></i><i></i><span>?</span></div>
      ${artPresent ? '<img src="assets/manager.png" alt="">' : ""}
    </div>
  </section>
  <div class="home-options">
    ${button("Choisir les situations", "bank")}
    ${button("Mode aléatoire", "random-home")}
    ${button("Paramètres", "settings")}
    ${button("Reprendre une séance", "resume", {disabled: !teacherSession})}
  </div>`;
}

function renderBank() {
  const byId = new Map(bank.map(item => [item.id, item]));
  const categories = [...new Set(bank.map(item => item.category))].sort((a, b) => a.localeCompare(b, "fr"));
  const found = bank.filter(item => (!categoryFilter || item.category === categoryFilter) &&
    `${item.id} ${item.title} ${item.category}`.toLocaleLowerCase("fr").includes(bankFilter.toLocaleLowerCase("fr")));
  return `<section class="card">
    <p class="eyebrow">Mode enseignant · ${bank.length} situations</p>
    <h1>Banque de situations</h1>
    <div class="toolbar">
      ${button("Tout sélectionner", "all")}${button("Tout désélectionner", "none")}
      <label>Tirage <select id="random-size">${[5,8,10,12,15].map(n => `<option>${n}</option>`).join("")}</select></label>
      ${button("Tirer au hasard", "random")}
      ${button("Commencer la séance", "start", {kind:"primary", disabled: !selection.some(id => byId.has(id))})}
      ${button("Jouer avec les cartes", "start-cards", {disabled:!selection.some(id => byId.has(id))})}
    </div>
    <details class="bank-order" id="order" ${document.querySelector("#order")?.open ? "open" : ""}>
      <summary>Ordre de passage · ${selection.filter(id => byId.has(id)).length} sélectionnée(s)</summary>
      <ol>${selection.filter(id => byId.has(id)).map((id, i, list) => `<li>${escape(byId.get(id).title)} 
        ${small("↑", "up", {value:id, disabled:i === 0}).replace('type="button"', 'type="button" aria-label="Monter la situation"')}
        ${small("↓", "down", {value:id, disabled:i === list.length - 1}).replace('type="button"', 'type="button" aria-label="Descendre la situation"')}</li>`).join("")}</ol>
    </details>
    <div class="toolbar">
      <label>Rechercher <input id="bank-search" type="search" value="${escape(bankFilter)}"></label>
      <label>Catégorie <select id="bank-category"><option value="">Toutes</option>${categories.map(category => `<option${category === categoryFilter ? " selected" : ""}>${escape(category)}</option>`).join("")}</select></label>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Sélection</th><th>Nº</th><th>Titre</th><th>Catégorie</th><th>Format</th><th>Durée estimée</th></tr></thead><tbody>
    ${found.map(item => `<tr><td><input type="checkbox" data-select="${escape(item.id)}" aria-label="Sélectionner ${escape(item.title)}"${selection.includes(item.id) ? " checked" : ""}></td><td>${escape(item.id)}</td><td><strong>${escape(item.title)}</strong></td><td>${escape(item.category)}</td><td>${formats[item.format][0]}</td><td>${item.duration} min</td></tr>`).join("")}
    </tbody></table></div>
    ${found.length ? "" : "<p>Aucune situation trouvée.</p>"}
    <div class="actions bank-files">${button("Exporter les situations", "export")}${button("Importer des situations", "import")}</div>
  </section>`;
}

function renderSettings() {
  return `<section class="card"><h1>Paramètres</h1>
    <form id="settings-form"><label>Nombre d’étudiants simulés <input name="classroom" type="number" min="1" max="500" required value="${escape(settings.classroom)}"></label>
    <button class="btn primary">Enregistrer</button></form>
    <div class="panel"><h2>Sauvegarde locale</h2>
    <p>${storageOK ? "La dernière séance enseignant est sauvegardée dans ce navigateur." : "Stockage local indisponible. La séance reste utilisable dans cet onglet."}</p>
    ${button("Effacer la sauvegarde", "erase")}</div>
    <div class="panel"><h2>Raccourcis</h2><p><kbd>→</kbd> Étape suivante · <kbd>←</kbd> Retour · <kbd>R</kbd> Résultats · <kbd>N</kbd> Nouvelle information · <kbd>D</kbd> Débrief · <kbd>F</kbd> Projection</p></div>
  </section>`;
}

function voteChoices(item, interactive) {
  return `<p class="question">${escape(item.question)}</p>
    ${item.format === "position" ? '<div class="position-line"><span>Cadre commun / directif</span><span>Adaptation / participatif</span></div>' : ""}
    <div class="choices">${item.choices.map((choice, index) => {
      const content = `<span class="letter">${choice.id}</span><span>${escape(choice.text)}</span>`;
      return interactive
        ? `<button type="button" class="choice" data-action="choose" data-value="${index}" aria-pressed="${selected === index}">${content}</button>`
        : `<div class="choice">${content}</div>`;
    }).join("")}</div>`;
}

function bars(item, vote, title) {
  const sum = total(vote.counts);
  return `<div class="results">${title ? `<h3>${title}</h3>` : ""}
    <p><strong>${sum}</strong> ${sum === 1 ? "participant a voté" : "participants ont voté"}${vote.source === "simulation" ? " · simulation" : ""}</p>
    ${item.choices.map((choice, i) => {
      const value = percent(vote.counts[i],sum);
      return `<div><div class="bar-head"><span>${choice.id} · ${escape(choice.text)}</span><strong>${sum ? value + " %" : "—"}</strong></div>
        <meter min="0" max="100" value="${value}" aria-label="Part du choix ${choice.id}"></meter></div>`;
    }).join("")}</div>`;
}

function changesBetween(first, second) {
  if (!first?.ballots || !second?.ballots || !first.ballots.length || first.source !== second.source) return null;
  if (first.source === "network") {
    const before = new Map(first.ballots);
    const paired = second.ballots.filter(([id]) => before.has(id));
    return paired.length ? {
      changed: paired.filter(([id, choice]) => before.get(id) !== choice).length,
      paired: paired.length
    } : null;
  }
  if (first.ballots.length !== second.ballots.length) return null;
  return {
    changed: second.ballots.filter((choice, index) => choice !== first.ballots[index]).length,
    paired: second.ballots.length
  };
}

function resultsPanel(item, state) {
  const vote = round();
  const previous = state.rounds[state.index - 1];
  const changed = changesBetween(previous, vote);
  return `<div class="panel"><h2>Résultats du vote</h2>
    ${previous?.published ? `<div class="comparison">${bars(item, previous, "Avant")}${bars(item, vote, "Après")}</div>
      <p class="comparison-note">${changed === null ? "Changements individuels inconnus avec ces totaux."
        : `<strong>${percent(changed.changed, changed.paired)} % ont changé de décision</strong>${vote.source === "simulation" ? " · simulation" : vote.source === "network" ? ` · ${changed.paired} bulletin(s) apparié(s)` : ""}`}</p>`
      : bars(item, vote, "")}</div>`;
}

function openControls(item, vote) {
  return `<div class="actions teacher-only">
    ${button("Simuler les votes", "simulate", {kind:"small"})}
    ${button("Saisir les votes", "manual", {kind:"small"})}
    ${button("Enregistrer un vote", "cast", {kind:"small"})}</div>
    ${manual ? `<form id="manual-form" class="teacher-only panel"><h3>Nombre de votes par choix</h3>
    <div class="counts">${item.choices.map((choice, index) => `<label>${choice.id}<input required name="${choice.id}" type="number" min="0" max="10000" value="${vote.counts[index]}"></label>`).join("")}</div>
    <button class="btn dark">Valider les nombres</button></form>` : ""}`;
}

function information(item, state) {
  const amount = state.index + Number(state.phase === "update");
  const facts = updates(item).slice(0, amount);
  if (!facts.length) return "";
  const latest = facts.at(-1);
  return `<div class="panel reveal"><p class="eyebrow">Nouvelle information${item.format === "finale" ? ` · ${amount}/${updates(item).length}` : ""}</p>
    <p class="context">${escape(latest)}</p>
    ${facts.length > 1 ? `<details><summary>Informations précédentes</summary><ul>${facts.slice(0,-1).map(fact => `<li>${escape(fact)}</li>`).join("")}</ul></details>` : ""}
    ${state.phase === "update" ? "<strong>MAINTENEZ-VOUS VOTRE DÉCISION ?</strong>" : ""}</div>`;
}

function cardDeck() {
  const ordinaryRemain = session.scenarios.some((item,index) => item.format !== "finale" && !session.drawn.includes(index));
  return session.scenarios.map((item,index) => ({
    number:index + 1, played:session.drawn.includes(index),
    locked:ordinaryRemain && item.format === "finale",
    title:session.drawn.includes(index) ? item.title : ""
  }));
}

function renderCards() {
  return `<article class="card stage">
    <h1>Choisissez une carte</h1>
    <p class="context">À tour de rôle, un étudiant propose un numéro.</p>
    <div class="card-deck">${cardDeck().map(card => {
      const label = `<strong>${card.number}</strong>${card.played ? `<span>${escape(card.title)}</span>` : card.locked ? "<span>Finale réservée</span>" : ""}`;
      return button(label,"draw-card",{value:card.number - 1,kind:`deck-tile ${card.played ? "played" : ""}`,disabled:card.played || card.locked});
    }).join("")}</div>
    ${session.drawn.length ? `<div class="actions teacher-only">${button("Afficher le bilan","card-finish")}</div>` : ""}
  </article>`;
}

const oralPrompt = "La personne qui a choisi la carte peut annoncer et défendre son choix.";
function renderSession() {
  const item = scenario(), state = current(), vote = round();
  const phase = state.phase;
  const showChoices = ["intro","open","closed"].includes(phase);
  const hasNext = updates(item).length > state.index;
  let stageActions;
  switch (phase) {
    case "intro": stageActions = button("OUVRIR LE VOTE", "open", {kind:"primary"}); break;
    case "open": stageActions = button("Fermer le vote", "close", {kind:"primary"}); break;
    case "closed": stageActions = button("RÉVÉLER LES RÉSULTATS", "results", {kind:"primary"}) + button("Rouvrir le vote", "open"); break;
    case "results": stageActions = button("FAITES VOS JEUX · QUI VEUT DÉFENDRE SON CHOIX ?", "debate", {kind:"primary"}); break;
    case "debate": stageActions = (hasNext ? button("NOUVELLE INFORMATION", "update", {kind:"primary"}) : "") +
      button("CE QU’ON PEUT RETENIR", "learning", {kind:hasNext ? "" : "primary"}); break;
    case "update": stageActions = button(state.index ? "NOUVEAU VOTE" : "SECOND VOTE", "next-round", {kind:"primary"}) + button("CE QU’ON PEUT RETENIR", "learning"); break;
    case "learning": stageActions = button(session.drawn ? (session.drawn.length === session.scenarios.length ? "FIN DE LA JOURNÉE" : "RETOUR AUX CARTES") : session.position + 1 === session.scenarios.length ? "FIN DE LA JOURNÉE" : "SITUATION SUIVANTE", "forward", {kind:"primary"}); break;
  }
  if (session.demo) return renderStudent(item, state);
  return `<div class="flow"><article class="card stage ${session.drawn && phase === "intro" ? "card-reveal" : ""}">
    <div class="meta"><span class="tag gold">${session.drawn ? "CARTE" : "SITUATION"} ${session.position + 1} / ${session.scenarios.length}</span><span class="tag">${escape(item.time)}</span><span class="tag">${escape(item.category)}</span><span class="tag">${formats[item.format][0]}</span></div>
    <h1>${escape(item.title)}</h1>
    <p class="context">${escape(item.context)}</p>
    ${information(item, state)}
    ${showChoices ? voteChoices(item, phase === "open" && !projection && !usesNetwork(vote)) : ""}
    ${phase === "open" || phase === "closed" ? `<p class="question" id="vote-count">${voteStatus(phase, vote)}</p>` : ""}
    ${session.drawn && phase === "closed" && state.index === 0 && !vote.published ? `<p class="panel">${oralPrompt}</p>` : ""}
    ${phase === "open" && !usesNetwork(vote) ? openControls(item, vote) : ""}
    ${phase === "results" || phase === "debate" ? resultsPanel(item, state) : ""}
    ${phase === "debate" ? '<div class="panel"><h2>Qui veut défendre son choix ?</h2></div>' : ""}
    ${phase === "learning" ? `<div class="panel reveal">${item.format === "finale" ? "<h2>Qui assume la décision ?</h2>" : "<h2>Ce qu’on peut retenir</h2>"}<p class="context">${escape(item.learning)}</p></div>` : ""}
    ${prompts ? `<div class="panel teacher-only"><h2>Questions de débrief</h2><ul>${item.debriefQuestions.map(question => `<li>${escape(question)}</li>`).join("")}</ul></div>` : ""}
    <div class="actions ${network?.hosted ? "single-controls" : ""}">${stageActions}</div>
  </article>${teacherPanel(state, hasNext, stageActions)}</div>`;
}

function teacherPanel(state, hasNext, stageActions) {
  const phase = state.phase;
  return `<aside class="card side teacher-only"><p class="eyebrow">Pilotage</p><h2>Panneau enseignant</h2>
    <p class="muted">${labels[phase]} · Tour ${state.index + 1}</p>
    ${network && !network.hosted ? `<p id="participants" class="muted">${connectedParticipants} appareil(s) connecté(s)</p>` : ""}
    ${network?.hosted ? `<div class="actions step-controls">${stageActions}</div><hr>` : ""}
    <div class="actions">
      ${session.drawn ? small(session.drawn.length === session.scenarios.length ? "Fin de la journée →" : "Retour aux cartes", "forward") :
        small("← Situation précédente", "previous", {disabled:session.position === 0}) +
        small(session.position + 1 === session.scenarios.length ? "Fin de la journée →" : "Situation suivante →", "forward")}
    </div><hr><div class="actions">
      ${small("Ouvrir le vote", "open", {disabled: !["intro","closed"].includes(phase)})}
      ${small("Fermer le vote", "close", {disabled: phase !== "open"})}
      ${small("Révéler les résultats", "results", {disabled: !(session.drawn ? ["closed","debate"] : ["closed","open","debate"]).includes(phase)})}
      ${small("Masquer les résultats", "hide-results", {disabled: !["results","debate"].includes(phase)})}
      ${small("Nouvelle information", "update", {disabled: !hasNext || !["results","debate"].includes(phase)})}
      ${small(state.index ? "Nouveau vote" : "Second vote", "next-round", {disabled: phase !== "update"})}
      ${small(prompts ? "Masquer les questions de débrief" : "Afficher les questions de débrief", "prompts")}
      ${small("Ce qu’on peut retenir", "learning", {disabled: !["closed","results","debate","update"].includes(phase)})}
    </div><hr><div class="actions">
      ${small("Afficher le profil", "profile")}
      ${small("Remettre la situation à zéro", "reset")}
      ${small("Recommencer toute la séance", "restart")}
    </div></aside>`;
}

function renderStudent(item, state) {
  const recorded = state.phase === "closed";
  const completed = state.phase === "learning";
  return `<article class="card student">
    <p class="eyebrow">Mode étudiant · Démonstration locale · Situation ${session.position + 1}/${session.scenarios.length}</p>
    <h1>${escape(item.title)}</h1>
    <p class="context">${escape(item.context)}</p>
    ${information(item, state)}
    ${state.phase === "open" ? voteChoices(item, true) + `<div class="actions">${button("Valider mon vote", "cast", {kind:"primary"})}</div>` : ""}
    ${recorded ? `<div class="panel reveal"><h2>Vote enregistré</h2><p>Regardez maintenant l’écran principal.</p></div>
    <div class="actions">${button(updates(item).length > state.index ? "Tester la nouvelle information" : "Afficher le point d’apprentissage", updates(item).length > state.index ? "update" : "learning", {kind:"primary"})}</div>` : ""}
    ${state.phase === "update" ? `<div class="actions">${button("Voter à nouveau", "next-round", {kind:"primary"})}</div>` : ""}
    ${completed ? `<div class="panel"><h2>Ce qu’on peut retenir</h2><p>${escape(item.learning)}</p></div><div class="actions">${button(session.position + 1 < session.scenarios.length ? "Situation suivante" : "Terminer la démonstration", "forward", {kind:"primary"})}</div>` : ""}
  </article>`;
}

function summarize() {
  let situations = 0, decisions = 0, changed = 0, comparisons = 0, unknown = 0, profileWeight = 0;
  const scores = DIMENSIONS.map(() => 0);
  const categories = new Map();
  session.scenarios.forEach((item, index) => {
    const rounds = session.states[index].rounds;
    const valid = rounds.filter(vote => vote.published && total(vote.counts));
    if (!valid.length) return;
    situations++;
    categories.set(item.category, (categories.get(item.category) || 0) + 1);
    valid.forEach(vote => { decisions += total(vote.counts); });
    for (let i = 1; i < rounds.length; i++) {
      if (!rounds[i - 1].published || !rounds[i].published ||
          !total(rounds[i - 1].counts) || !total(rounds[i].counts)) continue;
      const count = changesBetween(rounds[i - 1], rounds[i]);
      if (count === null) unknown++;
      else { changed += count.changed; comparisons++; }
    }
    const finalVote = valid.at(-1);
    const sum = total(finalVote.counts);
    profileWeight++;
    DIMENSIONS.forEach((dimension, column) => {
      scores[column] += item.choices.reduce((score, choice, i) =>
        score + choice.scores[dimension] * finalVote.counts[i] / sum, 0);
    });
  });
  return {
    situations, decisions, changed, comparisons, unknown,
    scores: profileWeight ? scores.map(score => Math.round(50 + 50 * score / (3 * profileWeight))) : null,
    categories: [...categories].sort((a,b) => b[1] - a[1])
  };
}

function renderSummary() {
  const stats = summarize();
  const finalScreen = screen === "final";
  const peak = stats.scores ? Math.max(...stats.scores) : 0;
  const dominant = stats.scores?.map((score, index) => score === peak ? tendencies[index] : null).filter(Boolean) || [];
  return `<article class="card stage">
    ${finalScreen ? '<h1>Fin de la journée</h1>' : "<h1>Votre management aujourd’hui</h1>"}
    <div class="metrics">
      <div class="metric"><strong>${stats.situations} / ${session.scenarios.length}</strong> Situations votées</div>
      <div class="metric"><strong>${stats.decisions}</strong> Décisions enregistrées</div>
      <div class="metric"><strong>${stats.comparisons ? stats.changed : "—"}</strong> Changements mesurés</div>
    </div>
    ${stats.unknown ? `<p class="muted">${stats.unknown} comparaison(s) de totaux sans suivi individuel.</p>` : ""}
    <div class="summary-grid">
      <div><h2>${finalScreen ? "Votre management aujourd’hui" : "Dimensions des décisions"}</h2>
      ${stats.scores ? `<div class="results">${stats.scores.map((score, i) => `<div><div class="bar-head"><span>${dimensionLabels[i]}</span><strong>${score} / 100</strong></div><meter min="0" max="100" value="${score}" aria-label="${dimensionLabels[i]}"></meter></div>`).join("")}</div>
      <p class="comparison-note"><strong>Tendance · ${new Set(dominant).size === 1 && peak > 50 ? dominant[0] : "L’équilibriste"}</strong></p>`
      : "<p>Le profil apparaît après la révélation de votes.</p>"}
      <p>Ce résultat ne définit pas votre personnalité. Il représente uniquement ce que vos décisions ont privilégié pendant cette simulation.</p></div>
      <div><h2>Catégories les plus sollicitées</h2>
      ${stats.categories.length ? `<ul>${stats.categories.slice(0,5).map(([category, count]) => `<li>${escape(category)} · ${count}</li>`).join("")}</ul>` : "<p>Aucune catégorie votée.</p>"}</div>
    </div>
    ${finalScreen ? `<div class="panel"><h2>Qu’est-ce qui a le plus fait évoluer vos décisions ?</h2>
      <div class="actions">${reflection.map((word,i) => button(word, "reflect", {value:i,kind:session.reflection === i ? "primary" : ""}).replace('type="button"', `type="button" aria-pressed="${session.reflection === i}"`)).join("")}</div>
      <p class="comparison-note">Manager, ce n’est pas avoir toujours la bonne réponse. C’est savoir décider, écouter, assumer et ajuster quand de nouvelles informations apparaissent.</p></div>` : ""}
    <div class="actions">${button("Retour à la situation", "back-to-session")}${button("Accueil", "home")}</div>
  </article>`;
}

function startSession(items, demo = false, cards = false) {
  session = { scenarios: items, states: items.map(makeState), position: 0, demo, finished: false, reflection: null };
  if (demo) current().phase = "open";
  else teacherSession = session;
  if (cards) session.drawn = [];
  roster = [];
  rosterOpen = false;
  screen = cards ? "cards" : "session";
  manual = prompts = false;
  selected = null;
  refresh(true);
}

function selectedItems() {
  return selection.map(id => bank.find(item => item.id === id)).filter(Boolean);
}

function randomSelection(amount) {
  const candidates = bank.filter(item => item.format !== "finale");
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const closing = bank.find(item => item.format === "finale");
  selection = candidates.slice(0, closing ? amount - 1 : amount).map(item => item.id);
  if (closing) selection.push(closing.id);
}

function navigate(offset) {
  if (session.drawn) {
    if (offset < 0) return;
    session.finished = session.drawn.length === session.scenarios.length;
    screen = session.finished ? "final" : "cards";
  } else if (session.position + offset >= session.scenarios.length) {
    session.finished = true;
    screen = "final";
  } else {
    session.position = Math.max(0, session.position + offset);
    session.finished = false;
    if (session.demo && current().phase === "intro") current().phase = "open";
  }
  selected = null;
  manual = prompts = false;
  refresh(true);
}

function setPhase(phase) {
  current().phase = phase;
  manual = false;
  refresh();
}

function nextRound() {
  const state = current();
  if (state.phase !== "update" || state.index >= updates(scenario()).length) return;
  state.index++;
  state.rounds[state.index] ||= makeRound(scenario().choices.length);
  selected = null;
  setPhase("open");
}

function simulate() {
  const item = scenario(), state = current(), vote = round();
  const n = Number(settings.classroom);
  const previous = state.rounds[state.index - 1];
  state.rounds.length = state.index + 1;
  const weights = item.choices.map(() => 0.3 + Math.random());
  const sum = total(weights);
  function draw() {
    let cursor = Math.random() * sum;
    const choice = weights.findIndex(weight => (cursor -= weight) < 0);
    return choice < 0 ? weights.length - 1 : choice;
  }
  vote.ballots = Array.from({length: n}, (_, i) =>
    previous?.source === "simulation" && previous.ballots.length === n && Math.random() < 0.55 ? previous.ballots[i] : draw());
  vote.counts = item.choices.map((_, index) => vote.ballots.filter(choice => choice === index).length);
  vote.source = "simulation";
  vote.published = false;
  manual = false;
  refresh();
}

function toggleProjection() {
  projection = !projection;
  render();
  if (projection) document.documentElement.requestFullscreen?.()?.catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {});
}

function validateBank(raw) {
  const fail = message => { throw new Error(message); };
  if (!Array.isArray(raw) || !raw.length || raw.length > 500) fail("Le fichier doit contenir un tableau de 1 à 500 situations.");
  const ids = new Set();
  const validText = (text, limit) => typeof text === "string" && text.trim().length > 0 && text.length <= limit;
  return raw.map((item, index) => {
    const check = (condition, field) => { if (!condition) fail(`Situation ${index + 1} · ${field}`); };
    check(item && typeof item === "object", "objet attendu.");
    check(typeof item.id === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(item.id) && !ids.has(item.id), "identifiant manquant, invalide ou répété.");
    ids.add(item.id);
    for (const [field, limit] of Object.entries({title:150, category:70, context:1100, question:200, learning:650})) {
      check(validText(item[field], limit), `champ « ${field} » manquant ou trop long.`);
    }
    check(typeof item.format === "string" && Object.hasOwn(formats, item.format), "format inconnu.");
    check(typeof item.time === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.time), "heure attendue au format HH:MM.");
    const duration = item.duration ?? formats[item.format][1];
    check(Number.isInteger(duration) && duration >= 1 && duration <= 60, "durée attendue de 1 à 60 minutes.");
    check(Array.isArray(item.choices) && item.choices.length >= 3 && item.choices.length <= 4, "3 ou 4 choix sont nécessaires.");
    const choices = item.choices.map((choice, position) => {
      const id = "ABCD"[position];
      check(choice?.id === id && validText(choice.text, 350), `choix ${id} manquant ou invalide.`);
      check(choice.scores && DIMENSIONS.every(dimension => Number.isInteger(choice.scores[dimension]) &&
        Math.abs(choice.scores[dimension]) <= 3), `les 6 scores de ${id} doivent être entiers entre −3 et 3.`);
      return {id, text:choice.text, scores:Object.fromEntries(DIMENSIONS.map(dimension => [dimension, choice.scores[dimension]]))};
    });
    check(Array.isArray(item.debriefQuestions) && item.debriefQuestions.length >= 1 && item.debriefQuestions.length <= 8 &&
      item.debriefQuestions.every(text => validText(text, 350)), "questions de débrief invalides.");
    check(item.surprise === undefined || validText(item.surprise, 1000), "information surprise invalide.");
    check(item.updates === undefined || (Array.isArray(item.updates) && item.updates.length > 0 && item.updates.length <= 10 &&
      item.updates.every(text => validText(text, 1000))), "informations successives invalides.");
    check(item.format !== "surprise" || item.surprise || item.updates, "information surprise requise.");
    check(item.format !== "finale" || item.updates?.length >= 2, "plusieurs informations sont requises pour la finale.");
    return {
      id:item.id, title:item.title, category:item.category, format:item.format, time:item.time, duration,
      context:item.context, question:item.question, choices, debriefQuestions:item.debriefQuestions, learning:item.learning,
      ...(item.surprise ? {surprise:item.surprise} : {}), ...(item.updates ? {updates:item.updates} : {})
    };
  });
}

function exportBank() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(bank, null, 2)], {type:"application/json"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = "manager-live-situations.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function back() {
  const state = current();
  if (state.phase === "learning") return setPhase(round().published ? "debate" : "closed");
  if (state.phase === "update") return setPhase("debate");
  if (state.phase === "debate") return setPhase("results");
  if (state.phase === "results") return setPhase("closed");
  if (state.phase === "closed") return setPhase("open");
  if (state.phase === "open" && state.index) {
    state.index--;
    selected = null;
    return setPhase("update");
  }
  if (state.phase === "open") return setPhase("intro");
  if (session.position) navigate(-1);
}

function advance() {
  switch (current().phase) {
    case "intro": return action("open");
    case "open": return action("close");
    case "closed": return action("results");
    case "results": return action("debate");
    case "debate": return action(updates(scenario()).length > current().index ? "update" : "learning");
    case "update": return action("next-round");
    case "learning": return action("forward");
  }
}

function action(name, value) {
  if (name === "copy-link") {
    const link = document.querySelector("#student-link");
    if (!network?.code || !link) return;
    navigator.clipboard.writeText(link.href).then(() => toast("Lien copié."))
      .catch(() => toast("Faites un clic droit sur le lien étudiant pour copier son adresse."));
    return;
  }
  if (name === "offline") {
    if (network) {
      const previousNetwork = network;
      network = null;
      previousNetwork.stage({room:null,stage:null,display:null}).catch(() => {});
      render();
      return toast("Mode connecté quitté. Les commandes locales sont disponibles.");
    }
    return;
  }
  if (name === "home" || name === "bank" || name === "settings") {
    if (projection) toggleProjection();
    screen = name;
    return refresh(true);
  }
  if (name === "start" || name === "start-cards" || name === "random-home") {
    if (teacherSession && !teacherSession.finished && !confirm("Remplacer la dernière séance par une nouvelle ?")) return;
    if (name === "random-home") randomSelection(8);
    const items = selectedItems();
    return items.length ? startSession(items, false, name === "start-cards") : toast("Sélectionnez au moins une situation dans la banque.");
  }
  if (name === "demo") return startSession([SCENARIOS[2], SCENARIOS[12]], true);
  if (name === "resume" && teacherSession) {
    session = teacherSession;
    screen = session.finished ? "final" : session.atDeck || (session.drawn && !session.drawn.length) ? "cards" : "session";
    manual = prompts = false;
    selected = null;
    return refresh(true);
  }
  if (screen === "cards") {
    if (name === "card-finish") {
      session.finished = true;
      screen = "final";
      return refresh(true);
    }
    if (name === "draw-card") {
      const index = Number(value);
      const card = cardDeck()[index];
      if (!card || card.played || card.locked) return;
      session.drawn.push(index);
      session.position = index;
      screen = "session";
      return refresh(true);
    }
  }
  if (screen === "bank") {
    switch (name) {
      case "all": selection = bank.map(item => item.id); break;
      case "none": selection = []; break;
      case "random": randomSelection(Number(document.querySelector("#random-size").value)); break;
      case "up":
      case "down": {
        const i = selection.indexOf(value);
        const j = i + (name === "up" ? -1 : 1);
        [selection[i], selection[j]] = [selection[j], selection[i]];
        break;
      }
      case "export": return exportBank();
      case "import": return importInput.click();
    }
    return refresh();
  }
  if (name === "erase") {
    if (!confirm("Effacer la séance sauvegardée, les paramètres et la sélection ?")) return;
    try { localStorage.removeItem(storageKey); storageOK = true; }
    catch { storageOK = false; }
    teacherSession = session = null;
    selection = defaultSelection.slice();
    settings = { classroom:32 };
    render();
    return toast("Sauvegarde effacée.");
  }
  if (name === "projection") return toggleProjection();
  if (name === "back-to-session") {
    session.finished = false;
    screen = "session";
    return refresh(true);
  }
  if (name === "reflect") {
    session.reflection = Number(value);
    return refresh();
  }
  if (screen !== "session") return;
  const phase = current().phase, vote = round();
  switch (name) {
    case "open": if (["intro","closed"].includes(phase)) setPhase("open"); break;
    case "close": if (phase === "open") setPhase("closed"); break;
    case "choose":
      if (phase !== "open" || projection || (!session.demo && usesNetwork(vote))) return;
      selected = Number(value);
      app.querySelectorAll("[data-action=choose]").forEach(choice => choice.setAttribute("aria-pressed", String(Number(choice.dataset.value) === selected)));
      break;
    case "cast":
      if (phase !== "open" || (!session.demo && usesNetwork(vote))) return;
      if (selected === null) return toast("Choisissez une réponse avant de valider le vote.");
      if (vote.source === "simulation") return toast("Saisissez les totaux pour remplacer ou modifier un vote simulé.");
      current().rounds.length = current().index + 1;
      vote.counts[selected]++;
      vote.ballots = null;
      vote.source = session.demo ? "demo" : "manual";
      if (session.demo) { vote.ballots = [selected]; vote.published = true; }
      else vote.published = false;
      selected = null;
      if (session.demo) setPhase("closed");
      else { refresh(); toast("Vote ajouté."); }
      break;
    case "simulate": if (phase === "open" && !usesNetwork(vote)) simulate(); break;
    case "manual": if (phase === "open" && !usesNetwork(vote)) { manual = !manual; render(); app.querySelector("#manual-form input")?.focus(); } break;
    case "results":
      if ((session.drawn ? ["closed","debate"] : ["open","closed","debate"]).includes(phase)) {
        vote.published = true;
        setPhase("results");
      }
      break;
    case "hide-results": if (["results","debate"].includes(phase)) setPhase("closed"); break;
    case "debate": if (phase === "results") { prompts = true; setPhase("debate"); } break;
    case "prompts": prompts = !prompts; render(); break;
    case "update":
      if ((["results","debate"].includes(phase) || (session.demo && phase === "closed")) &&
          updates(scenario()).length > current().index) setPhase("update");
      break;
    case "next-round": nextRound(); break;
    case "learning":
      if (["closed","results","debate","update"].includes(phase)) {
        prompts = false;
        setPhase("learning");
      }
      break;
    case "forward": navigate(1); break;
    case "previous": if (session.position) navigate(-1); break;
    case "profile": screen = "profile"; refresh(true); break;
    case "reset":
      if (!confirm("Effacer les votes et recommencer cette situation ?")) return;
      session.states[session.position] = makeState(scenario());
      manual = prompts = false;
      selected = null;
      refresh(true);
      break;
    case "restart":
      if (confirm("Effacer tous les votes et recommencer cette séance ?")) startSession(session.scenarios, false, Boolean(session.drawn));
      break;
  }
}

document.addEventListener("click", event => {
  const control = event.target.closest("button[data-action]");
  if (control && !control.disabled) dispatch(() => action(control.dataset.action, control.dataset.value));
});

app.addEventListener("change", event => {
  const id = event.target.dataset.select;
  if (id) {
    selection = event.target.checked ? [...selection, id] : selection.filter(value => value !== id);
    refresh();
    [...app.querySelectorAll("[data-select]")].find(control => control.dataset.select === id)?.focus();
  }
  if (event.target.id === "bank-category") {
    categoryFilter = event.target.value;
    render();
    document.querySelector("#bank-category")?.focus();
  }
});

app.addEventListener("input", event => {
  if (event.target.id !== "bank-search") return;
  bankFilter = event.target.value;
  const index = event.target.selectionStart;
  render();
  const input = document.querySelector("#bank-search");
  input.focus();
  input.setSelectionRange(index, index);
});

app.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  if (form.id === "settings-form") {
    settings.classroom = Number(data.get("classroom"));
    refresh();
    toast("Paramètres enregistrés.");
  }
  if (form.id === "manual-form" && screen === "session" && current().phase === "open" && !usesNetwork(round())) {
    const vote = round();
    current().rounds.length = current().index + 1;
    vote.counts = scenario().choices.map(choice => Number(data.get(choice.id)));
    vote.source = "manual";
    vote.ballots = null;
    vote.published = false;
    manual = false;
    selected = null;
    refresh();
    toast("Nombres de votes enregistrés.");
  }
});

importInput.addEventListener("change", async () => {
  const file = importInput.files[0];
  importInput.value = "";
  if (!file) return;
  try {
    if (file.size > 4_000_000) throw new Error("Fichier trop volumineux (4 Mo maximum).");
    let raw;
    try { raw = JSON.parse((await file.text()).replace(/^\uFEFF/, "")); }
    catch { throw new Error("Le fichier ne contient pas un JSON lisible."); }
    const imported = validateBank(raw);
    bank = imported;
    selection = selection.filter(id => bank.some(item => item.id === id));
    bankFilter = categoryFilter = "";
    refresh();
    toast(`${bank.length} situation(s) importée(s). La banque importée est disponible dans cet onglet.`);
  } catch (error) { toast(`Import refusé · ${error.message}`); }
});

document.addEventListener("keydown", event => {
  if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || event.repeat ||
      event.target.closest("input,select,textarea,[contenteditable]") ||
      !["session","cards","profile","final"].includes(screen) || session.demo) return;
  const key = event.key.toLowerCase();
  if (key === "f") { event.preventDefault(); toggleProjection(); return; }
  if (screen !== "session") {
    if (key === "arrowleft" && screen !== "cards") { event.preventDefault(); dispatch(() => action("back-to-session")); }
    return;
  }
  const shortcuts = { arrowright:advance, arrowleft:back, r:() => action("results"), n:() => action("update"), d:() => {
    if (current().phase === "results") action("debate");
    else if (!projection) action("prompts");
  }};
  if (shortcuts[key]) { event.preventDefault(); dispatch(shortcuts[key]); }
});

function voteStatus(phase, vote) {
  return `${labels[phase]} · ${total(vote.counts)} vote(s) reçu(s)`;
}

function liveVote() {
  const active = ["session","cards","final","profile"].includes(screen) && !session.demo;
  const room = active ? (session.networkRoom ||= network.id()) : null;
  const snapshot = {room, stage:null, display:null};
  if (!active) return {payload:snapshot};
  if (screen === "cards") {
    snapshot.display = {type:"cards", cards:cardDeck()};
    return {payload:snapshot};
  }
  if (screen !== "session") {
    const stats = summarize();
    snapshot.display = {
      type:screen, decisions:stats.decisions, situations:stats.situations, length:session.scenarios.length,
      dimensions:stats.scores?.map((score,i) => ({label:dimensionLabels[i],score})) || []
    };
    return {payload:snapshot};
  }

  const item = scenario();
  const state = current();
  const vote = round();
  vote.networkKey ||= network.id();
  const facts = updates(item);
  const open = state.phase === "open" && Boolean(usesNetwork(vote));
  const stage = {
    key:vote.networkKey, position:session.position + 1, title:item.title, context:item.context,
    question:item.question, choices:item.choices.map(choice => choice.text),
    fact:facts[state.index - (state.phase === "update" ? 0 : 1)] || "",
    open, learning:state.phase === "learning" ? item.learning : ""
  };
  const {key, ...publicStage} = stage;
  const previous = state.rounds[state.index - 1];
  const results = ["results","debate"].includes(state.phase) ? {
    current:vote.counts, previous:previous?.published ? previous.counts : null,
    previousKey:previous?.published ? previous.networkKey : null,
    changes:changesBetween(previous,vote)
  } : null;
  snapshot.stage = stage;
  snapshot.display = {
    ...publicStage, type:"situation", phase:state.phase, category:item.category, length:session.scenarios.length,
    total:total(vote.counts), results, card:Boolean(session.drawn),
    oral:session.drawn && state.phase === "closed" && state.index === 0 && !vote.published ? oralPrompt : ""
  };
  return {vote,open,payload:snapshot};
}

function takeNetworkCounts(vote, data) {
  if (!vote || !data.available || (vote.source && vote.source !== "network")) return;
  const counts = vote.counts.map((_, index) => data.ballots.filter(([,choice]) => choice === index).length);
  if (JSON.stringify(vote.ballots) === JSON.stringify(data.ballots)) return;
  vote.ballots = data.ballots;
  vote.source = "network";
  vote.counts = counts;
  persist();
}

function renderRoster(summary) {
  const active = screen === "session";
  const voted = active ? roster.filter(entry => entry.voted) : [];
  summary.textContent = active ? `${roster.length} inscrits · ${voted.length} ont voté` : `${roster.length} inscrits`;
  const lists = document.querySelector("#roster-lists");
  const pending = active ? roster.filter(entry => !entry.voted) : roster;
  const section = (title, people) => `<section><h3>${title}</h3>
    ${people.length ? `<ul>${people.slice().sort((a,b) => a.name.localeCompare(b.name,"fr")).map(entry => `<li>${escape(entry.name)}</li>`).join("")}</ul>` : "<p>Personne pour le moment.</p>"}</section>`;
  const html = (active ? section("Ont voté",voted) : "") + section(active ? "En attente" : "Inscrits",pending);
  if (lists.dataset.content !== html) {
    lists.innerHTML = html;
    lists.dataset.content = html;
  }
}

function updateNetworkStatus() {
  const participants = document.querySelector("#participants");
  if (participants) participants.textContent = `${connectedParticipants} appareil(s) connecté(s)`;
  const code = document.querySelector("#room-code");
  const link = document.querySelector("#student-link");
  const live = document.querySelector("#live-participants");
  const status = document.querySelector("#live-status");
  if (code) code.textContent = network?.code || "—";
  if (link && network?.code) link.href = "/student?code=" + encodeURIComponent(network.code);
  if (live) renderRoster(live);
  const details = document.querySelector("#roster");
  if (details) details.ontoggle = () => { if (details.isConnected) rosterOpen = details.open; };
  if (status) status.textContent = networkDegraded ? "Reconnexion en cours…" : networkBusy ? "Synchronisation…" :
    screen === "session" ? voteStatus(current().phase,round()) : screen === "cards" ? "Choix de la carte" : "Bilan de séance";
  const counter = document.querySelector("#vote-count");
  if (counter && screen === "session") counter.textContent = voteStatus(current().phase, round());
}

async function syncNetwork(previous, next) {
  let data;
  try { data = await network.stage(next?.payload); }
  catch {
    await network.connect();
    data = await network.stage(next?.payload);
  }
  connectedParticipants = data.participants;
  roster = data.roster || [];
  if (next) takeNetworkCounts(next.vote, data);
  if (previous?.open && previous.vote !== next?.vote) {
    takeNetworkCounts(previous.vote, await network.counts(previous.vote.networkKey));
  }
  if (screen === "session" && ["results","debate"].includes(current().phase)) render();
  else if (screen === "final" || screen === "profile") render();
  networkDegraded = false;
  updateNetworkStatus();
  persist();
}

function dispatch(callback) {
  if (networkBusy) return toast("Synchronisation en cours. Réessayez dans un instant.");
  if (!network) return callback();
  const previous = liveVote();
  callback();
  if (!network) return;
  const next = liveVote();
  if (JSON.stringify(previous?.payload) === JSON.stringify(next?.payload)) return;
  networkBusy = true;
  updateNetworkStatus();
  syncNetwork(previous, next).catch(() => {
    networkDegraded = true;
    updateNetworkStatus();
    toast("Connexion au serveur interrompue. La connexion sera retentée.");
  }).finally(() => { networkBusy = false; updateNetworkStatus(); });
}

async function pollNetwork() {
  if (!network || networkBusy) return;
  const client = network;
  const snapshot = liveVote();
  if (networkDegraded) {
    networkBusy = true;
    try { await syncNetwork(null, snapshot); } catch {}
    finally { networkBusy = false; }
    return;
  }
  try {
    const data = await client.counts(snapshot.vote?.networkKey);
    if (network !== client || networkBusy) return;
    connectedParticipants = data.participants;
    roster = data.roster || [];
    if (snapshot?.open && screen === "session" && snapshot.vote === round() && current().phase === "open") {
      takeNetworkCounts(snapshot.vote, data);
    }
    updateNetworkStatus();
  } catch { if (network === client) { networkDegraded = true; updateNetworkStatus(); } }
}

render();
if (window.MANAGER_LAN) {
  window.MANAGER_LAN.connect().then(() => {
    network = window.MANAGER_LAN;
    if (network.hosted && teacherSession) {
      session = teacherSession;
      screen = session.finished ? "final" : session.atDeck || (session.drawn && !session.drawn.length) ? "cards" : "session";
    }
    render();
    if (screen !== "home") return syncNetwork(null, liveVote());
  }).catch(() => { network = null; render(); toast("Serveur indisponible. Commandes locales actives."); });
  setInterval(pollNetwork, 900);
}
const artwork = new Image();
artwork.onload = () => { artPresent = true; if (screen === "home") render(); };
artwork.onerror = () => { artPresent = false; };
artwork.src = "assets/manager.png";

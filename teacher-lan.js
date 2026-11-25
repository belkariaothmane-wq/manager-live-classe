"use strict";

const lan = {
  hosted: document.body.dataset.hosted === "true",
  key: null,
  code: null,
  signIn: null,
  id: () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,"0")).join(""),
  async call(route, options = {}) {
    const response = await fetch("/api/teacher/" + route, {
      ...options,
      signal: AbortSignal.timeout(6000),
      headers: {"X-Manager-Key": this.key || "", "Content-Type":"application/json"}
    });
    if (!response.ok) throw Object.assign(new Error("Connexion au serveur impossible."),{status:response.status});
    const result = await response.json();
    if (result.code) this.code = result.code;
    return result;
  },
  async connect() {
    if (!this.hosted) {
      this.key = (await this.call("key")).key;
      return;
    }
    if (this.signIn) return this.signIn;
    this.signIn = this.authenticate();
    try { await this.signIn; } finally { this.signIn = null; }
  },
  async authenticate() {
    try { this.key = sessionStorage.getItem("manager-live-teacher") || null; } catch {}
    if (this.key) {
      try { await this.counts(); return; }
      catch (error) { if (error.status !== 401) throw error; }
    }
    this.key = null;
    const dialog = document.createElement("dialog");
    dialog.className = "card auth";
    dialog.innerHTML = '<form><p class="eyebrow">Mode connecté</p><h1>Espace enseignant</h1><label for="teacher-password">Mot de passe enseignant</label><input id="teacher-password" type="password" autocomplete="current-password" required><button class="btn primary">Se connecter</button><p role="status"></p></form>';
    document.body.append(dialog);
    dialog.addEventListener("cancel", event => event.preventDefault());
    dialog.showModal();
    await new Promise(resolve => {
      const form = dialog.querySelector("form");
      const input = dialog.querySelector("input");
      const button = dialog.querySelector("button");
      form.onsubmit = async event => {
        event.preventDefault();
        button.disabled = true;
        try {
          this.key = (await this.call("key",{method:"POST",body:JSON.stringify({password:input.value})})).key;
          try { sessionStorage.setItem("manager-live-teacher",this.key); } catch {}
          dialog.close();
          dialog.remove();
          resolve();
        } catch (error) {
          dialog.querySelector("[role=status]").textContent = error.status === 401 ? "Mot de passe incorrect." : "Serveur indisponible. Réessayez.";
          button.disabled = false;
        }
      };
    });
  },
  stage(payload) {
    return this.call("stage", {method:"POST", body:JSON.stringify(payload)});
  },
  counts(key) {
    return this.call("counts?key=" + encodeURIComponent(key || ""));
  }
};
window.MANAGER_LAN = lan;

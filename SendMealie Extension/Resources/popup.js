const DEFAULTS = { mealieUrl: "", token: "", endpoint: "/api/recipes/create/url" };
const sendView = document.querySelector("#send-view");
const settingsView = document.querySelector("#settings-view");
const sendButton = document.querySelector("#send-button");
const sendLabel = document.querySelector("#send-label");
const DONE_MS = 6000;
let doneTimer = null;

// La confirmation est passagère : au-delà, le bouton reprend son rôle normal.
function clearSentState() {
  clearTimeout(doneTimer);
  sendButton.classList.remove("done");
  sendButton.disabled = false;
  sendLabel.textContent = "Enregistrer sur Mealie";
  openRecipe.hidden = true;
}
const openRecipe = document.querySelector("#open-recipe");
const resetButton = document.querySelector("#reset-button");
const autoConnectButton = document.querySelector("#auto-connect");
const retryButton = document.querySelector("#retry-connect");
const backButton = document.querySelector("#back-button");
const settingsLink = document.querySelector("#settings-link");
const REPO_URL = "https://github.com/BlackMOTD/SendMealie";
const WEB_URL = "https://warneford.fr";
const status = document.querySelector("#status");
const settingsStatus = document.querySelector("#settings-status");
let currentTab;
let recipeData = null;
let settings = { ...DEFAULTS };
let lastRecipeUrl = null;
const setupMode = new URLSearchParams(location.search).has("setup");

function showStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = kind;
}

const accountRow = document.querySelector("#account");
const accountUserLabel = document.querySelector("#account-user span");
const instanceLink = document.querySelector("#account-recipes");
const accountRecipesLabel = instanceLink.querySelector("span");
const hostLabel = document.querySelector("#host");

function renderAccount(user, recipes) {
  accountUserLabel.textContent = user ? user.charAt(0).toUpperCase() + user.slice(1) : "";
  accountRecipesLabel.textContent = Number.isFinite(recipes)
    ? `${recipes} recette${recipes > 1 ? "s" : ""}`
    : settings.mealieUrl
    ? "Ouvrir Mealie"
    : "";

  accountUserLabel.parentElement.hidden = !accountUserLabel.textContent;
  accountRecipesLabel.parentElement.hidden = !accountRecipesLabel.textContent;
  accountRow.hidden = !accountUserLabel.textContent && !accountRecipesLabel.textContent;
}

// Cache d’abord pour un affichage instantané, puis rafraîchissement depuis Mealie.
async function loadAccount() {
  if (setupMode) return;

  const cached = await browser.storage.local.get({ accountUser: "", accountRecipes: null });
  renderAccount(cached.accountUser, cached.accountRecipes);

  const info = await browser.runtime.sendMessage({ type: "account-info" });
  if (info?.ok) renderAccount(info.user, info.recipes);
}

function showView(name) {
  const settings = name === "settings";
  sendView.hidden = settings;
  settingsView.hidden = !settings;
  settingsLink.hidden = settings;
  backButton.hidden = !settings;
  resetButton.hidden = !settings;
  if (!settings) disarmReset();
}

function refreshInstanceLink() {
  instanceLink.disabled = !settings.mealieUrl;
  instanceLink.title = settings.mealieUrl
    ? `Ouvrir ${settings.mealieUrl}`
    : "Renseignez d’abord l’adresse de Mealie";

  if (setupMode) return;
  hostLabel.textContent = settings.mealieUrl
    ? settings.mealieUrl.replace(/^https?:\/\//, "")
    : "Aucune instance configurée";
}

async function openInTab(url) {
  await browser.tabs.create({ url });
  if (!setupMode) window.close();
}

async function loadPage() {
  [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
  document.querySelector("#recipe-title").textContent = currentTab?.title || "Page sans titre";
  try {
    const metadata = await browser.tabs.sendMessage(currentTab.id, { type: "get-recipe-metadata" });
    if (metadata?.title) document.querySelector("#recipe-title").textContent = metadata.title;
    recipeData = metadata?.recipe || null;
    if (metadata?.isRecipe) {
      document.querySelector("#recipe-label").textContent = "Sauvegarder la recette ?";
      document.querySelector(".card").classList.add("card-active");
    }
  } catch {
    // Pas de réponse du script de page : Safari n’autorise pas l’extension ici.
    // Sans lui, ni détection de recette ni extraction des ingrédients.
    if (/^https?:/.test(currentTab?.url || "")) {
      document.querySelector("#recipe-label").textContent = "Accès refusé à cette page";
      showStatus(
        status,
        "Safari n’autorise pas SendMealie sur ce site. Cliquez sur son icône dans la barre d’outils, puis « Toujours autoriser sur ce site web ».",
        "error"
      );
    }
  }
}

async function loadSettings() {
  settings = await browser.storage.local.get(DEFAULTS);
  if (settings.endpoint === "/api/recipes/create") {
    settings.endpoint = DEFAULTS.endpoint;
    await browser.storage.local.set({ endpoint: settings.endpoint });
  }
  document.querySelector("#mealie-url").value = settings.mealieUrl;
  refreshInstanceLink();
  await resumePending();
  if (settings.mealieUrl && settings.token) return;
  if (setupMode) return;
  showStatus(status, "Configurez la connexion avant le premier envoi.");
  showView("settings");
}

function enterSetupMode() {
  document.body.classList.add("standalone");
  hostLabel.textContent = "Première configuration";
  document.querySelector("#setup-intro").hidden = false;
  document.querySelector(".header-actions").hidden = true;
  sendView.hidden = true;
  settingsView.hidden = false;
}

function readForm() {
  return { mealieUrl: document.querySelector("#mealie-url").value.trim().replace(/\/+$/, "") };
}

const NO_CONTACT_HINT =
  "Aucune réponse de la page Mealie. Safari bloque sans doute l’extension sur ce site : " +
  "cliquez sur l’icône SendMealie depuis l’onglet Mealie et choisissez « Toujours autoriser sur ce site web », puis relancez la détection.";
let contactTimer = null;

// Le script de page signale sa présence : sans ce signal, l’extension n’a pas accès au site.
function waitForContact() {
  clearTimeout(contactTimer);
  contactTimer = setTimeout(async () => {
    const { connectSeen, connectBase } = await browser.storage.local.get({ connectSeen: false, connectBase: "" });
    if (!connectBase || connectSeen) return;
    showStatus(settingsStatus, NO_CONTACT_HINT, "error");
    retryButton.hidden = false;
  }, 12000);
}

// Rouvrir le popup pendant une connexion ne doit pas perdre l’état en cours.
async function resumePending() {
  const pending = await browser.storage.local.get({
    connectBase: "",
    connectStartedAt: 0,
    connectSeen: false,
    connectError: ""
  });

  if (pending.connectError) {
    showStatus(settingsStatus, pending.connectError, "error");
    retryButton.hidden = false;
    return;
  }

  if (!pending.connectBase || Date.now() - pending.connectStartedAt > 240000) return;

  autoConnectButton.disabled = true;
  showStatus(
    settingsStatus,
    pending.connectSeen
      ? "Page Mealie détectée. Identifiez-vous, la clé se crée ensuite toute seule…"
      : "En attente de votre connexion à Mealie…"
  );
  waitForContact();
}

async function launchAutoConnect(mealieUrl) {
  autoConnectButton.disabled = true;
  retryButton.hidden = true;
  showStatus(settingsStatus, "Ouverture de Mealie… connectez-vous dans l’onglet qui s’ouvre.");

  const result = await browser.runtime.sendMessage({ type: "auto-connect", mealieUrl });
  if (!result?.ok) {
    autoConnectButton.disabled = false;
    showStatus(settingsStatus, result?.error || "Connexion automatique impossible.", "error");
    return;
  }

  settings.mealieUrl = mealieUrl;
  refreshInstanceLink();
  showStatus(settingsStatus, "En attente de votre connexion à Mealie…");
  waitForContact();
}

autoConnectButton.addEventListener("click", () => {
  const { mealieUrl } = readForm();
  if (!mealieUrl) {
    showStatus(settingsStatus, "Renseignez d’abord l’adresse de votre Mealie.", "error");
    document.querySelector("#mealie-url").focus();
    return;
  }
  launchAutoConnect(mealieUrl);
});

retryButton.addEventListener("click", async () => {
  retryButton.hidden = true;
  showStatus(settingsStatus, "Nouvelle tentative de détection…");
  const result = await browser.runtime.sendMessage({ type: "auto-connect-retry" });
  if (!result?.ok) {
    launchAutoConnect(readForm().mealieUrl);
    return;
  }
  waitForContact();
});

// La clé arrive depuis l’onglet Mealie : on rafraîchit l’écran sans rechargement.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes.connectSeen?.newValue) {
    clearTimeout(contactTimer);
    retryButton.hidden = true;
    showStatus(settingsStatus, "Page Mealie détectée. Identifiez-vous, la clé se crée ensuite toute seule…");
  }

  if (changes.token?.newValue) {
    clearTimeout(contactTimer);
    settings.token = changes.token.newValue;
    autoConnectButton.disabled = false;
    retryButton.hidden = true;
    refreshInstanceLink();
    showStatus(settingsStatus, "Connecté ! La clé API a été créée et enregistrée.", "success");
    loadAccount();

    // Page de configuration : sa raison d’être vient de disparaître, elle se referme.
    if (setupMode) {
      setTimeout(() => browser.runtime.sendMessage({ type: "close-setup" }), 1400);
    }
  }

  if (changes.connectError?.newValue) {
    clearTimeout(contactTimer);
    autoConnectButton.disabled = false;
    retryButton.hidden = false;
    showStatus(settingsStatus, changes.connectError.newValue, "error");
  }
});

instanceLink.addEventListener("click", () => {
  if (settings.mealieUrl) openInTab(settings.mealieUrl);
});

openRecipe.addEventListener("click", () => {
  if (lastRecipeUrl) openInTab(lastRecipeUrl);
});

settingsLink.addEventListener("click", () => showView("settings"));
backButton.addEventListener("click", () => { showStatus(settingsStatus, ""); showView("send"); });

document.querySelector("#repo-link").addEventListener("click", () => openInTab(REPO_URL));
document.querySelector("#web-link").addEventListener("click", () => openInTab(WEB_URL));
document.querySelector("#version").textContent = `v${browser.runtime.getManifest().version}`;

let resetArmed = false;

function disarmReset() {
  resetArmed = false;
  resetButton.classList.remove("armed");
  resetButton.title = "Réinitialiser la connexion";
}

resetButton.addEventListener("click", async () => {
  if (!resetArmed) {
    resetArmed = true;
    resetButton.classList.add("armed");
    resetButton.title = "Confirmer la réinitialisation";
    showStatus(settingsStatus, "Cliquez à nouveau pour effacer l’adresse et la clé enregistrées.", "error");
    return;
  }

  resetButton.disabled = true;
  showStatus(settingsStatus, "Suppression de la clé sur Mealie…");

  // La révocation d’abord : une fois le stockage vidé, plus de jeton pour s’authentifier.
  const revoked = await browser.runtime.sendMessage({ type: "revoke-token" });

  await browser.storage.local.clear();
  settings = { ...DEFAULTS };
  document.querySelector("#mealie-url").value = "";
  refreshInstanceLink();
  renderAccount("", null);
  disarmReset();
  resetButton.disabled = false;

  if (!revoked?.ok) {
    showStatus(
      settingsStatus,
      `Réglages effacés, mais la clé « SendMealie » reste sur le serveur : ${revoked?.error || "suppression impossible."} À retirer depuis votre profil Mealie.`,
      "error"
    );
    return;
  }

  showStatus(settingsStatus, `${revoked.deleted ? "Clé supprimée sur Mealie" : "Aucune clé à supprimer"} et réglages effacés. Ouverture de l’écran de bienvenue…`, "success");
  openInTab(browser.runtime.getURL("popup.html?setup=1"));
});

settingsView.addEventListener("input", disarmReset);

settingsView.addEventListener("submit", (event) => {
  event.preventDefault();
  const { mealieUrl } = readForm();
  if (mealieUrl) launchAutoConnect(mealieUrl);
});

sendButton.addEventListener("click", async () => {
  if (!currentTab?.url || !/^https?:/.test(currentTab.url)) {
    showStatus(status, "Cette page ne peut pas être importée.", "error");
    return;
  }
  sendButton.disabled = true;
  openRecipe.hidden = true;
  showStatus(status, "Envoi en cours…");
  const result = await browser.runtime.sendMessage({
    type: "send-recipe",
    url: currentTab.url,
    recipeData
  });
  if (!result.ok) {
    sendButton.disabled = false;
    showStatus(status, result.error, "error");
    return;
  }

  // Le bouton porte la confirmation, puis revient de lui-même à l’état neutre.
  sendButton.classList.add("done");
  sendLabel.textContent = "Recette enregistrée";
  showStatus(status, "");
  clearTimeout(doneTimer);
  doneTimer = setTimeout(clearSentState, DONE_MS);

  if (result.slug && settings.mealieUrl) {
    lastRecipeUrl = `${settings.mealieUrl}/g/home/r/${result.slug}`;
    openRecipe.hidden = false;
  }
  loadAccount();
});

if (setupMode) enterSetupMode();
loadSettings();
if (!setupMode) {
  loadPage();
  loadAccount();
}

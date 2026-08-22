// La langue vient de l’arrière-plan au démarrage ; ici on n’a besoin que
// de savoir si une instance est connectée.
const DEFAULTS = { mealieUrl: "", token: "" };
const DONE_MS = 6000;

const sendView = document.querySelector("#send-view");
const setupView = document.querySelector("#setup-view");
const sendButton = document.querySelector("#send-button");
const sendLabel = document.querySelector("#send-label");
const forceButton = document.querySelector("#force-send");
const fixAccessButton = document.querySelector("#fix-access");
const openRecipe = document.querySelector("#open-recipe");
const settingsLink = document.querySelector("#settings-link");
const openAppButton = document.querySelector("#open-app");
const setupDiagnostic = document.querySelector("#setup-diagnostic");
const status = document.querySelector("#status");
const recipeLabel = document.querySelector("#recipe-label");
const recipeTitle = document.querySelector("#recipe-title");
const card = sendView.querySelector(".card");

const accountRow = document.querySelector("#account");
const accountUserLabel = document.querySelector("#account-user span");
const instanceLink = document.querySelector("#account-recipes");
const accountRecipesLabel = instanceLink.querySelector("span");
const hostLabel = document.querySelector("#host");

let currentTab;
let recipeData = null;
let settings = { ...DEFAULTS };
let lastRecipeUrl = null;
let doneTimer = null;

// État de la page courante, conservé pour pouvoir tout réafficher sans relire
// la page — au changement de langue, par exemple.
let page = { title: "", evidence: null, blocked: false };
let account = { user: "", recipes: null };

// Le service d’arrière-plan renvoie une clé, pas une phrase : c’est ici qu’on
// traduit, dans le seul contexte dont on sait qu’il lit i18n.js correctement.
function describe(result) {
  if (!result?.errorKey) return result?.error || "";
  const vars = { ...(result.errorVars || {}) };
  if (result.hintKey) vars.hint = t(result.hintKey);
  return t(result.errorKey, vars);
}

function showStatus(message, kind = "") {
  status.textContent = message;
  status.className = kind;
}

/* --- Rendu ----------------------------------------------------------------- */

function renderPage() {
  recipeTitle.textContent = page.title || t("card.untitled");

  if (page.blocked) {
    recipeLabel.textContent = t("card.blocked");
    card.classList.remove("card-active");
    return;
  }

  recipeLabel.textContent = page.evidence ? t("card.recipeFound") : t("card.noRecipe");
  card.classList.toggle("card-active", Boolean(page.evidence));
}

function renderAccount() {
  const { user, recipes } = account;
  accountUserLabel.textContent = user ? user.charAt(0).toUpperCase() + user.slice(1) : "";
  accountRecipesLabel.textContent = Number.isFinite(recipes)
    ? plural(recipes, "account.recipeOne", "account.recipeMany")
    : settings.mealieUrl
    ? t("account.openMealie")
    : "";

  accountUserLabel.parentElement.hidden = !accountUserLabel.textContent;
  accountRecipesLabel.parentElement.hidden = !accountRecipesLabel.textContent;
  accountRow.hidden = !accountUserLabel.textContent && !accountRecipesLabel.textContent;
}

function renderHost() {
  instanceLink.disabled = !settings.mealieUrl;
  instanceLink.title = settings.mealieUrl
    ? t("account.openUrl", { url: settings.mealieUrl })
    : t("account.needUrl");

  hostLabel.textContent = settings.mealieUrl
    ? settings.mealieUrl.replace(/^https?:\/\//, "")
    : t("account.noInstance");
}

function showView() {
  const configured = Boolean(settings.mealieUrl && settings.token);
  sendView.hidden = !configured;
  setupView.hidden = configured;
}

/* --- Chargement ------------------------------------------------------------ */

// Cache d’abord pour un affichage instantané, puis rafraîchissement depuis Mealie.
async function loadAccount() {
  const cached = await browser.storage.local.get({ accountUser: "", accountRecipes: null });
  account = { user: cached.accountUser, recipes: cached.accountRecipes };
  renderAccount();

  const info = await browser.runtime.sendMessage({ type: "account-info" });
  if (info?.ok) {
    account = { user: info.user, recipes: info.recipes };
    renderAccount();
  }
}

async function openInTab(url) {
  await browser.tabs.create({ url });
  window.close();
}

// Les réglages vivent dans l’app. Toute la mécanique d’ouverture est dans le
// service d’arrière-plan : le popup se referme aussitôt, et un nettoyage
// différé lancé ici mourrait avec lui.
async function openApp(route = "") {
  await browser.runtime.sendMessage({ type: "open-app", route }).catch(() => {});
  window.close();
}

async function loadPage() {
  [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
  page = { title: currentTab?.title || "", evidence: null, blocked: false };

  const metadata = await browser.tabs
    .sendMessage(currentTab.id, { type: "get-recipe-metadata" })
    .catch(() => null);

  // Safari ne rejette pas toujours quand personne n’écoute : il résout avec
  // `undefined`. Une réponse absente ne dit pas « aucune recette », elle dit
  // « le script de page n’a pas tourné » — presque toujours faute
  // d’autorisation sur ce site. Confondre les deux fait accuser la page.
  if (!metadata || typeof metadata.evidence === "undefined") {
    if (/^https?:/.test(currentTab?.url || "")) {
      page.blocked = true;
      // L’absence d’analyse n’est pas une absence de recette : on laisse la main.
      forceButton.hidden = false;
      offerAccessFix();
    }
    renderPage();
    return;
  }

  if (metadata.title) page.title = metadata.title;
  page.evidence = metadata.evidence;
  recipeData = metadata.recipe || null;

  renderPage();
}

// Le script de page n'a pas répondu. `browser.permissions.contains` ne permet
// pas de dire pourquoi : sur Safari il reflète `host_permissions` du manifest,
// pas l'autorisation réellement accordée site par site. On propose donc le
// remède sans prétendre nommer la cause.
function offerAccessFix() {
  showStatus(`${t("perm.denied")} ${t("perm.manual")}`, "error");
  fixAccessButton.textContent = t("perm.grant");
  fixAccessButton.hidden = false;
}

function originPattern(url) {
  try {
    return `${new URL(url).origin}/*`;
  } catch {
    return null;
  }
}

/* --- Envoi ----------------------------------------------------------------- */

// La confirmation est passagère : au-delà, le bouton reprend son rôle normal.
function clearSentState() {
  clearTimeout(doneTimer);
  sendButton.classList.remove("done");
  sendButton.disabled = false;
  sendLabel.textContent = t("send.action");
  openRecipe.hidden = true;
}

async function submitRecipe({ force = false } = {}) {
  if (!currentTab?.url || !/^https?:/.test(currentTab.url)) {
    showStatus(t("send.unsupported"), "error");
    return;
  }

  // Page hors de portée du script : on n’a pas « rien trouvé », on n’a pas pu
  // regarder. Le message doit rester celui de l’autorisation manquante, sans
  // quoi l’utilisateur cherche une recette là où le problème est ailleurs.
  if (page.blocked && !force) {
    showStatus(`${t("perm.denied")} ${t("send.noRecipeHint")}`, "error");
    forceButton.hidden = false;
    return;
  }

  sendButton.disabled = true;
  forceButton.hidden = true;
  openRecipe.hidden = true;
  showStatus(t(force ? "send.forcing" : "send.sending"));

  const result = await browser.runtime.sendMessage({
    type: "send-recipe",
    url: currentTab.url,
    recipeData,
    evidence: page.evidence,
    force
  });

  if (!result.ok) {
    sendButton.disabled = false;
    const message = describe(result);
    // `canForce` distingue « rien trouvé sur la page » d’une vraie panne :
    // seul le premier cas mérite qu’on propose de passer outre.
    if (result.canForce) {
      showStatus(`${message} ${t("send.noRecipeHint")}`, "error");
      forceButton.hidden = false;
    } else {
      showStatus(message, "error");
    }
    return;
  }

  // Le bouton porte la confirmation, puis revient de lui-même à l’état neutre.
  sendButton.classList.add("done");
  sendLabel.textContent = t("send.done");
  showStatus("");
  clearTimeout(doneTimer);
  doneTimer = setTimeout(clearSentState, DONE_MS);

  if (result.slug && settings.mealieUrl) {
    lastRecipeUrl = `${settings.mealieUrl}/g/home/r/${result.slug}`;
    openRecipe.hidden = false;
  }
  loadAccount();
}

/* --- Événements ------------------------------------------------------------ */

sendButton.addEventListener("click", () => submitRecipe());
forceButton.addEventListener("click", () => submitRecipe({ force: true }));

// Demander l’autorisation depuis un clic est le seul moment où Safari
// l’accepte ; et une fois accordée, l’onglet doit encore être rechargé pour
// que le script y soit injecté.
// Demander l'autorisation depuis un clic est le seul moment où Safari
// l'accepte. Et l'obtenir ne suffit pas : le script n'est injecté que dans les
// pages chargées ensuite, donc on recharge dans la foulée.
fixAccessButton.addEventListener("click", async () => {
  fixAccessButton.disabled = true;

  const origin = originPattern(currentTab?.url);
  if (origin) {
    await browser.permissions.request({ origins: [origin] }).catch(() => false);
  }

  await browser.tabs.reload(currentTab.id).catch(() => {});
  window.close();
});

instanceLink.addEventListener("click", () => {
  if (settings.mealieUrl) openInTab(settings.mealieUrl);
});

openRecipe.addEventListener("click", () => {
  if (lastRecipeUrl) openInTab(lastRecipeUrl);
});

// La configuration peut arriver de l’app pendant que le popup est ouvert.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!("token" in changes) && !("mealieUrl" in changes)) return;

  browser.storage.local.get(DEFAULTS).then((updated) => {
    settings = updated;
    renderHost();
    showView();
    if (settings.token) loadAccount();
  });
});

/* --- Démarrage -------------------------------------------------------------- */

async function boot() {
  // L’arrière-plan arbitre entre les réglages de l’extension et ceux de l’app
  // avant qu’on affiche quoi que ce soit.
  const config = await browser.runtime.sendMessage({ type: "sync-config" }).catch(() => null);
  setLanguage(config?.language || "");
  applyI18n();

  // « Rien n'est configuré » est une réponse légitime ; « je n'ai pas pu
  // demander » n'en est pas une, et l'utilisateur doit pouvoir faire la
  // différence sans ouvrir la console.
  const bridge = config === null ? "dead" : config.bridge;
  if (bridge && bridge !== "ok") {
    // Le motif brut compte plus que la formulation : c’est lui qui dit
    // lequel des maillons casse, et il n’apparaît nulle part ailleurs.
    const detail = config?.bridgeError ? ` (${config.bridgeError})` : "";
    setupDiagnostic.textContent = t(`setup.bridge.${bridge}`) + detail;
    setupDiagnostic.hidden = false;
  }

  settings = await browser.storage.local.get(DEFAULTS);
  renderHost();
  showView();

  if (!settings.mealieUrl || !settings.token) return;

  await loadPage();
  loadAccount();
}

boot();

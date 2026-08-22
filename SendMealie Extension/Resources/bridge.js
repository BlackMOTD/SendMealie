/* Réglages partagés avec l’application, et le pont qui y mène.
   Chargé avant background.js — voir `background.scripts` dans le manifest. */

// Réglages qui traversent l’App Group, par opposition à l’état transitoire
// d’une connexion en cours, qui ne concerne que l’extension.
const SHARED_DEFAULTS = {
  mealieUrl: "",
  token: "",
  tokenId: null,
  language: "",
  connectRequestedAt: 0,
  configUpdatedAt: 0
};

/* --- Pont natif ------------------------------------------------------------
   L’app et l’extension sont sandboxées séparément : elle ne peut pas écrire
   dans `browser.storage.local`, on ne peut pas lire ses `UserDefaults`. Le
   conteneur App Group est le seul terrain commun, et `sendNativeMessage` le
   seul guichet — il réveille SafariWebExtensionHandler, qui y accède. */

// Safari est censé ignorer l’identifiant — la documentation d’Apple passe le
// littéral « application.id ». On tente aussi celui de l’app conteneur : si
// Safari le vérifiait, le littéral échouerait pour tout le monde.
const NATIVE_APPLICATIONS = ["application.id", "fr.warneford.sendmealie"];

// Le motif de l’échec, conservé pour le popup. L’avaler laissait l’utilisateur
// devant un écran qui affirmait que rien n’était configuré.
let lastNativeError = "";

async function nativeRequest(payload) {
  if (typeof browser.runtime?.sendNativeMessage !== "function") {
    lastNativeError = "browser.runtime.sendNativeMessage indisponible";
    return null;
  }

  for (const application of NATIVE_APPLICATIONS) {
    try {
      const reply = await browser.runtime.sendNativeMessage(application, payload);
      if (reply !== undefined && reply !== null) {
        lastNativeError = "";
        return reply;
      }
      lastNativeError = `réponse vide via « ${application} »`;
    } catch (error) {
      lastNativeError = `${application} : ${error?.message || error}`;
    }
  }
  return null;
}

// Les deux côtés nomment l'horodatage différemment — `updatedAt` dans le
// conteneur partagé, `configUpdatedAt` dans le stockage de l'extension. Ces
// deux fonctions sont l'unique endroit qui connaît la correspondance.
function toShared(local) {
  return {
    mealieUrl: local.mealieUrl || "",
    token: local.token || "",
    tokenId: local.tokenId ?? null,
    language: local.language || "",
    connectRequestedAt: Number(local.connectRequestedAt || 0),
    updatedAt: Number(local.configUpdatedAt || 0)
  };
}

function fromShared(shared) {
  return {
    mealieUrl: shared.mealieUrl || "",
    token: shared.token || "",
    tokenId: shared.tokenId ?? null,
    language: shared.language || "",
    connectRequestedAt: Number(shared.connectRequestedAt || 0),
    configUpdatedAt: Number(shared.updatedAt || 0)
  };
}

const stamp = (config) => Number(config?.updatedAt ?? config?.configUpdatedAt ?? 0);

// Deux copies des mêmes réglages coexistent. L’horodatage tranche : la dernière
// écriture gagne, qu’elle vienne de l’app ou du popup.
async function syncConfig() {
  const local = await browser.storage.local.get(SHARED_DEFAULTS);
  const reply = await nativeRequest({ type: "get-config" });
  const shared = reply?.ok ? reply.config : null;

  // État du pont, remonté au popup : sans lui, une extension qui ne voit rien
  // ressemble exactement à une application jamais configurée.
  const bridge = reply === null ? "unreachable" : reply.ok ? "ok" : "unavailable";

  if (shared && stamp(shared) > stamp(local)) {
    const adopted = fromShared(shared);
    await browser.storage.local.set(adopted);
    // L'app vient peut-être de déconnecter : le pied du popup ne doit pas
    // continuer d'afficher un utilisateur et un compte de recettes fantômes.
    if (!adopted.token) {
      await browser.storage.local.set({ accountUser: "", accountRecipes: null });
    }
    applyLanguage(adopted.language);
    await armPendingConnect(adopted);
    return { ...adopted, bridge, bridgeError: lastNativeError };
  }

  if (shared && stamp(local) > stamp(shared)) {
    await nativeRequest({ type: "set-config", config: toShared(local) });
  }

  applyLanguage(local.language);
  await armPendingConnect(local);
  return { ...local, bridge, bridgeError: lastNativeError };
}

async function saveConfig(patch) {
  const current = await browser.storage.local.get(SHARED_DEFAULTS);
  const merged = { ...current, ...patch, configUpdatedAt: Date.now() };
  await browser.storage.local.set(merged);
  applyLanguage(merged.language);
  await nativeRequest({ type: "set-config", config: toShared(merged) });
  return merged;
}

/* --- Langue ---------------------------------------------------------------- */

// La page d’arrière-plan est déchargée quand Safari le décide et repart à
// froid : la langue est rechargée à la demande plutôt que supposée présente.
let languageReady = null;

function applyLanguage(preference) {
  setLanguage(preference);
  languageReady = Promise.resolve();
}

function ensureLanguage() {
  if (!languageReady) {
    languageReady = browser.storage.local
      .get({ language: "" })
      .then(({ language }) => setLanguage(language))
      .catch(() => setLanguage(""));
  }
  return languageReady;
}

/* --- Demande de connexion émise par l’app ---------------------------------- */

const CONNECT_WINDOW_MS = 240000;

async function clearConnectWatch() {
  await browser.storage.local.set({ connectBase: "", connectStartedAt: 0 });
}

// La surveillance vit dans content.js ; ici on ne fait qu'armer l'état quand
// l'app a envoyé l'utilisateur s'identifier dans Safari. L'extension n'a plus
// d'écran de réglages : elle n'initie jamais rien d'elle-même.
async function armPendingConnect(config) {
  if (!config.mealieUrl || config.token) return;

  const requestedAt = Number(config.connectRequestedAt || 0);
  if (!requestedAt || Date.now() - requestedAt > CONNECT_WINDOW_MS) return;

  // Une demande déjà armée ne doit pas relancer le compte à rebours à chaque
  // page visitée : l'utilisateur perdrait son délai sans jamais l'épuiser.
  const { connectStartedAt } = await browser.storage.local.get({ connectStartedAt: 0 });
  if (connectStartedAt >= requestedAt) return;

  await browser.storage.local.set({
    connectBase: config.mealieUrl,
    connectStartedAt: requestedAt
  });
}

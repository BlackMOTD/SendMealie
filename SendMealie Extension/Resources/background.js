/* Ce que l’extension sait faire : envoyer une recette, interroger le compte,
   ouvrir l’application, tenir l’icône à jour. L’état partagé et le pont vers
   l’app vivent dans bridge.js, chargé juste avant. */

// Ce qu'il faut pour parler à Mealie, et rien de plus.
const CREDENTIALS = { mealieUrl: "", token: "" };

const IMPORT_FROM_DATA = "/api/recipes/create/html-or-json";
const IMPORT_FROM_URL = "/api/recipes/create/url";

/* --- Envoi ----------------------------------------------------------------- */

function readSlug(payload) {
  let value = payload;
  try {
    const parsed = JSON.parse(payload);
    value = typeof parsed === "string" ? parsed : parsed?.slug ?? parsed?.id ?? "";
  } catch {}
  value = String(value ?? "").trim();
  return /^[a-z0-9-]+$/i.test(value) ? value : null;
}

async function sendRecipe(message) {
  await ensureLanguage();
  const settings = await browser.storage.local.get(CREDENTIALS);
  if (!settings.mealieUrl || !settings.token) {
    return { ok: false, errorKey: "send.notConfigured" };
  }

  // Sans la moindre trace de recette, on n’envoie rien : Mealie créerait une
  // fiche vide, à retrouver et supprimer à la main. Le popup propose alors de
  // forcer — son extracteur maison réussit là où le nôtre renonce.
  if (!message.evidence && !message.force) {
    return { ok: false, canForce: true, errorKey: "send.noRecipe" };
  }

  const baseUrl = settings.mealieUrl.replace(/\/+$/, "");

  const post = async (endpoint, body) => {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    return { response, payload: await response.text() };
  };

  try {
    let attempt = null;

    if (message.recipeData) {
      attempt = await post(IMPORT_FROM_DATA, {
        data: JSON.stringify(message.recipeData),
        url: message.url
      });

      // Les données de la page peuvent déplaire à Mealie — balisage partiel,
      // champ inattendu — sans que la recette soit pour autant inimportable :
      // son propre extracteur réussit souvent là où le balisage échoue. On ne
      // renonce que sur un refus d'authentification, où réessayer ne sert à rien.
      const status = attempt.response.status;
      if (!attempt.response.ok && status !== 401 && status !== 403) {
        attempt = null;
      }
    }

    if (!attempt) {
      attempt = await post(IMPORT_FROM_URL, { url: message.url });
    }

    const { response, payload } = attempt;

    if (!response.ok) {
      const refused = response.status === 401 || response.status === 403;
      const hint = refused ? "" : payload.slice(0, 160);

      return {
        ok: false,
        errorKey: "error.status",
        errorVars: { status: response.status, hint },
        hintKey: refused ? "error.tokenRefused" : ""
      };
    }

    return { ok: true, slug: readSlug(payload) };
  } catch (error) {
    return { ok: false, errorKey: "error.network", errorVars: { detail: error.message } };
  }
}

// Identité + volume de recettes, affichés en pied du popup. Mis en cache pour un rendu immédiat.
async function accountInfo() {
  await ensureLanguage();
  const { mealieUrl, token } = await browser.storage.local.get(CREDENTIALS);
  if (!mealieUrl || !token) return { ok: false, errorKey: "send.notConfigured" };

  const baseUrl = mealieUrl.replace(/\/+$/, "");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  try {
    const [meResponse, recipesResponse] = await Promise.all([
      fetch(`${baseUrl}/api/users/self`, { headers }),
      fetch(`${baseUrl}/api/recipes?page=1&perPage=1`, { headers })
    ]);

    if (!meResponse.ok) {
      return { ok: false, errorKey: "error.status", errorVars: { status: meResponse.status, hint: "" } };
    }

    const me = await meResponse.json().catch(() => null);
    const user = me?.username || me?.fullName || me?.email || "";

    let recipes = null;
    if (recipesResponse.ok) {
      const data = await recipesResponse.json().catch(() => null);
      const total = data?.total ?? data?.total_items ?? null;
      if (Number.isFinite(total)) recipes = total;
    }

    await browser.storage.local.set({ accountUser: user, accountRecipes: recipes });
    return { ok: true, user, recipes };
  } catch (error) {
    return { ok: false, errorKey: "error.network", errorVars: { detail: error.message } };
  }
}

// Les réglages vivent dans l’app. Le pont natif sait la lancer ; à défaut, on
// passe le schéma d’URL à Safari, qui le confie à LaunchServices.
async function openApp(route) {
  const reply = await nativeRequest({ type: "open-app", route: route || "" });
  if (reply?.ok === true) return { ok: true, via: "native" };

  // Safari transmet l’URL puis laisse un onglet vide derrière lui. Le fermer
  // depuis le popup ne marchait pas : celui-ci se referme dans la foulée et
  // emporte le minuteur avec lui. Ici, le service reste en vie assez longtemps.
  try {
    const tab = await browser.tabs.create({ url: `sendmealie://${route || ""}` });
    setTimeout(() => browser.tabs.remove(tab.id).catch(() => {}), 1200);
    return { ok: true, via: "url" };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

/* --- Icône de barre d’outils ------------------------------------------------ */

// Xcode aplatit l’arborescence à la copie : tout vit à la racine de Resources.
const ICON_ACTIVE = { 16: "toolbar-16.png", 32: "toolbar-32.png" };
const ICON_IDLE = { 16: "toolbar-off-16.png", 32: "toolbar-off-32.png" };

// L’icône s’allume sur les pages reconnues comme recette, reste grisée ailleurs.
// Le popup s’ouvre dans les deux cas : une page mal reconnue doit rester
// envoyable à la main.
async function setRecipeState(tabId, isRecipe) {
  if (tabId === undefined || !browser.action?.setIcon) return;
  await ensureLanguage();
  try {
    await browser.action.setIcon({ tabId, path: isRecipe ? ICON_ACTIVE : ICON_IDLE });
    await browser.action.setTitle({
      tabId,
      title: isRecipe ? t("toolbar.recipe") : t("toolbar.idle")
    });
  } catch {}
}

// Tant que rien n'est configuré, chaque page visitée est une occasion de
// découvrir que l'app a lancé une connexion. Une fois la clé en place, on ne
// sollicite plus le pont à chaque chargement.
async function handlePageState(tabId, isRecipe) {
  await setRecipeState(tabId, isRecipe);
  const { token } = await browser.storage.local.get({ token: "" });
  if (!token) await syncConfig();
}

async function refreshBadge() {
  if (!browser.action?.setBadgeText) return;
  await ensureLanguage();
  const { mealieUrl, token } = await browser.storage.local.get(CREDENTIALS);
  const configured = Boolean(mealieUrl && token);
  try {
    await browser.action.setBadgeText({ text: configured ? "" : "!" });
    if (!configured) {
      await browser.action.setBadgeBackgroundColor?.({ color: "#a04435" });
    }
    await browser.action.setTitle({
      title: configured ? t("toolbar.default") : t("toolbar.setup")
    });
  } catch {}
}

/* --- Connexion automatique -------------------------------------------------- */

async function finishAutoConnect(message, sender) {
  const { connectBase } = await browser.storage.local.get({ connectBase: "" });
  if (!connectBase || !sender?.tab?.url?.startsWith(connectBase)) return;

  if (!message.token) {
    // Rien ne remonte encore cet échec à l'app, qui continue d'attendre la clé.
    console.warn("SendMealie : création de la clé abandonnée —", message.error || "motif inconnu");
    return;
  }

  await saveConfig({ token: message.token, tokenId: message.tokenId ?? null, connectRequestedAt: 0 });
  await clearConnectWatch();
  await flashConnected();

  if (sender.tab.id !== undefined) {
    try {
      await browser.tabs.remove(sender.tab.id);
    } catch {}
  }
}

async function flashConnected() {
  if (!browser.action?.setBadgeText) return;
  try {
    await browser.action.setBadgeText({ text: "✓" });
    await browser.action.setBadgeBackgroundColor?.({ color: "#275b4b" });
    setTimeout(refreshBadge, 5000);
  } catch {}
}

/* --- Cycle de vie ----------------------------------------------------------- */

browser.runtime.onInstalled.addListener(async (details) => {
  // L'app a pu tout configurer avant la première ouverture de Safari : on adopte
  // ses réglages avant de décider s'il faut encore réclamer quoi que ce soit.
  const config = await syncConfig();
  await refreshBadge();
  if (details.reason !== "install") return;
  if (config.mealieUrl && config.token) return;

  await openApp("");
});

browser.runtime.onStartup?.addListener(async () => {
  await syncConfig();
  await refreshBadge();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ("mealieUrl" in changes || "token" in changes)) refreshBadge();
});

// Tout ce que le popup et le script de page savent demander. Une table plutôt
// qu'une échelle de `if` : la liste se lit d'un coup d'œil, et un nom disparu
// ne peut plus se cacher au milieu.
const HANDLERS = {
  "send-recipe": (message) => sendRecipe(message),
  "account-info": () => accountInfo(),
  "sync-config": () => syncConfig(),
  "open-app": (message) => openApp(message.route),
  "page-recipe-state": (message, sender) => handlePageState(sender?.tab?.id, message.isRecipe),
  "auto-connect-result": (message, sender) => finishAutoConnect(message, sender)
};

browser.runtime.onMessage.addListener((message, sender) => {
  const handler = HANDLERS[message?.type];
  return handler ? handler(message, sender) : undefined;
});

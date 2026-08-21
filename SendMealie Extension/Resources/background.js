const DEFAULTS = {
  mealieUrl: "",
  token: "",
  endpoint: "/api/recipes/create/url"
};

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
  const settings = await browser.storage.local.get(DEFAULTS);
  if (!settings.mealieUrl || !settings.token) {
    return { ok: false, error: "Configurez Mealie avant le premier envoi." };
  }

  const baseUrl = settings.mealieUrl.replace(/\/+$/, "");
  const configuredEndpoint = message.recipeData
    ? "/api/recipes/create/html-or-json"
    : settings.endpoint === "/api/recipes/create"
    ? "/api/recipes/create/url"
    : settings.endpoint;
  const endpoint = configuredEndpoint.startsWith("/") ? configuredEndpoint : `/${configuredEndpoint}`;
  const body = message.recipeData
    ? { data: JSON.stringify(message.recipeData), url: message.url }
    : { url: message.url };

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = await response.text();

    if (!response.ok) {
      const hint =
        response.status === 401 || response.status === 403
          ? "Jeton refusé par Mealie."
          : payload.slice(0, 160);
      return { ok: false, error: `Mealie a répondu ${response.status}. ${hint}` };
    }

    return { ok: true, slug: readSlug(payload) };
  } catch (error) {
    return { ok: false, error: `Connexion impossible à Mealie. ${error.message}` };
  }
}

// Identité + volume de recettes, affichés en pied du popup. Mis en cache pour un rendu immédiat.
async function accountInfo() {
  const { mealieUrl, token } = await browser.storage.local.get(DEFAULTS);
  if (!mealieUrl || !token) return { ok: false, error: "Connexion non configurée." };

  const baseUrl = mealieUrl.replace(/\/+$/, "");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  try {
    const [meResponse, recipesResponse] = await Promise.all([
      fetch(`${baseUrl}/api/users/self`, { headers }),
      fetch(`${baseUrl}/api/recipes?page=1&perPage=1`, { headers })
    ]);

    if (!meResponse.ok) {
      return { ok: false, error: `Mealie a répondu ${meResponse.status}.` };
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
    return { ok: false, error: `Connexion impossible à Mealie. ${error.message}` };
  }
}

const TOKEN_NAME = "SendMealie";

// Réinitialiser sans révoquer laisserait une clé orpheline dans le profil Mealie.
// On cible l’identifiant retenu à la création ; à défaut, les clés portant notre nom.
async function revokeToken() {
  const { mealieUrl, token, tokenId } = await browser.storage.local.get({ ...DEFAULTS, tokenId: null });
  if (!mealieUrl || !token) return { ok: true, deleted: 0 };

  const baseUrl = mealieUrl.replace(/\/+$/, "");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  const remove = async (id) => {
    const response = await fetch(`${baseUrl}/api/users/api-tokens/${id}`, { method: "DELETE", headers });
    return { ok: response.ok, status: response.status };
  };

  try {
    // Chemin direct : l’identifiant retenu à la création.
    if (tokenId !== null && tokenId !== undefined) {
      const attempt = await remove(tokenId);
      if (attempt.ok) return { ok: true, deleted: 1 };
      if (attempt.status !== 404) {
        return { ok: false, deleted: 0, error: `Mealie a refusé la suppression (${attempt.status}).` };
      }
      // 404 : la clé retenue n’existe plus, on retombe sur la recherche par nom.
    }

    // Repli : retrouver la clé par son nom dans le profil.
    const me = await fetch(`${baseUrl}/api/users/self`, { headers });
    if (!me.ok) {
      return { ok: false, deleted: 0, error: `Lecture du profil refusée (${me.status}).` };
    }

    const data = await me.json().catch(() => null);
    const ids = (data?.tokens || [])
      .filter((entry) => entry?.name === TOKEN_NAME)
      .map((entry) => entry?.id)
      .filter((id) => id !== null && id !== undefined);

    // Ne jamais annoncer un succès sans suppression : le profil expose `tokens`
    // en `array | null`, et une liste absente passait auparavant pour un succès.
    if (!ids.length) {
      return {
        ok: false,
        deleted: 0,
        error: "aucune clé « SendMealie » listée dans le profil."
      };
    }

    let deleted = 0;
    let lastStatus = 0;
    for (const id of ids) {
      const attempt = await remove(id);
      if (attempt.ok) deleted += 1;
      else lastStatus = attempt.status;
    }

    if (deleted === ids.length) return { ok: true, deleted };
    return { ok: false, deleted, error: `Mealie a refusé la suppression (${lastStatus}).` };
  } catch (error) {
    return { ok: false, deleted: 0, error: `Connexion impossible à Mealie. ${error.message}` };
  }
}

// La page de configuration se referme elle-même une fois la clé enregistrée.
async function closeSetup(sender) {
  if (sender?.tab?.id === undefined) return;
  try {
    await browser.tabs.remove(sender.tab.id);
  } catch {}
  try {
    await browser.action?.openPopup?.();
  } catch {}
}

// Xcode aplatit l’arborescence à la copie : tout vit à la racine de Resources.
const ICON_ACTIVE = { 16: "toolbar-16.png", 32: "toolbar-32.png" };
const ICON_IDLE = { 16: "toolbar-off-16.png", 32: "toolbar-off-32.png" };

// L’icône s’allume sur les pages reconnues comme recette, reste grisée ailleurs.
// Le popup reste accessible dans les deux cas : les réglages ne doivent jamais être hors d’atteinte.
async function setRecipeState(tabId, isRecipe) {
  if (tabId === undefined || !browser.action?.setIcon) return;
  try {
    await browser.action.setIcon({ tabId, path: isRecipe ? ICON_ACTIVE : ICON_IDLE });
    await browser.action.setTitle({
      tabId,
      title: isRecipe ? "Sauvegarder la recette ?" : "SendMealie — aucune recette détectée"
    });
  } catch {}
}

async function refreshBadge() {
  if (!browser.action?.setBadgeText) return;
  const { mealieUrl, token } = await browser.storage.local.get(DEFAULTS);
  const configured = Boolean(mealieUrl && token);
  try {
    await browser.action.setBadgeText({ text: configured ? "" : "!" });
    if (!configured) {
      await browser.action.setBadgeBackgroundColor?.({ color: "#a04435" });
    }
    await browser.action.setTitle({
      title: configured ? "Enregistrer sur Mealie" : "SendMealie — connexion à configurer"
    });
  } catch {}
}

const CONNECT_STATE = { connectBase: "", connectStartedAt: 0, connectSeen: false };
const WATCH_TIMEOUT_MS = 240000;

async function clearPending() {
  await browser.storage.local.set({ connectBase: "", connectStartedAt: 0, connectSeen: false });
}

// La surveillance vit dans content.js : ici on arme simplement l’état et on ouvre l’onglet.
async function startAutoConnect(mealieUrl) {
  const baseUrl = String(mealieUrl || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(baseUrl)) {
    return { ok: false, error: "Renseignez l’adresse complète de Mealie (https://…)." };
  }

  await browser.storage.local.set({
    mealieUrl: baseUrl,
    connectError: "",
    connectBase: baseUrl,
    connectStartedAt: Date.now(),
    connectSeen: false
  });

  try {
    await browser.tabs.create({ url: `${baseUrl}/login` });
  } catch (error) {
    await clearPending();
    return { ok: false, error: `Impossible d’ouvrir Mealie. ${error.message}` };
  }
  return { ok: true };
}

// Réarme l’attente : les onglets Mealie déjà ouverts repartent en surveillance.
async function retryAutoConnect() {
  const { connectBase } = await browser.storage.local.get(CONNECT_STATE);
  if (!connectBase) return { ok: false, error: "Aucune connexion en cours." };

  await browser.storage.local.set({
    connectError: "",
    connectSeen: false,
    connectStartedAt: Date.now()
  });
  return { ok: true };
}

async function finishAutoConnect(message, sender) {
  const { connectBase } = await browser.storage.local.get(CONNECT_STATE);
  if (!connectBase || !sender?.tab?.url?.startsWith(connectBase)) return;

  if (!message.token) {
    await browser.storage.local.set({ connectError: message.error || "Connexion automatique interrompue." });
    return;
  }

  await browser.storage.local.set({ token: message.token, tokenId: message.tokenId ?? null, connectError: "" });
  await clearPending();
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

browser.runtime.onInstalled.addListener(async (details) => {
  await refreshBadge();
  if (details.reason !== "install") return;

  const { mealieUrl, token } = await browser.storage.local.get(DEFAULTS);
  if (mealieUrl && token) return;

  try {
    await browser.tabs.create({ url: browser.runtime.getURL("popup.html?setup=1") });
  } catch {}
});

browser.runtime.onStartup?.addListener(refreshBadge);
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ("mealieUrl" in changes || "token" in changes)) refreshBadge();
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.type === "send-recipe") return sendRecipe(message);
  if (message.type === "auto-connect") return startAutoConnect(message.mealieUrl);
  if (message.type === "auto-connect-retry") return retryAutoConnect();
  if (message.type === "auto-connect-alive") return browser.storage.local.set({ connectSeen: true });
  if (message.type === "auto-connect-result") return finishAutoConnect(message, sender);
  if (message.type === "account-info") return accountInfo();
  if (message.type === "close-setup") return closeSetup(sender);
  if (message.type === "revoke-token") return revokeToken();
  if (message.type === "page-recipe-state") return setRecipeState(sender?.tab?.id, message.isRecipe);
});

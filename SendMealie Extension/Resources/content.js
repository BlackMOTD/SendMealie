const CONNECT_TIMEOUT_MS = 240000;
const CONNECT_POLL_MS = 1500;
const TOKEN_NAME = "SendMealie";

function readRecipeMetadata() {
  const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent);
      const candidates = Array.isArray(parsed) ? parsed : [parsed, ...(parsed?.['@graph'] || [])];
      const recipe = candidates.find((item) => item?.['@type'] === 'Recipe' || item?.['@type']?.includes?.('Recipe'));
      if (recipe) return {
        title: recipe.name || document.title,
        recipe
      };
    } catch {}
  }

  return { title: document.title, recipe: null };
}

// Une page compte comme recette si elle est balisée, ou à défaut si elle porte
// à la fois un titre « Ingrédients » et un titre d’étapes. Exiger les deux évite
// de s’activer sur un article de blog qui cite une liste d’ingrédients.
function looksLikeRecipe(recipe) {
  if (recipe) return true;
  if (document.querySelector('[itemtype*="schema.org/Recipe" i]')) return true;

  const headings = [...document.querySelectorAll("h1, h2, h3, h4")]
    .map((node) => node.textContent.trim().toLowerCase());
  const hasIngredients = headings.some((text) => /^ingr[ée]dients?\b/.test(text));
  const hasSteps = headings.some((text) =>
    /^(pr[ée]paration|instructions?|[ée]tapes|r[ée]alisation)\b/.test(text)
  );
  return hasIngredients && hasSteps;
}

function reportRecipeState() {
  const { recipe } = readRecipeMetadata();
  browser.runtime
    .sendMessage({ type: "page-recipe-state", isRecipe: looksLikeRecipe(recipe) })
    .catch(() => {});
}

reportRecipeState();

browser.runtime.onMessage.addListener((message) => {
  if (message.type !== "get-recipe-metadata") return;
  const metadata = readRecipeMetadata();
  return { ...metadata, isRecipe: looksLikeRecipe(metadata.recipe) };
});

/* --- Connexion automatique -------------------------------------------------
   Quand une connexion est en cours pour cette instance, on attend que
   l’utilisateur s’identifie, puis on crée une clé API depuis la page elle-même
   (session du navigateur). Piloté par le stockage plutôt que par une injection :
   ça survit au rechargement de la page comme à la mise en veille du worker. */

const isJwt = (value) => typeof value === "string" && value.split(".").length === 3;

function findBearer() {
  for (const key of Object.keys(localStorage)) {
    if (!/token|auth/i.test(key)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    const direct = raw.replace(/^"|"$/g, "").replace(/^Bearer /i, "");
    if (isJwt(direct)) return direct;

    try {
      const parsed = JSON.parse(raw);
      for (const candidate of [parsed?.access_token, parsed?.token, parsed?.value]) {
        const cleaned = String(candidate ?? "").replace(/^Bearer /i, "");
        if (isJwt(cleaned)) return cleaned;
      }
    } catch {}
  }

  for (const part of document.cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!/token/i.test(name)) continue;
    const value = decodeURIComponent(rest.join("=")).replace(/^Bearer /i, "");
    if (isJwt(value)) return value;
  }

  return null;
}

async function claimApiToken() {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  const bearer = findBearer();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const me = await fetch("/api/users/self", { credentials: "include", headers });
  if (!me.ok) return null; // pas encore identifié

  const created = await fetch("/api/users/api-tokens", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ name: TOKEN_NAME })
  });
  if (!created.ok) {
    const detail = await created.text().catch(() => "");
    return { error: `Création de la clé refusée par Mealie (${created.status}). ${detail.slice(0, 120)}` };
  }

  const data = await created.json().catch(() => null);
  const token = data?.token || data?.access_token;
  if (!token) return { error: "Mealie n’a pas renvoyé de clé API." };

  const user = await me.json().catch(() => null);
  return {
    token,
    tokenId: data?.id ?? data?.token_id ?? null,
    user: user?.username || user?.fullName || user?.email || ""
  };
}

async function watchForSession() {
  if (window.__sendMealieWatching) return;

  const { connectBase, connectStartedAt } = await browser.storage.local.get({
    connectBase: "",
    connectStartedAt: 0
  });

  if (!connectBase || !location.href.startsWith(connectBase)) return;
  if (Date.now() - connectStartedAt > CONNECT_TIMEOUT_MS) return;

  window.__sendMealieWatching = true;
  browser.runtime.sendMessage({ type: "auto-connect-alive" });

  try {
    const deadline = connectStartedAt + CONNECT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      let result = null;
      try {
        result = await claimApiToken();
      } catch {}

      if (result) {
        browser.runtime.sendMessage({ type: "auto-connect-result", ...result });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, CONNECT_POLL_MS));
    }
    browser.runtime.sendMessage({
      type: "auto-connect-result",
      error: "Délai dépassé : aucune identification détectée sur Mealie."
    });
  } finally {
    window.__sendMealieWatching = false;
  }
}

// Au chargement de la page, et si une connexion est lancée alors qu’elle est déjà ouverte.
watchForSession();
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.connectStartedAt?.newValue) watchForSession();
});

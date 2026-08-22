const CONNECT_TIMEOUT_MS = 240000;
const CONNECT_POLL_MS = 1500;

// Le `@context` vit sur le document JSON-LD, pas sur le nœud Recipe qu'on en
// extrait. Le laisser derrière produit un objet que plus rien ne rattache à
// schema.org : Mealie répond alors 400 BAD_RECIPE_DATA. On le réattache.
function withContext(recipe, document_) {
  if (recipe['@context']) return recipe;
  return { '@context': document_?.['@context'] || 'https://schema.org', ...recipe };
}

function readRecipeMetadata() {
  const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent);
      const candidates = Array.isArray(parsed) ? parsed : [parsed, ...(parsed?.['@graph'] || [])];
      const recipe = candidates.find((item) => item?.['@type'] === 'Recipe' || item?.['@type']?.includes?.('Recipe'));
      if (recipe) return {
        title: recipe.name || document.title,
        recipe: withContext(recipe, Array.isArray(parsed) ? parsed[0] : parsed)
      };
    } catch {}
  }

  return { title: document.title, recipe: null };
}

// Ce qui, sur la page, permet d’affirmer qu’il s’agit d’une recette. La valeur
// nomme la preuve trouvée ; `null` signifie qu’il n’y a rien à envoyer, et
// c’est ce qui bloque l’enregistrement côté arrière-plan.
//
// L’heuristique des titres exige à la fois « Ingrédients » et un titre
// d’étapes : n’en demander qu’un s’activerait sur un article de blog qui cite
// une liste d’ingrédients.
function detectEvidence(recipe) {
  if (recipe) return "json-ld";
  if (document.querySelector('[itemtype*="schema.org/Recipe" i]')) return "microdata";
  if (document.querySelector(".hrecipe, .h-recipe")) return "microformat";

  const headings = [...document.querySelectorAll("h1, h2, h3, h4")]
    .map((node) => node.textContent.trim().toLowerCase());
  const hasIngredients = headings.some((text) => /^ingr[ée]dients?\b/.test(text));
  const hasSteps = headings.some((text) =>
    /^(pr[ée]paration|instructions?|[ée]tapes|r[ée]alisation|directions?|methods?|steps)\b/.test(text)
  );
  return hasIngredients && hasSteps ? "headings" : null;
}

function analysePage() {
  const metadata = readRecipeMetadata();
  const evidence = detectEvidence(metadata.recipe);
  return { ...metadata, evidence, isRecipe: Boolean(evidence) };
}

function reportRecipeState() {
  browser.runtime
    .sendMessage({ type: "page-recipe-state", isRecipe: analysePage().isRecipe })
    .catch(() => {});
}

reportRecipeState();

// Une promesse, pas un objet nu. Le contrat WebExtensions ne reconnaît une
// réponse que sous forme de promesse (ou de `sendResponse` avec un retour
// `true`) : rendre l'objet directement vaut « message non traité », et
// `tabs.sendMessage` résout alors avec `undefined` côté popup. Le popup lisait
// ce silence comme une page illisible, sur toutes les pages, depuis toujours —
// l'import par URL masquait la panne.
browser.runtime.onMessage.addListener((message) => {
  if (message.type !== "get-recipe-metadata") return;
  return Promise.resolve(analysePage());
});

/* --- Connexion automatique -------------------------------------------------
   Quand une connexion est en cours pour cette instance, on attend que
   l’utilisateur s’identifie, puis on crée une clé API depuis la page elle-même
   (session du navigateur). Piloté par le stockage plutôt que par une injection :
   ça survit au rechargement de la page comme à la mise en veille du worker. */

browser.storage.local.get({ language: "" }).then(({ language }) => setLanguage(language)).catch(() => {});

// L'obtention de la clé vit dans Shared/claim-token.js, partagé avec l'app.
// Ici on ne fait qu'adapter son verdict au vocabulaire de watchForSession :
// `null` pour « rien encore », sinon un résultat ou une erreur traduite.
async function claimApiToken() {
  const result = await sendMealieClaimToken();

  if (result.state === "anonymous" || result.state === "unreachable") return null;

  if (result.state === "granted") {
    return { token: result.token, tokenId: result.tokenId, user: result.user };
  }

  return {
    error: result.reason === "no-token"
      ? t("content.noKey")
      : t("content.keyRefused", { status: result.status, detail: result.detail })
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
      error: t("content.timeout")
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

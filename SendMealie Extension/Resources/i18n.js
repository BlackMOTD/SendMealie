/* Ce fichier commence par une marque d'ordre d'octets UTF-8, et ce n'est pas
   un accident : le popup lit i18n.js avec l'encodage de popup.html, mais la
   page d'arriere-plan n'a aucune declaration de charset et decodait les memes
   chaines en Latin-1 — « rien n'a ete envoye » devenait « rien nâ€™a Ã©tÃ© ».
   La BOM prime sur toute devinette d'encodage. Ne la retirez pas. */
/* Traductions partagées par le popup, la page d’arrière-plan et le script de page.
   Une table plate plutôt que `browser.i18n` : Xcode aplatit l’arborescence des
   ressources à la copie, et `_locales/fr/messages.json` n’y survivrait pas
   (voir DEVELOPMENT.md). La langue vient des réglages partagés avec l’app. */

const I18N_STRINGS = {
  "nav.settings": { fr: "Ouvrir les réglages dans SendMealie", en: "Open settings in SendMealie" },

  "setup.label": { fr: "Configuration", en: "Setup" },
  "setup.title": { fr: "Rien n’est encore connecté", en: "Nothing connected yet" },
  "setup.explain": {
    fr: "Ouvrez l’application SendMealie pour choisir votre instance et vous y connecter.",
    en: "Open the SendMealie app to pick your instance and sign in."
  },
  "setup.bridge.unreachable": {
    fr: "Le pont avec l’application ne répond pas. Lancez SendMealie une fois, puis relancez Safari.",
    en: "The bridge to the app is not answering. Launch SendMealie once, then restart Safari."
  },
  "setup.bridge.unavailable": {
    fr: "Conteneur partagé inaccessible : la capability App Groups manque à la signature.",
    en: "Shared container unavailable: the App Groups capability is missing from the signature."
  },
  "setup.bridge.dead": {
    fr: "Le script d’arrière-plan de l’extension ne répond pas. Désactivez puis réactivez SendMealie dans Safari.",
    en: "The extension’s background script is not answering. Turn SendMealie off and on again in Safari."
  },

  "setup.open": { fr: "Ouvrir SendMealie", en: "Open SendMealie" },

  "card.currentPage": { fr: "Page actuelle", en: "Current page" },
  "card.reading": { fr: "Lecture de la page…", en: "Reading the page…" },
  "card.recipeFound": { fr: "Sauvegarder la recette ?", en: "Save this recipe?" },
  "card.noRecipe": { fr: "Aucune recette détectée", en: "No recipe detected" },
  "card.blocked": { fr: "Accès refusé à cette page", en: "Access denied on this page" },
  "card.untitled": { fr: "Page sans titre", en: "Untitled page" },

  "send.action": { fr: "Enregistrer sur Mealie", en: "Save to Mealie" },
  "send.sending": { fr: "Envoi en cours…", en: "Sending…" },
  "send.done": { fr: "Recette enregistrée", en: "Recipe saved" },
  "send.open": { fr: "Voir la recette", en: "Open the recipe" },
  "send.force": { fr: "Envoyer quand même", en: "Send anyway" },
  "send.forcing": { fr: "Envoi forcé, extraction laissée à Mealie…", en: "Forcing the import, leaving extraction to Mealie…" },
  "send.noRecipe": {
    fr: "Aucune recette sur cette page : rien n’a été envoyé à Mealie.",
    en: "No recipe on this page: nothing was sent to Mealie."
  },
  "send.noRecipeHint": {
    fr: "Mealie sait parfois extraire ce que SendMealie ne voit pas.",
    en: "Mealie can sometimes extract what SendMealie cannot see."
  },
  "send.unsupported": { fr: "Cette page ne peut pas être importée.", en: "This page cannot be imported." },
  "send.notConfigured": { fr: "Configurez Mealie avant le premier envoi.", en: "Set up Mealie before the first send." },

  "perm.grant": { fr: "Autoriser et recharger", en: "Allow and reload" },
  "perm.manual": {
    fr: "Si rien ne change : Safari ▸ Réglages ▸ Extensions ▸ SendMealie.",
    en: "If nothing changes: Safari ▸ Settings ▸ Extensions ▸ SendMealie."
  },
  "perm.denied": {
    fr: "Safari n’autorise pas SendMealie sur ce site : la page ne peut pas être lue.",
    en: "Safari does not allow SendMealie on this site, so the page cannot be read."
  },

  "account.openMealie": { fr: "Ouvrir Mealie", en: "Open Mealie" },
  "account.recipeOne": { fr: "{count} recette", en: "{count} recipe" },
  "account.recipeMany": { fr: "{count} recettes", en: "{count} recipes" },
  "account.noInstance": { fr: "Aucune instance configurée", en: "No instance configured" },
  "account.openUrl": { fr: "Ouvrir {url}", en: "Open {url}" },
  "account.needUrl": { fr: "Renseignez d’abord l’adresse de Mealie", en: "Enter the Mealie address first" },

  "toolbar.recipe": { fr: "Sauvegarder la recette ?", en: "Save this recipe?" },
  "toolbar.idle": { fr: "SendMealie — aucune recette détectée", en: "SendMealie — no recipe detected" },
  "toolbar.default": { fr: "Enregistrer sur Mealie", en: "Save to Mealie" },
  "toolbar.setup": { fr: "SendMealie — connexion à configurer", en: "SendMealie — connection not set up" },

  "error.tokenRefused": { fr: "Jeton refusé par Mealie.", en: "Key rejected by Mealie." },
  "error.status": { fr: "Mealie a répondu {status}. {hint}", en: "Mealie replied {status}. {hint}" },
  "error.network": { fr: "Connexion impossible à Mealie. {detail}", en: "Could not reach Mealie. {detail}" },

  "content.keyRefused": {
    fr: "Création de la clé refusée par Mealie ({status}). {detail}",
    en: "Mealie refused to create the key ({status}). {detail}"
  },
  "content.noKey": { fr: "Mealie n’a pas renvoyé de clé API.", en: "Mealie returned no API key." },
  "content.timeout": {
    fr: "Délai dépassé : aucune identification détectée sur Mealie.",
    en: "Timed out: no sign-in detected on Mealie."
  },

};

let i18nLanguage = "fr";

// Une préférence vide vaut « suivre le système » — c’est aussi ce que stocke
// l’app tant que l’utilisateur n’a rien choisi.
function resolveLanguage(preference) {
  if (preference === "fr" || preference === "en") return preference;
  const system = String(navigator.language || "en").slice(0, 2).toLowerCase();
  return system === "fr" ? "fr" : "en";
}

function setLanguage(preference) {
  i18nLanguage = resolveLanguage(preference);
  return i18nLanguage;
}

function t(key, vars) {
  const entry = I18N_STRINGS[key];
  let text = entry ? entry[i18nLanguage] ?? entry.fr : key;
  if (!vars) return text;
  for (const [name, value] of Object.entries(vars)) {
    text = text.split(`{${name}}`).join(String(value ?? ""));
  }
  return text;
}

function plural(count, oneKey, manyKey) {
  // Le français garde le singulier à zéro, l’anglais non.
  const singular = i18nLanguage === "fr" ? Math.abs(count) < 2 : Math.abs(count) === 1;
  return t(singular ? oneKey : manyKey, { count });
}

// Traduit le balisage statique. Le texte des boutons porteurs d’icône vit dans
// un <span> dédié : écrire dans le bouton lui-même effacerait le SVG.
function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((node) => {
    const text = t(node.dataset.i18nTitle);
    node.title = text;
    if (node.hasAttribute("aria-label")) node.setAttribute("aria-label", text);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  if (root === document) document.documentElement.lang = i18nLanguage;
}

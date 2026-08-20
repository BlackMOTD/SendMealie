const DEFAULTS = { mealieUrl: "", token: "", endpoint: "/api/recipes/create/url" };
const sendView = document.querySelector("#send-view");
const settingsView = document.querySelector("#settings-view");
const sendButton = document.querySelector("#send-button");
const status = document.querySelector("#status");
let currentTab;
let recipeData = null;

function showStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = kind;
}

async function loadPage() {
  [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
  document.querySelector("#recipe-title").textContent = currentTab?.title || "Page sans titre";
  try {
    const metadata = await browser.tabs.sendMessage(currentTab.id, { type: "get-recipe-metadata" });
    if (metadata?.title) document.querySelector("#recipe-title").textContent = metadata.title;
    recipeData = metadata?.recipe || null;
  } catch {}
}

async function loadSettings() {
  const settings = await browser.storage.local.get(DEFAULTS);
  if (settings.endpoint === "/api/recipes/create") {
    settings.endpoint = DEFAULTS.endpoint;
    await browser.storage.local.set({ endpoint: settings.endpoint });
  }
  document.querySelector("#mealie-url").value = settings.mealieUrl;
  document.querySelector("#token").value = settings.token;
  document.querySelector("#endpoint").value = settings.endpoint;
}

document.querySelector("#settings-link").addEventListener("click", () => { sendView.hidden = true; settingsView.hidden = false; });
document.querySelector("#cancel-button").addEventListener("click", () => { settingsView.hidden = true; sendView.hidden = false; });

document.querySelector("#settings-view").addEventListener("submit", async (event) => {
  event.preventDefault();
  await browser.storage.local.set({
    mealieUrl: document.querySelector("#mealie-url").value.trim().replace(/\/$/, ""),
    token: document.querySelector("#token").value.trim(),
    endpoint: document.querySelector("#endpoint").value.trim()
  });
  showStatus(document.querySelector("#settings-status"), "Configuration enregistrée.", "success");
  setTimeout(() => { settingsView.hidden = true; sendView.hidden = false; }, 600);
});

sendButton.addEventListener("click", async () => {
  if (!currentTab?.url || !/^https?:/.test(currentTab.url)) {
    showStatus(status, "Cette page ne peut pas être importée.", "error");
    return;
  }
  sendButton.disabled = true;
  showStatus(status, "Envoi en cours…");
  const result = await browser.runtime.sendMessage({
    type: "send-recipe",
    url: currentTab.url,
    recipeData
  });
  sendButton.disabled = false;
  showStatus(status, result.ok ? "Recette envoyée dans Mealie." : result.error, result.ok ? "success" : "error");
});

loadSettings();
loadPage();

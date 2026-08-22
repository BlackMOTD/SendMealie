/* Obtention de la clé API depuis une page Mealie déjà identifiée.
   Partagé, littéralement, par le script de page de l’extension et par la
   WKWebView de l’app : le dossier Shared/ est compilé dans les deux cibles.

   Ce fichier a existé en deux exemplaires le temps d’une version, et ils ont
   divergé — la copie de l’app avait perdu le repli sur les cookies, où Mealie
   range son jeton. Une seule source, donc.

   Renvoie, sans jamais lever :
     { state: "anonymous" }                              personne d’identifié
     { state: "unreachable" }                            instance injoignable
     { state: "refused", reason: "http", status, detail }
     { state: "refused", reason: "no-token" }
     { state: "granted", token, tokenId, user } */

const SENDMEALIE_TOKEN_NAME = "SendMealie";

const sendMealieIsJwt = (value) => typeof value === "string" && value.split(".").length === 3;

// Mealie range son jeton tantôt dans localStorage, tantôt dans un cookie selon
// la version et la configuration du frontend. Les deux sont fouillés.
function sendMealieFindBearer() {
  for (const key of Object.keys(localStorage)) {
    if (!/token|auth/i.test(key)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    const direct = raw.replace(/^"|"$/g, "").replace(/^Bearer /i, "");
    if (sendMealieIsJwt(direct)) return direct;

    try {
      const parsed = JSON.parse(raw);
      for (const candidate of [parsed?.access_token, parsed?.token, parsed?.value]) {
        const cleaned = String(candidate ?? "").replace(/^Bearer /i, "");
        if (sendMealieIsJwt(cleaned)) return cleaned;
      }
    } catch {}
  }

  for (const part of document.cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!/token/i.test(name)) continue;
    const value = decodeURIComponent(rest.join("=")).replace(/^Bearer /i, "");
    if (sendMealieIsJwt(value)) return value;
  }

  return null;
}

async function sendMealieClaimToken() {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  const bearer = sendMealieFindBearer();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  let me;
  try {
    me = await fetch("/api/users/self", { credentials: "include", headers });
  } catch {
    return { state: "unreachable" };
  }
  if (!me.ok) return { state: "anonymous" };

  const created = await fetch("/api/users/api-tokens", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ name: SENDMEALIE_TOKEN_NAME })
  });

  if (!created.ok) {
    const detail = await created.text().catch(() => "");
    return { state: "refused", reason: "http", status: created.status, detail: detail.slice(0, 120) };
  }

  const data = await created.json().catch(() => null);
  const token = data?.token || data?.access_token;
  if (!token) return { state: "refused", reason: "no-token" };

  const user = await me.json().catch(() => null);
  return {
    state: "granted",
    token,
    tokenId: data?.id ?? data?.token_id ?? null,
    user: user?.username || user?.fullName || user?.email || ""
  };
}

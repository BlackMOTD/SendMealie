# Development notes

Platform behaviours that cost real debugging time. Each one fails silently, which is why they are written down.

## Xcode flattens the resources tree

Everything under `SendMealie Extension/Resources/`, subfolders included, lands **flat** at the root of `Resources/` in the built bundle. There is no `icons/` directory in the app.

1. Any file referenced by `manifest.json` must sit at the root of `Resources/`, with no folder prefix. A path like `icons/toolbar.png` resolves to nothing once built, and Safari falls back to its generic icon without a word.
2. Two files sharing a basename anywhere in the tree collide. Before adding one: `find . -type f -exec basename {} \; | sort | uniq -d`.

This is also why `AppIcon-source/` lives outside the extension resources — inside, its PNGs would ship in the extension for nothing.

## Safari re-tints toolbar icons

Safari renders the toolbar icon as a *template image* when it considers it monochrome: it drops the supplied colour and tints the icon itself, which is where the blue comes from. A sufficiently saturated image is displayed as-is.

Measured on this extension: orange `#e58325` (saturation 0.84) renders in colour; a neutral grey `#8a8f94` (saturation 0.03) came back blue. The inactive state therefore uses a warm grey `#bfa07a` (saturation 0.36) — desaturated enough to read as "off", saturated enough to escape templating.

Because that behaviour is not guaranteed, the active and inactive states differ **by shape** first — full plate versus empty plate. Shape survives any tinting. Colour is only a second signal.

The extension list icon is unaffected: that one is `icons` in the manifest, not `action.default_icon`.

## Site permission gates everything

`host_permissions` is not enough. Safari asks for permission per site, and without it `content.js` does not run on the page at all — no recipe detection, no ingredient extraction, no icon change, no error. The popup now says so explicitly when the content script fails to answer.

## Popup layout

The popup shows exactly one of two sections — the send view when a connection exists, the setup view otherwise — and never switches between them while open. The shared minimum height that earlier versions carried is gone with the settings form; only `#send-view` keeps a floor (139 px, measured), so its account footer does not ride up when the status line is empty.

Measure in **WebKit**, not in a Chromium headless run — the two disagree by a few pixels on this layout. A `WKWebView` in a tiny Swift script is enough: load the popup from a file URL with a measuring script inlined, read back `document.title`, no window needed. The same trick with `takeSnapshot` renders the popup to PNG for a visual check.

Status lines collapse when empty (`#status:empty`). Left at their reserved height they carve a visible gap under the button.

## The extension cannot launch the app

Safari extensions have no API to open their containing app. They can hand a URL to LaunchServices, which is why the app registers the `sendmealie://` scheme — the gear button in the popup opens `sendmealie://settings`.

- The scheme needs `CFBundleURLTypes`, which has no `INFOPLIST_KEY_` equivalent. The app therefore has a real `Config/SendMealie-Info.plist`, pointed at by `INFOPLIST_FILE`; Xcode still merges the generated keys into it. It lives **outside** the synchronized folders on purpose: dropped in `SendMealie/`, the sync group copies it into `Resources/` as dead weight, and Xcode starts managing it behind your back.
- `INFOPLIST_FILE` is a build setting, so it lives in `project.pbxproj`. **Xcode rewrites that file from its in-memory model**: an edit made on disk while Xcode has the project open will be silently reverted. Close it, or reopen the project after editing.
- LaunchServices refuses to resolve the scheme for a build sitting in a temporary directory (`kLSApplicationNotFoundErr`), even though `lsregister -dump` lists the claim. It resolves normally from `/Applications` or `~/Applications` — do not read the temp-directory failure as a broken registration.

The popup tries the native bridge first (`SafariWebExtensionHandler` calls `NSWorkspace.open`) and falls back to opening the scheme in a throwaway tab, which it closes. Two independent mechanisms, because neither is guaranteed.

## A popup's timers die with the popup

`window.close()` destroys the popup's JavaScript context immediately. Anything deferred — `setTimeout`, a pending promise, a cleanup callback — never runs. The fallback that opens `sendmealie://` in a throwaway tab used to schedule the tab's removal from the popup and close itself in the next statement, so the empty tab stayed forever.

Anything that has to outlive the click belongs in `background.js`, which stays alive long enough. The popup's job is to send a message and get out of the way.

## One window, and only one

The app uses a `Window` scene, not `WindowGroup`. `WindowGroup` is a template: an `onOpenURL` arriving while the app runs can spawn a second window, and the File menu offers *New Window*. `Window` exists in exactly one instance, so `sendmealie://` always lands on the window that is already there.

Closing that window quits the app (`applicationShouldTerminateAfterLastWindowClosed`). Without it, a windowless process would keep running and *Open SendMealie* would activate something that shows nothing, with no way back.

Counting windows to check this is misleading: the settings sheet is a separate `CGWindow` (400×329), so a correct single-window app legitimately reports two entries while the sheet is up.

## The app drives the connection, the extension executes it

Since the popup lost its settings form, nothing in the extension initiates a connection. The app writes `connectRequestedAt` into the shared container and sends the user to Mealie in Safari; `armPendingConnect` in `background.js` turns that into the `connectBase` / `connectStartedAt` pair that `content.js` already watches for.

What wakes the background page is the ordinary `page-recipe-state` message the content script sends on every page. While no token is stored, that message also triggers a `syncConfig()` — cheap, short-lived, and it stops as soon as the key exists.

## Safari binds the extension to the app's path

Safari does not load the extension from "the app called SendMealie" — it loads it from the exact bundle LaunchServices registered. Move that app, delete it, or keep several copies around, and the binding rots:

- `SFSafariExtensionManager.stateOfSafariExtension` throws, which the app reports as *extension state unknown*.
- The toolbar button does nothing useful, and Safari behaves differently after each restart.

Every build registers itself, so a few days of `Product > Archive` and drag-to-Desktop leaves a pile of registrations for one bundle id. List them:

```bash
LS=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister
"$LS" -dump | grep -E "^\s*path:.*SendMealie.*\.app" | sed 's/^[[:space:]]*path:[[:space:]]*//; s/ (0x[0-9a-f]*)$//' | sort -u
```

Unregister everything that is not the copy in `/Applications` with `"$LS" -u <path>`, then launch that one and restart Safari. **Install to `/Applications` and leave it there**; running from `~/Downloads` or the Desktop works until the folder is tidied away, and then nothing works and nothing says why.

## The background script is not a service worker

Apple's own Safari extension template declares `"background": { "scripts": [...] }`, not `"service_worker"`. This project follows it and loads three files in order: `i18n.js`, then `bridge.js` (shared settings and the native bridge), then `background.js` (what the extension *does* — sending, account, icon, lifecycle). They share one global scope, so order is the only contract between them.

An earlier version used `"service_worker"` plus `importScripts("i18n.js")` at the top of `background.js`. If `importScripts` is not defined in whatever context Safari actually runs that file, the very first line throws and **every listener in the file is never registered** — no icon updates, no sending, no config sync, and no error anywhere the user can see. The `scripts` array needs no worker API at all, so the question does not arise.

## The App Group is the only bridge

The app and the extension are sandboxed separately. The app cannot write to `browser.storage.local`; the extension cannot read the app's `UserDefaults`. The App Group container is the only ground they share, and `browser.runtime.sendNativeMessage()` is the only doorway to it — it wakes `SafariWebExtensionHandler`, which does have access.

- Both targets must carry the capability. If only one does, the container is silently missed.
- The manifest declares `nativeMessaging`. Apple's own template ships `"permissions": []`, which looked like evidence that Safari does not need it — but that template never calls `sendNativeMessage` from JavaScript, so its silence proves nothing. Chrome and Firefox both require it; declaring it costs nothing, and Safari ignores permissions it does not recognise.
- `nativeRequest` in `background.js` keeps the failure reason in `lastNativeError` and hands it to the popup. Swallowing that exception is what made this whole class of failure indistinguishable from "the app was never configured": the extension had no way to say *I could not ask*. The popup now separates *nothing configured yet*, *the bridge did not answer*, *the container is unreachable* and *the background script is silent*.
- Two copies of the same settings coexist. `updatedAt` arbitrates — last write wins, whichever side wrote it. `syncConfig()` runs on install, on startup and every time the popup opens.
- The protocol itself lives in `SharedBridge`, not in `SafariWebExtensionHandler`, so tests can drive it against an in-memory store. Safari carries the message; everything it decides is covered by `SharedBridgeTests` — including the extension → app direction, which is otherwise only observable by actually running Safari.

## Resolving the App Group identifier

The identifier carries the team prefix, so it differs in every fork, and getting it wrong fails **silently**: `UserDefaults(suiteName:)` happily opens a suite that is attached to nothing, reads come back empty, and the extension looks like an app that was never configured.

It is therefore written at build time into the `SMAppGroupIdentifier` key of **both** Info.plists, as `$(DEVELOPMENT_TEAM).group.fr.warneford.sendmealie`, and read from there first. `SecTaskCreateFromSelf` remains as a fallback — it works in the app, but nothing guarantees it inside the app extension, which is the process that matters. If neither yields a prefixed identifier, `groupIsResolved` is false and `isAvailable` reports the container as missing rather than pretending it is empty.

Both processes must resynchronise before reading, hence the `CFPreferencesAppSynchronize` in `load()`: `UserDefaults` will otherwise serve a cached copy and each side ignores what the other just wrote.

To see what the bridge actually did:

```bash
log show --predicate 'eventMessage CONTAINS "SendMealie:"' --last 10m --info
```

Each native message logs the resolved group, whether a configuration was found, and the outcome.

## Translations do not use `browser.i18n`

`_locales/fr/messages.json` cannot survive the resource flattening described above: the directory structure is lost, and Safari finds nothing. `i18n.js` therefore holds a flat table, loaded by the popup (`<script>`), the background scripts (first entry of `background.scripts`) and the content script (declared in `content_scripts`).

The language is not read from the browser either — it lives in the shared settings, so choosing it in the app changes the popup too. An empty value means "follow the system".

## Two contexts, two encodings

`i18n.js` starts with a UTF-8 BOM, deliberately. The popup loads it with `popup.html`'s declared charset and decodes it correctly; the background page Safari generates declares no charset, and decoded the very same file as Latin-1 — so a message produced in the background reached the popup as `rien nâ€™a Ã©tÃ© envoyÃ©`. A BOM outranks every other encoding guess. Do not strip it.

Belt and braces, the background no longer produces prose at all: `sendRecipe` and `accountInfo` return `errorKey`, `errorVars` and `hintKey`, and the popup turns them into a sentence. Presentation belongs to the side that has a document anyway, and it means a future encoding surprise in the background context cannot reach the user.

## Answering a message means returning a Promise

`content.js` used to reply like this:

```js
browser.runtime.onMessage.addListener((message) => {
  if (message.type !== "get-recipe-metadata") return;
  return analysePage();          // objet nu — jamais reçu
});
```

Under the WebExtensions contract a listener answers by returning a **Promise** (or by returning `true` and calling `sendResponse`). Returning a plain object means *not handled*, so `browser.tabs.sendMessage` resolves with `undefined`. The background listener is `async`, so it always got this right; the content script did not, and its reply never reached the popup — on every page, since 0.0.1. Nothing looked broken because a missing reply just meant `recipeData` stayed null and Mealie's own URL import took over.

It surfaced only once *no reply* started to mean *refuse the send*. `Promise.resolve(analysePage())` is the fix; the node harness asserts the listener returns a thenable.

## No answer is not the same as no recipe

`browser.tabs.sendMessage` does **not** reliably reject when nothing answers — Safari resolves it with `undefined`. `loadPage` therefore treats a missing or shapeless reply exactly like a thrown error, and only trusts `evidence` when the field is actually present.

Do **not** try to name the cause with `browser.permissions.contains`: on Safari it reports what `host_permissions` declares in the manifest, not what the user granted site by site, so it answers `true` for every `https://` page whether or not the extension may actually run there. A version of this file claimed otherwise, and the popup confidently told the user their tab was merely stale while the real fault was elsewhere. Offer the remedy — request the permission from a click, then reload the tab — without asserting the diagnosis.

## One script claims the token, for both

`Shared/claim-token.js` is compiled into **both** targets, so it ships flat in the app's `Resources/` and in the extension's. The extension declares it in `content_scripts`; the app reads it out of its own bundle and hands it to `WKWebView.callAsyncJavaScript`.

It was written twice for one version, and the two copies diverged immediately: the app's lost the `document.cookie` fallback, and Mealie's Nuxt frontend keeps its token in `mealie.auth._token.local` rather than in `localStorage` on plenty of instances. The app then sat on "waiting for you to sign in" against a browser that was plainly signed in. One file, no second copy to forget.

The contract is a plain object, never a thrown error — `anonymous`, `unreachable`, `refused` (with `reason`), `granted`. Each caller maps it to its own localized strings, which is why the shared file carries no user-facing text.

## Everything Safari-facing lives in `SafariLink`

`SafariLink` holds the extension identifier, the extension's enabled state, the settings pane and opening a URL *in Safari specifically*. They share the same traps, which is why they sit together:

- the identifier is `Bundle.main.bundleIdentifier + ".Extension"`, never written by hand — a spelled-out constant went stale the moment the bundle id changed, and `SFSafariExtensionManager` then answered about an extension that did not exist, silently, since its error path is indistinguishable from "not installed";
- `showPreferencesForExtension` opens the pane but leaves Safari behind the app's window, so it has to be brought forward explicitly;
- the extension only exists in Safari, so links meant for it must not go to the default browser.

## Mealie API

Verified against the OpenAPI schema of a v3.23 instance, served without authentication at `/openapi.json`:

- `POST /api/users/api-tokens` → **201** with `{ name, id, createdAt, token }`. The `id` is kept so the key can be revoked later.
- `DELETE /api/users/api-tokens/{token_id}` takes an **integer**.
- `GET /api/users/self` exposes `tokens[]`, typed `array | null`. A missing list must never be mistaken for a successful deletion.
- `POST /api/recipes/create/html-or-json` when the page carries JSON-LD, `POST /api/recipes/create/url` otherwise. `ScrapeRecipeData` takes `data` (required) plus an optional `url`; `data` is the JSON-LD document as a string.
- The `Recipe` node extracted from a page's `@graph` **carries no `@context`** — that key lives on the enclosing document. Sent as-is, nothing ties the object to schema.org and Mealie answers `400 BAD_RECIPE_DATA`. `withContext` in `content.js` reattaches it. Marmiton is the case that exposed this, and it stayed hidden as long as the content script's reply never arrived at all.
- When `html-or-json` is refused for any reason other than 401/403, `sendRecipe` retries with `create/url`. Mealie's own scrapers cover hundreds of sites and routinely succeed where a page's markup does not; there is no reason for a save to fail just because the structured payload displeased the parser. On 401/403 it does not retry — the key is the problem, and a second call would only repeat it.
- `GET /api/recipes?page=&perPage=` returns `{ items, total }`. The `orderBy` column name has moved between Mealie versions, so `MealieClient.recipes` retries without it on a 4xx and sorts client-side — a rejected sort would otherwise take down the whole dashboard.
- Thumbnails live at `/api/media/recipes/{id}/images/min-original.webp`. They are fetched with the same `Authorization` header as everything else, which is why the app does not use `AsyncImage`.

## Icons

`Resources/icons/*.svg` holds the source drawings; the PNGs actually shipped sit at the root of `Resources/`.

To regenerate a PNG with transparency, use a headless browser — `qlmanage` composites a white background and fails outright at 16 px:

```bash
"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  --headless --default-background-color=00000000 \
  --window-size=32,32 --screenshot=out.png page-embedding-the-svg.html
```

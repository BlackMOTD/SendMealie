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

Both views share a minimum height so the popup does not resize when switching between them. The value in `popup.css` is **measured, not computed**: after changing either view, measure the natural heights again and update it, or a gap reappears.

```js
view.style.minHeight = "0";
const natural = view.offsetHeight;
view.style.minHeight = "";
```

Status lines collapse when empty (`#status:empty`). Left at their reserved height they carve a visible gap under the button.

## Mealie API

Verified against the OpenAPI schema of a v3.23 instance, served without authentication at `/openapi.json`:

- `POST /api/users/api-tokens` → **201** with `{ name, id, createdAt, token }`. The `id` is kept so the key can be revoked later.
- `DELETE /api/users/api-tokens/{token_id}` takes an **integer**.
- `GET /api/users/self` exposes `tokens[]`, typed `array | null`. A missing list must never be mistaken for a successful deletion.
- `POST /api/recipes/create/html-or-json` when the page carries JSON-LD, `POST /api/recipes/create/url` otherwise.

## Icons

`Resources/icons/*.svg` holds the source drawings; the PNGs actually shipped sit at the root of `Resources/`.

To regenerate a PNG with transparency, use a headless browser — `qlmanage` composites a white background and fails outright at 16 px:

```bash
"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  --headless --default-background-color=00000000 \
  --window-size=32,32 --screenshot=out.png page-embedding-the-svg.html
```

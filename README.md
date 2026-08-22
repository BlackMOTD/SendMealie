# SendMealie

A Safari extension that saves the recipe you are reading to your own [Mealie](https://mealie.io) instance, in one click — plus a companion macOS app that sets it up and shows you what is in your instance.

![The SendMealie popup on a recipe page](docs/screenshot.png)

[sendmealie.warneford.fr](https://sendmealie.warneford.fr)

## Features

### Extension

- Saves the current page to Mealie from the toolbar.
- Imports structured data when the page provides it — title, image, ingredients, steps, timings — and falls back to Mealie's URL import otherwise.
- Refuses to save a page it cannot recognise as a recipe, rather than creating an empty entry. A **Send anyway** link under the error hands the page to Mealie's own scraper, which often succeeds where reading the page fails.
- Lights up its toolbar icon on pages recognised as recipes — JSON-LD, `schema.org` microdata, `hrecipe` microformat, or French and English ingredient/step headings.
- Shows the connected user and the instance's recipe count.
- Carries no settings of its own: the gear button opens the app, which is where the instance, the key and the language live.
- Follows the system light or dark appearance.

### App

- Guided setup: language, instance address, then Mealie's own sign-in page. The app never sees your password; it creates its API key from your session, exactly as the extension does.
- A dashboard over your instance: total recipes, recipes added in the last thirty days, distinct tags, and the thirty most recent recipes with thumbnails. Clicking one opens it in Mealie.
- Shows whether the Safari extension is enabled, and opens Safari's settings in one click — a disabled extension is the most common failure, and it used to be silent.
- Settings, and a two-step disconnect that revokes the key on the server before erasing anything.

Both are available in French and English. The choice is made in either one and applies to both, sharing an App Group container.

## Requirements

- macOS 14 or later, with Safari 16.4 or later
- Xcode 15 or later
- A Mealie instance — tested against v3.23

## Download

A compiled build is attached to each [release](https://github.com/BlackMOTD/SendMealie/releases) as a `.zip`.

> [!WARNING]
> **This build is not notarized by Apple.** It is signed with a personal development certificate, which is enough to run it but not enough to satisfy Gatekeeper. macOS will refuse to open it on first launch, and clearing that is on you:
>
> ```bash
> xattr -dr com.apple.quarantine /Applications/SendMealie.app
> ```
>
> Alternatively, open it once, then allow it from **System Settings > Privacy & Security > Open Anyway**.
>
> If Safari does not list the extension afterwards, enable **Develop > Allow Unsigned Extensions** — a setting that resets every time Safari restarts.
>
> The software is provided as is, without warranty of any kind (see [LICENSE](LICENSE)). If any of the above makes you uncomfortable, **build from source instead** — it takes five minutes and produces a build signed by you, with none of these caveats.

Install steps: unzip, move `SendMealie.app` to `/Applications`, launch it and follow the setup, then enable the extension in **Safari > Settings > Extensions** and set its website access to **Allow on Every Website**.

> [!IMPORTANT]
> Install it in `/Applications` and leave it there. Safari binds the extension to the exact bundle it was registered from, so running the app out of `~/Downloads` or the Desktop works only until that folder is tidied away — after which the extension misbehaves with no error shown anywhere. [DEVELOPMENT.md](DEVELOPMENT.md) has the commands to list and clear stale registrations.

## Build from source

This is the recommended route. Safari only loads extensions from a signed host app, and building it yourself avoids every warning above:

1. Open `SendMealie.xcodeproj` in Xcode.
2. For both the **SendMealie** and **SendMealie Extension** targets, under *Signing & Capabilities*, enable automatic signing and select your team.
3. Both targets already declare the App Groups capability (`$(TeamIdentifierPrefix)group.fr.warneford.sendmealie`). Xcode enables it against your own team when you sign; without it the app and the extension keep separate settings instead of sharing one.
4. **Product > Archive**, then **Distribute App > Custom > Copy App**.
5. Move `SendMealie.app` to `/Applications` and launch it once — this is what registers the extension with macOS.
6. In Safari, open **Settings > Extensions**, enable SendMealie, and set its website access to **Allow on Every Website**.

That last step is not optional. Without site access Safari never runs the content script, and recipe detection, ingredient extraction and the toolbar icon all stay silent — with no error anywhere.

## Setup

Either route works, and both write to the same place.

**From the app.** Launch it, pick a language, enter your instance address. Mealie's own sign-in page appears; log in as you normally would. The app detects the session, creates an API token named `SendMealie`, and stores it.

**From the app, but signing in in Safari.** On the address step, choose *Rather sign in from Safari*. Your Mealie opens in Safari, you sign in there, and the extension creates the key and hands it to the app through the shared container. Nothing is typed into the app. This route needs the extension enabled — the waiting screen says so, and opens Safari's settings for you.

There is no third route: the extension has no settings screen. Its gear button opens the app.

No password ever passes through SendMealie. The token is created from the Mealie page itself using your existing session (`POST /api/users/api-tokens`), and disconnecting revokes it server-side before clearing anything locally.

## Privacy

Your instance URL and the API token SendMealie created for itself are stored in Safari's local extension storage and in the app's App Group container, both on your Mac. Nothing is sent anywhere but your own Mealie instance. No telemetry, no third-party service.

## Changelog

[CHANGELOG.md](CHANGELOG.md) lists what changed in each version.

## Contributing

Issues and pull requests are welcome. [DEVELOPMENT.md](DEVELOPMENT.md) documents the Safari and Xcode behaviours that are easy to get wrong — read it before touching the icons, the manifest paths or the popup layout.

## License

MIT — see [LICENSE](LICENSE).

# SendMealie

A Safari extension that saves the recipe you are reading to your own [Mealie](https://mealie.io) instance, in one click.

![The SendMealie popup on a recipe page](docs/screenshot.png)

## Features

- Saves the current page to Mealie from the toolbar.
- Imports structured data when the page provides it — title, image, ingredients, steps, timings — and falls back to Mealie's URL import otherwise.
- Lights up its toolbar icon on pages recognised as recipes.
- Sets itself up: you log in to Mealie once, the extension creates and stores its own API key.
- Shows the connected user and the instance's recipe count.
- Follows the system light or dark appearance.

The interface is in French.

## Requirements

- macOS with Safari 16.4 or later
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

Install steps: unzip, move `SendMealie.app` to `/Applications`, launch it once, then enable the extension in **Safari > Settings > Extensions** and set its website access to **Allow on Every Website**.

## Build from source

This is the recommended route. Safari only loads extensions from a signed host app, and building it yourself avoids every warning above:

1. Open `SendMealie.xcodeproj` in Xcode.
2. For both the **SendMealie** and **SendMealie Extension** targets, under *Signing & Capabilities*, enable automatic signing and select your team.
3. **Product > Archive**, then **Distribute App > Custom > Copy App**.
4. Move `SendMealie.app` to `/Applications` and launch it once — this is what registers the extension with macOS.
5. In Safari, open **Settings > Extensions**, enable SendMealie, and set its website access to **Allow on Every Website**.

That last step is not optional. Without site access Safari never runs the content script, and recipe detection, ingredient extraction and the toolbar icon all stay silent — with no error anywhere.

## Setup

Open the extension, enter your instance URL, and click **Se connecter à Mealie**. Your Mealie opens in a new tab; log in as you normally would. The extension detects the session, creates an API token named `SendMealie`, stores it, and closes the tab.

No password ever passes through the extension. The token is created from the Mealie page itself using your browser session (`POST /api/users/api-tokens`), and resetting the connection revokes it server-side before clearing local storage.

## Privacy

The extension stores your instance URL and its API token in Safari's local extension storage. It talks to nothing but your own Mealie instance.

## Contributing

Issues and pull requests are welcome. [DEVELOPMENT.md](DEVELOPMENT.md) documents the Safari and Xcode behaviours that are easy to get wrong — read it before touching the icons, the manifest paths or the popup layout.

## License

MIT — see [LICENSE](LICENSE).

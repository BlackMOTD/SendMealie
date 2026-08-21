# Release notes template

Copy the block below into the GitHub release description, adjust the version, and attach `SendMealie.app` zipped.

```bash
# from the folder containing the built app
ditto -c -k --keepParent SendMealie.app SendMealie-vX.Y.Z.zip
```

Use `ditto` rather than the Finder's "Compress": it preserves the bundle's code signature.

---

## SendMealie vX.Y.Z

<!-- one line on what changed -->

### Install

1. Unzip and move `SendMealie.app` to `/Applications`.
2. Launch it once — this registers the extension with macOS.
3. In Safari: **Settings > Extensions**, enable SendMealie, and set website access to **Allow on Every Website**.

Site access is required. Without it Safari never runs the content script, so recipe detection and ingredient extraction stay silent, with no error shown anywhere.

### ⚠️ This build is not notarized

It is signed with a personal Apple development certificate. That is enough to run the app, not enough to satisfy Gatekeeper, so **macOS will refuse to open it on first launch**.

Clear the quarantine flag yourself:

```bash
xattr -dr com.apple.quarantine /Applications/SendMealie.app
```

Or try to open it once, then allow it from **System Settings > Privacy & Security > Open Anyway**.

If Safari still does not list the extension, enable **Develop > Allow Unsigned Extensions** — note that this setting resets each time Safari restarts.

**Prefer building it yourself.** It takes about five minutes, produces a build signed by your own Apple ID, and none of the warnings above apply. See the README.

### Warranty

None. The software is provided "as is", without warranty of any kind — see [LICENSE](../LICENSE). You run it at your own risk.

### Privacy

SendMealie stores your Mealie instance URL and an API token it creates for itself, in Safari's local extension storage. It talks to nothing but your own Mealie instance. No telemetry, no third-party service.

# macOS one-click launchers

For the self-contained download, use the [standalone Mac release](https://github.com/udeudeude/Anaglyph-and-Friends/releases/latest) and its [instructions](DOWNLOAD-README.txt). That app bundles the runtime, frontend and local V2 model and needs no developer setup. The two small app bundles checked into this folder are instead launchers for a source checkout, described below.

The `Mac Desktop` workflow builds Intel and Apple Silicon packages on GitHub cloud Macs, runs the actual frozen executable through frontend serving, local V2 inference, depth edits and full-resolution output, then publishes versioned ZIPs and checksums only after both architectures pass. Pull requests build/test artifacts but do not publish releases. `desktop.py` serves the unchanged frontend/API together on an OS-assigned loopback port and uses a small native control window. Session files and logs go into the user's Library, never inside the bundle. The hosted Docker dependencies remain separate.

After completing the [one-time local setup](../README.md#new-to-github-start-here), double-click **Anaglyph & Friends.app** here to start the Python backend and web interface. It opens the browser after **both** services respond. Reopening the launcher reuses healthy services.

Double-click **Stop Anaglyph & Friends.app** when you want to stop the services launched by these app bundles. It verifies each saved process before stopping it, so a stale process number cannot stop another app. Servers you started manually remain running.

These small app bundles do not contain Python, Node.js, the AI model, or dependencies. They are launchers for the installed local edition, so the first-time README setup is still required. Logs are written to:

`~/Library/Logs/Anaglyph-and-Friends/`

The launchers keep PID files under:

`~/Library/Application Support/Anaglyph-and-Friends/`

Keep both app bundles in this `macos` folder so they can find the checkout. You can put Finder aliases to them in Applications or the Dock. Because the bundles are not signed/notarized, macOS may require Control-click → Open the first time. If startup fails, the launcher shows an error and keeps the service logs for diagnosis. Node.js installed through nvm is detected even when Finder does not load your shell setup.

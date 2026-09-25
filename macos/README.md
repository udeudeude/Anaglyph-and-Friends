# macOS one-click launchers

After completing the normal local setup once, double-click **Anaglyph & Friends.app** to start the existing Python backend and Vite frontend and open the local browser workspace.

Double-click **Stop Anaglyph & Friends.app** when you want to stop those local servers.

These small app bundles do not contain Python, Node.js, the AI model, or dependencies. They are launchers for the installed local edition, so the first-time README setup is still required. Logs are written to:

`~/Library/Logs/Anaglyph-and-Friends/`

The launchers keep PID files under:

`~/Library/Application Support/Anaglyph-and-Friends/`

Because these app bundles are not signed/notarized, macOS may require Control-click -> Open the first time.

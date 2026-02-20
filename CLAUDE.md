## Interacting with the app

Use the `playwright-cli` skill to interact with the web app on `http://localhost:5173`.

Prefer using snapshots over screenshots for speed and token efficiency when possible. Only use screenshots when visual testing is requested by the user.

Do not prepend `playwright-cli` commands with `npx` or anything like that.

### Authentication

Since the app is behind a login, you'll have to use stored credentials. By convention, we store these in `auth.local.json` (gitignored).

First, check if `auth.local.json` exists. If no, continue to login. If yes, skip to loading state.

#### Logging in and saving state

1. Open the app in headed mode with `playwright-cli open http://localhost:5173 --headed` and ask the user to log in and let you know when done.
2. Save the auth state with `playwright-cli state-save auth.local.json`.
3. Close the browser with `playwright-cli close` to ensure state is not persisted.

#### Loading state

1. Open the browser with `playwright-cli open http://localhost:5173`.
2. Load the auth state with `playwright-cli state-load auth.local.json`.
3. Navigate to the homepage (away from Auth0 login page) with `playwright-cli goto http://localhost:5173`.
4. Wait 5 seconds
5. Take a snapshot with `playwright-cli snapshot` and check that the page title does not contain "log in".

### Efficiency

Run all commands in as few tool calls as possible, combining several with `&&`.

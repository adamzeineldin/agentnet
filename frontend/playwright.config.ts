import { defineConfig, devices } from "@playwright/test";

// Isolated stack: backend on :8011 with a throwaway DB/artifacts, production frontend on :3011
// built into .next-e2e. The dev servers (:8000/:3000) and the dev registry are never touched.
// MODEL_API_KEY, NIMBOTICS_URSIM_BRIDGE_URL, the sign-in client ids and the session secret are blanked (an existing
// env var wins over .env) so UI tests never spend model credits, move a controller or need an account.
const API = "http://127.0.0.1:8011";
const DATA = "../.e2e-data";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3011", trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: [
    {
      command: `rm -rf ${DATA} && mkdir -p ${DATA} && cd ../backend && MODEL_API_KEY= NIMBOTICS_URSIM_BRIDGE_URL= GOOGLE_CLIENT_ID= GITHUB_CLIENT_ID= NIMBOTICS_SESSION_SECRET= NIMBOTICS_APP_URL= NIMBOTICS_DB_PATH=../.e2e-data/e2e.db NIMBOTICS_ARTIFACT_DIR=../.e2e-data/artifacts .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8011`,
      url: `${API}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `NEXT_DIST_DIR=.next-e2e NEXT_PUBLIC_API_BASE=${API} npx next build && NEXT_DIST_DIR=.next-e2e npx next start -p 3011 -H 127.0.0.1`,
      url: "http://127.0.0.1:3011",
      timeout: 240_000,
      reuseExistingServer: false,
    },
  ],
});

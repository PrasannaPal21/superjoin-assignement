import { config as loadEnv } from "dotenv";
import path from "path";

// Ensure server/worker code sees .env even under `next start` edge cases.
loadEnv({ path: path.resolve(process.cwd(), ".env") });

export async function register() {
  // no-op: side effect above is intentional
}

/**
 * Fresh start: wipe SQLite knowledge DB + uploaded PDFs.
 * Usage: npx tsx scripts/reset-data.ts
 */
import fs from "fs";
import path from "path";
import { config } from "dotenv";
config();

const dbPath = process.env.DATABASE_PATH || "data/factlayer.db";
const uploadDir = process.env.UPLOAD_DIR || "data/uploads";

function rmQuiet(p: string) {
  try {
    fs.unlinkSync(p);
    console.log("removed", p);
  } catch {
    /* missing */
  }
}

function rmDirContents(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      fs.rmSync(full, { recursive: true, force: true });
      console.log("removed dir", full);
    } else {
      fs.unlinkSync(full);
      console.log("removed", full);
    }
  }
}

rmQuiet(dbPath);
rmQuiet(`${dbPath}-wal`);
rmQuiet(`${dbPath}-shm`);
rmDirContents(uploadDir);
console.log("Fresh start ready. Restart npm run dev, then upload the 3 starter PDFs.");

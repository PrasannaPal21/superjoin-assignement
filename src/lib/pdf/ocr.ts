import { createWorker, type Worker } from "tesseract.js";
import { getOcrLang } from "@/lib/config";

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker(getOcrLang(), 1, {
        // Keep logs quiet in the Next server console.
        logger: () => undefined,
      });
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * OCR a PNG/JPEG buffer with local Tesseract (no LLM tokens).
 */
export async function ocrImageBuffer(image: Buffer): Promise<string> {
  const worker = await getWorker();
  const result = await worker.recognize(image);
  return (result.data.text || "").replace(/\s+/g, " ").trim();
}

export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    // ignore shutdown errors
  } finally {
    workerPromise = null;
  }
}

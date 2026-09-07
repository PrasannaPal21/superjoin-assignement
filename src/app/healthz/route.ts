import { GET as healthGet } from "@/app/api/health/route";

export const runtime = "nodejs";

/** Alias for hosts that default the health path to /healthz (e.g. Render Next.js autofill). */
export const GET = healthGet;

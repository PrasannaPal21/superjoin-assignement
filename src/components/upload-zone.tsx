"use client";

import { useState } from "react";

type UploadResult = {
  document: { id: string; filename: string };
  deduped?: boolean;
};

export function UploadZone({
  onUploaded,
}: {
  onUploaded?: (result: UploadResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onUploaded?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        {busy ? "Uploading…" : "Add PDF"}
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void send(f);
            e.target.value = "";
          }}
        />
      </label>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

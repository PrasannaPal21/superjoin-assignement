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
  const [note, setNote] = useState<string | null>(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setNote(
        data.deduped
          ? `Already ingested: ${data.document.filename}`
          : `Queued: ${data.document.filename}`,
      );
      onUploaded?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer flex-col items-center rounded-md border border-dashed border-border px-3 py-4 text-center hover:bg-muted/60">
        <span className="text-sm font-medium">
          {busy ? "Uploading…" : "Upload PDF"}
        </span>
        <span className="mt-0.5 text-[11px] text-muted-foreground">
          or drop a file here
        </span>
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
      {error && <p className="text-xs text-destructive">{error}</p>}
      {note && !error && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

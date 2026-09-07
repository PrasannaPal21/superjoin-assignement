import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, TriangleAlert, FileText } from "lucide-react";
import { timeAgo } from "@/lib/format";

export type DocStatus = "ready" | "failed" | "processing" | "queued" | string;

const STATUS_META: Record<
  string,
  { label: string; dot: string; text: string; bg: string }
> = {
  ready: {
    label: "Ready",
    dot: "bg-ok",
    text: "text-ok",
    bg: "bg-ok-soft",
  },
  failed: {
    label: "Failed",
    dot: "bg-danger",
    text: "text-danger",
    bg: "bg-danger-soft",
  },
  processing: {
    label: "Processing",
    dot: "bg-warn",
    text: "text-warn",
    bg: "bg-warn-soft",
  },
  queued: {
    label: "Queued",
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
    bg: "bg-muted",
  },
  uploaded: {
    label: "Uploaded",
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
    bg: "bg-muted",
  },
};

export function StatusPill({
  status,
  className,
}: {
  status: DocStatus;
  className?: string;
}) {
  const meta = STATUS_META[status] ?? {
    label: status,
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
    bg: "bg-muted",
  };
  const busy = status === "processing";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        meta.bg,
        meta.text,
        className,
      )}
    >
      {busy ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span className={cn("size-1.5 rounded-full", meta.dot)} />
      )}
      {meta.label}
    </span>
  );
}

export function StatusIcon({ status }: { status: DocStatus }) {
  if (status === "ready")
    return <CheckCircle2 className="size-4 text-ok" strokeWidth={2} />;
  if (status === "failed")
    return <TriangleAlert className="size-4 text-danger" strokeWidth={2} />;
  if (status === "processing" || status === "queued")
    return <Loader2 className="size-4 animate-spin text-warn" />;
  return <FileText className="size-4 text-muted-foreground" />;
}

export function StageLine({
  stage,
  current,
  total,
  updatedAt,
}: {
  stage: string | null;
  current: number;
  total: number;
  updatedAt?: string | null;
}) {
  if (!stage) return null;
  const s = stage.toLowerCase();
  if (s.startsWith("done")) return null;
  if (s === "parsing") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-warn">
        <Loader2 className="size-3 animate-spin" /> Reading PDF…
      </span>
    );
  }
  if (s === "extracting") {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-warn">
        <Loader2 className="size-3 animate-spin" /> Extracting {current}/{total} ({pct}%)
      </span>
    );
  }
  if (s === "matching") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-warn">
        <Loader2 className="size-3 animate-spin" /> Comparing across documents…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-warn">
      <Loader2 className="size-3 animate-spin" /> {stage}
      {updatedAt ? <span className="text-muted-foreground">· {timeAgo(updatedAt)}</span> : null}
    </span>
  );
}

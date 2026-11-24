import { NextResponse } from "next/server";
import { getDocument } from "@/lib/db/documents";
import {
  listEvidenceForFact,
  listFailures,
  listFacts,
  listRelations,
} from "@/lib/db/facts";

export const runtime = "nodejs";

function enrich(factId: string) {
  const fact = listFacts().find((f) => f.id === factId);
  if (!fact) return null;
  const evidence = listEvidenceForFact(factId)[0];
  const doc = getDocument(fact.document_id);
  return {
    id: fact.id,
    claim: fact.claim,
    rawValue: fact.raw_value,
    unit: fact.unit,
    period: fact.period,
    scope: fact.scope,
    documentName: doc?.original_filename ?? null,
    evidence: evidence
      ? { page: evidence.page, quote: evidence.quote }
      : null,
  };
}

/** Prefer published relations; skip HITL-rejected pairs. */
function isDemoRelation(row: {
  review_status?: string | null;
}): boolean {
  const status = row.review_status ?? "auto_accepted";
  return status === "auto_accepted" || status === "confirmed";
}

export async function GET() {
  const relations = listRelations().filter(isDemoRelation);
  const pick = (type: string) => {
    const row = relations.find((r) => r.relation_type === type);
    if (!row) return null;
    let contextTags: string[] = [];
    try {
      contextTags = row.context_tags ? JSON.parse(row.context_tags) : [];
    } catch {
      contextTags = [];
    }
    return {
      id: row.id,
      relationType: row.relation_type,
      rationale: row.rationale,
      contextTags,
      confidence: row.confidence,
      reviewStatus: row.review_status ?? "auto_accepted",
      a: enrich(row.fact_a_id),
      b: enrich(row.fact_b_id),
    };
  };

  const failures = listFailures();
  const failure = failures[0]
    ? {
        id: failures[0].id,
        stage: failures[0].stage,
        summary: failures[0].summary,
        detail: failures[0].detail,
        suggestion: failures[0].suggestion,
      }
    : null;

  const evidenceReady = listFacts().some(
    (f) => listEvidenceForFact(f.id).length > 0,
  );

  return NextResponse.json({
    cases: {
      corroborates: pick("corroborates"),
      contradicts: pick("contradicts"),
      reconciled: pick("reconciled"),
      ask: evidenceReady
        ? {
            ready: true,
            hint: "Open Ask and query a KPI; answers must cite page + quote (or refuse).",
          }
        : null,
      failure,
    },
  });
}

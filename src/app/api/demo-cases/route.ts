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

export async function GET() {
  const relations = listRelations();
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
      a: enrich(row.fact_a_id),
      b: enrich(row.fact_b_id),
    };
  };

  const failure = listFailures()[0]
    ? {
        id: listFailures()[0].id,
        stage: listFailures()[0].stage,
        summary: listFailures()[0].summary,
        detail: listFailures()[0].detail,
        suggestion: listFailures()[0].suggestion,
      }
    : null;

  return NextResponse.json({
    cases: {
      corroborates: pick("corroborates"),
      contradicts: pick("contradicts"),
      reconciled: pick("reconciled"),
      failure,
    },
  });
}

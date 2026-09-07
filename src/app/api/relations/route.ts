import { NextRequest, NextResponse } from "next/server";
import { getDocument } from "@/lib/db/documents";
import {
  listEvidenceForFact,
  listFacts,
  listRelations,
} from "@/lib/db/facts";

export const runtime = "nodejs";

function factSummary(id: string) {
  const fact = listFacts().find((f) => f.id === id);
  if (!fact) return { id, claim: "(missing fact)" };
  const evidence = listEvidenceForFact(id)[0];
  const doc = getDocument(fact.document_id);
  return {
    id: fact.id,
    claim: fact.claim,
    rawValue: fact.raw_value,
    unit: fact.unit,
    period: fact.period,
    scope: fact.scope,
    entity: fact.entity,
    factType: fact.fact_type,
    confidence: fact.confidence,
    documentId: fact.document_id,
    documentName: doc?.original_filename ?? null,
    evidence: evidence
      ? { page: evidence.page, quote: evidence.quote }
      : null,
  };
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") || undefined;
  const relations = listRelations(type).slice(0, 300).map((r) => {
    let contextTags: string[] = [];
    try {
      contextTags = r.context_tags ? JSON.parse(r.context_tags) : [];
    } catch {
      contextTags = [];
    }
    return {
      id: r.id,
      relationType: r.relation_type,
      rationale: r.rationale,
      contextTags,
      confidence: r.confidence,
      createdAt: r.created_at,
      a: factSummary(r.fact_a_id),
      b: factSummary(r.fact_b_id),
    };
  });

  const counts = {
    corroborates: relations.filter((r) => r.relationType === "corroborates").length,
    contradicts: relations.filter((r) => r.relationType === "contradicts").length,
    reconciled: relations.filter((r) => r.relationType === "reconciled").length,
  };

  return NextResponse.json({ relations, counts });
}

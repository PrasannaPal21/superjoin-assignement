import { NextRequest, NextResponse } from "next/server";
import {
  listEvidenceForFact,
  listFacts,
  listFactTypes,
} from "@/lib/db/facts";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const documentId = req.nextUrl.searchParams.get("documentId") || undefined;
  const factType = req.nextUrl.searchParams.get("factType") || undefined;
  const q = (req.nextUrl.searchParams.get("q") || "").toLowerCase().trim();

  let facts = listFacts(documentId);
  if (factType) {
    facts = facts.filter((f) => f.fact_type === factType);
  }
  if (q) {
    facts = facts.filter(
      (f) =>
        f.claim.toLowerCase().includes(q) ||
        (f.entity || "").toLowerCase().includes(q) ||
        (f.raw_value || "").toLowerCase().includes(q),
    );
  }

  const payload = facts.slice(0, 500).map((f) => {
    const evidence = listEvidenceForFact(f.id);
    return {
      id: f.id,
      documentId: f.document_id,
      claim: f.claim,
      rawValue: f.raw_value,
      numericValue: f.numeric_value,
      unit: f.unit,
      period: f.period,
      scope: f.scope,
      entity: f.entity,
      factType: f.fact_type,
      confidence: f.confidence,
      matchKey: f.match_key,
      evidence: evidence.map((e) => ({
        id: e.id,
        page: e.page,
        quote: e.quote,
      })),
    };
  });

  return NextResponse.json({
    facts: payload,
    factTypes: listFactTypes(),
    total: payload.length,
  });
}

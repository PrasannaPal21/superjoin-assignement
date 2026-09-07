/**
 * Models sometimes wrap JSON in fences or add trailing commentary.
 * Try a few cheap repairs before giving up.
 */
export function repairJsonText(raw: string): string {
  let text = raw.trim();

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }

  // Grab outermost object if there is leading chatter
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    text = text.slice(first, last + 1);
  }

  // Remove trailing commas before } or ]
  text = text.replace(/,\s*([}\]])/g, "$1");

  return text;
}

export function parseJsonWithRepair(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const repaired = repairJsonText(raw);
    return JSON.parse(repaired);
  }
}

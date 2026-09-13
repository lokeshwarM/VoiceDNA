import { diffWords } from "diff";
import { callLLM } from "./provider";
import { addLearnedRule, getAllLearnedRules, LearnedRule } from "../db/queries";
import { getDb } from "../db";
import {
  detectStructuralChanges,
  updateVoiceDNAMetricsWithEdit,
  StructuralChange,
} from "../styleDNA/extract";
import { rebuildVoiceDNA } from "../styleDNA/corpus";
import { updateFingerprintConfidence } from "../styleDNA/fingerprint";

export interface LearnFromEditResult {
  rule: LearnedRule;
  diffSummary: string;
  structuralChanges: StructuralChange[];
  fingerprintRebuilt: boolean;
  totalEditsCount: number;
}

/**
 * Upgraded Learn Edits pipeline:
 * 1. Compares generated output vs user's manual edit.
 * 2. Detects structural changes (sentence length, clauses, transitions, punctuation, workflow).
 * 3. Updates VoiceDNA metrics in data/profile/voiceDNA.json (numbers only, never copies sentences).
 * 4. Checks deduplication: NEVER stores duplicate rules/examples.
 * 5. Rebuilds fingerprint every 20 edits.
 */
export async function learnFromManualEdits(
  originalAIOutput: string,
  userEditedText: string,
  rewriteId?: string
): Promise<LearnFromEditResult> {
  // 1. Calculate word diffs
  const changes = diffWords(originalAIOutput, userEditedText);
  const additions: string[] = [];
  const deletions: string[] = [];

  for (const part of changes) {
    if (part.added) additions.push(part.value.trim());
    if (part.removed) deletions.push(part.value.trim());
  }

  const diffSummary = `Additions: "${additions.slice(0, 4).join('", "')}" | Deletions: "${deletions.slice(0, 4).join('", "')}"`;

  // 2. Detect structural writing habit differences
  const structuralChanges = detectStructuralChanges(originalAIOutput, userEditedText);

  // 3. Update VoiceDNA metrics in data/profile/metrics.json and voiceDNA.json
  updateVoiceDNAMetricsWithEdit(userEditedText);

  // 4. Update fingerprint confidence based on structural changes
  updateFingerprintConfidence(structuralChanges);

  // 4. Extract actionable style rule
  const systemPrompt = `You are an expert computational writing coach.
The AI suggested an academic rewrite, but the researcher manually edited it to match their personal voice.
Analyze the differences between the AI output and the researcher's final version.
Extract 1 concrete, actionable stylistic rule that captures the researcher's preference so future rewrites match their voice.

Categories allowed: "vocabulary", "syntax", "brevity", "tone", "structure".

Respond STRICTLY in JSON format matching this schema:
{
  "rule_text": "Precise imperative rule describing what the researcher preferred (e.g., 'Prefer active first-person phrasing in methodology rather than passive constructions', or 'Avoid verbose signposts like In order to; prefer To')",
  "category": "vocabulary",
  "before_snippet": "Short snippet showing what the AI wrote that was modified",
  "after_snippet": "Short snippet showing the researcher's preferred version"
}`;

  const userPrompt = `ORIGINAL AI OUTPUT:
${originalAIOutput.slice(0, 2000)}

RESEARCHER'S MANUAL REVISION:
${userEditedText.slice(0, 2000)}

Identified key modifications:
Removed / Replaced: ${deletions.slice(0, 4).join(" | ")}
Inserted / Preferred: ${additions.slice(0, 4).join(" | ")}
${
  structuralChanges.length > 0
    ? `Detected Structural Changes:\n${structuralChanges.map((s) => `- ${s.dimension}: ${s.description}`).join("\n")}`
    : ""
}`;

  let ruleText = "Refine vocabulary and sentence rhythm according to manual revision";
  let category: LearnedRule["category"] = "syntax";
  let beforeSnippet = deletions[0] || null;
  let afterSnippet = additions[0] || null;

  try {
    const rawResponse = await Promise.race([
      callLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        jsonMode: true,
      }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("LLM rule extraction timed out")), 5000)
      ),
    ]);

    const parsed = JSON.parse(rawResponse);
    if (parsed.rule_text) ruleText = parsed.rule_text;
    if (parsed.category) category = parsed.category;
    if (parsed.before_snippet) beforeSnippet = parsed.before_snippet;
    if (parsed.after_snippet) afterSnippet = parsed.after_snippet;
  } catch (err: any) {
    console.warn("Could not call LLM for edit learning, falling back to heuristic rule:", err.message);
    if (structuralChanges.length > 0) {
      ruleText = structuralChanges[0].description;
      category = structuralChanges[0].dimension.toLowerCase().includes("sentence") ? "syntax" : "structure";
    } else if (deletions.length > 0 && additions.length > 0) {
      ruleText = `Prefer "${additions[0]}" instead of "${deletions[0]}"`;
      category = "vocabulary";
    }
  }

  // 5. Deduplication check: NEVER store duplicate examples or rules
  const existingRules = getAllLearnedRules();
  const duplicate = existingRules.find(
    (r) =>
      r.rule_text.trim().toLowerCase() === ruleText.trim().toLowerCase() ||
      (beforeSnippet &&
        afterSnippet &&
        r.before_snippet?.trim().toLowerCase() === beforeSnippet.trim().toLowerCase() &&
        r.after_snippet?.trim().toLowerCase() === afterSnippet.trim().toLowerCase())
  );

  let finalRule: LearnedRule;
  if (duplicate) {
    finalRule = duplicate;
  } else {
    finalRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      rewrite_id: rewriteId || null,
      rule_text: ruleText,
      category,
      before_snippet: beforeSnippet,
      after_snippet: afterSnippet,
      is_active: 1,
      created_at: new Date().toISOString(),
    };
    addLearnedRule(finalRule);
  }

  // 6. Track edits count and rebuild fingerprint every 20 edits
  const db = getDb();
  const countRow = db.prepare("SELECT value FROM app_settings WHERE key = 'manual_edits_count'").get() as
    | { value: string }
    | undefined;
  const currentCount = countRow ? parseInt(countRow.value, 10) || 0 : 0;
  const totalEditsCount = currentCount + 1;

  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('manual_edits_count', ?)").run(
    String(totalEditsCount)
  );

  // 6. Rebuild profile (metrics, fingerprint, voiceDNA) after every edit
  let fingerprintRebuilt = false;
  try {
    await rebuildVoiceDNA();
    fingerprintRebuilt = true;
  } catch (err: any) {
    console.error("Failed to auto-rebuild voiceDNA profile after edit:", err.message);
  }

  return {
    rule: finalRule,
    diffSummary,
    structuralChanges,
    fingerprintRebuilt,
    totalEditsCount,
  };
}

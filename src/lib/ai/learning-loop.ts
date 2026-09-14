import { diffWords } from "diff";
import { addLearnedRule, getAllLearnedRules, recordRuleFeedback, LearnedRule } from "../db/queries";
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

const FORMAL_TRANSITIONS = new Set([
  "consequently",
  "furthermore",
  "moreover",
  "therefore",
  "thus",
  "in addition",
  "nevertheless",
  "hence",
  "accordingly",
  "notably",
]);

/**
 * Deterministically extracts stylistic correction memory from manual edits.
 * 0 LLM CALLS — uses exact token-level diff classification.
 *
 * Stores:
 * - user rejected synonym replacement
 * - user restored original verb
 * - user restored original transition
 * - user prefers direct phrasing
 */
export function extractDeterministicCorrection(
  originalAIOutput: string,
  userEditedText: string,
  structuralChanges: StructuralChange[]
): {
  ruleText: string;
  category: LearnedRule["category"];
  beforeSnippet: string | null;
  afterSnippet: string | null;
} {
  const changes = diffWords(originalAIOutput, userEditedText);
  const deletions: string[] = [];
  const additions: string[] = [];

  for (const part of changes) {
    const trimmed = part.value.trim();
    if (!trimmed) continue;
    if (part.added) additions.push(trimmed);
    if (part.removed) deletions.push(trimmed);
  }

  // 1. Check for formal transition rejection
  for (const del of deletions) {
    const lowerDel = del.toLowerCase().replace(/[^a-z]/g, "");
    if (FORMAL_TRANSITIONS.has(lowerDel)) {
      const add = additions[0] || "direct phrasing";
      return {
        ruleText: `User rejected formal transition: restored natural connector "${add}" instead of "${del}"`,
        category: "syntax",
        beforeSnippet: del,
        afterSnippet: add,
      };
    }
  }

  // 2. Check for word/verb synonym rejection
  if (deletions.length > 0 && additions.length > 0) {
    const delWord = deletions[0].split(/\s+/)[0].replace(/[^a-zA-Z0-9]/g, "");
    const addWord = additions[0].split(/\s+/)[0].replace(/[^a-zA-Z0-9]/g, "");

    if (delWord.length > 1 && addWord.length > 1 && delWord.toLowerCase() !== addWord.toLowerCase()) {
      return {
        ruleText: `User rejected synonym replacement: prefer "${addWord}" instead of "${delWord}"`,
        category: "vocabulary",
        beforeSnippet: delWord,
        afterSnippet: addWord,
      };
    }
  }

  // 3. Check for brevity preference (user deleted verbose phrasing)
  if (deletions.length > 0 && additions.length === 0) {
    const delSnippet = deletions.slice(0, 2).join(" ");
    return {
      ruleText: `User prefers concise phrasing: eliminated verbose expression "${delSnippet}"`,
      category: "brevity",
      beforeSnippet: delSnippet,
      afterSnippet: null,
    };
  }

  // 4. Structural change fallback
  if (structuralChanges.length > 0) {
    const st = structuralChanges[0];
    return {
      ruleText: st.description,
      category: st.dimension.toLowerCase().includes("sentence") ? "syntax" : "structure",
      beforeSnippet: deletions[0] || null,
      afterSnippet: additions[0] || null,
    };
  }

  return {
    ruleText: "User refined sentence rhythm and phrasing according to personal voice",
    category: "structure",
    beforeSnippet: deletions[0] || null,
    afterSnippet: additions[0] || null,
  };
}

/**
 * Upgraded Learn Edits pipeline:
 * 1. Compares generated output vs user's manual edit deterministically.
 * 2. Detects structural changes (sentence length, clauses, transitions, punctuation, workflow).
 * 3. Updates VoiceDNA metrics in data/profile/metrics.json and voiceDNA.json.
 * 4. Checks deduplication & implements confidence accumulation:
 *    - Single edit -> provisional memory (observed_count = 1, is_active = 0, confidence = 50%)
 *    - Repeated edits -> confidence accumulates, activates when observed_count >= 2 and confidence >= 60%
 * 5. Deterministic — zero extra LLM calls.
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

  // 5. Deterministically extract correction rule
  const { ruleText, category, beforeSnippet, afterSnippet } = extractDeterministicCorrection(
    originalAIOutput,
    userEditedText,
    structuralChanges
  );

  // 6. Confidence System & Evidence Corroboration:
  // Check if this edit corroborates or contradicts an existing rule
  const existingRules = getAllLearnedRules();
  const duplicate = existingRules.find(
    (r) =>
      r.rule_text.trim().toLowerCase() === ruleText.trim().toLowerCase() ||
      (beforeSnippet &&
        afterSnippet &&
        r.before_snippet?.trim().toLowerCase() === beforeSnippet.trim().toLowerCase() &&
        r.after_snippet?.trim().toLowerCase() === afterSnippet.trim().toLowerCase())
  );

  // Check if the user reverted or rejected any previously learned rule
  for (const r of existingRules) {
    if (r.before_snippet && r.after_snippet) {
      if (
        userEditedText.toLowerCase().includes(r.before_snippet.toLowerCase()) &&
        !userEditedText.toLowerCase().includes(r.after_snippet.toLowerCase()) &&
        r.id !== duplicate?.id
      ) {
        recordRuleFeedback(r.id, false);
      }
    }
  }

  let finalRule: LearnedRule;
  if (duplicate) {
    // Corroborating evidence: increment accepted_count and observed_count
    // Activates the rule if observed_count >= 2 and confidence_pct >= 60%
    const updated = recordRuleFeedback(duplicate.id, true);
    finalRule = updated || duplicate;
  } else {
    // First observation: provisional correction memory (is_active = 0, confidence = 50%)
    finalRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      rewrite_id: rewriteId || null,
      rule_text: ruleText,
      category,
      before_snippet: beforeSnippet,
      after_snippet: afterSnippet,
      is_active: 0, // Rules with insufficient evidence (<2 observations) must not become active
      observed_count: 1,
      accepted_count: 1,
      rejected_count: 0,
      confidence_pct: 50.0,
      created_at: new Date().toISOString(),
    };
    addLearnedRule(finalRule);
  }

  // 7. Track edits count
  const db = getDb();
  const countRow = db.prepare("SELECT value FROM app_settings WHERE key = 'manual_edits_count'").get() as
    | { value: string }
    | undefined;
  const currentCount = countRow ? parseInt(countRow.value, 10) || 0 : 0;
  const totalEditsCount = currentCount + 1;

  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('manual_edits_count', ?)").run(
    String(totalEditsCount)
  );

  // 8. Rebuild profile (metrics, fingerprint, voiceDNA) after edit
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

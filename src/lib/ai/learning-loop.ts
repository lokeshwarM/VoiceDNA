import { diffWords } from "diff";
import { callLLM } from "./provider";
import { addLearnedRule, LearnedRule } from "../db/queries";

export interface LearnFromEditResult {
  rule: LearnedRule;
  diffSummary: string;
}

export async function learnFromManualEdits(
  originalAIOutput: string,
  userEditedText: string,
  rewriteId?: string
): Promise<LearnFromEditResult> {
  const changes = diffWords(originalAIOutput, userEditedText);

  // Collect additions and deletions
  const additions: string[] = [];
  const deletions: string[] = [];

  for (const part of changes) {
    if (part.added) additions.push(part.value.trim());
    if (part.removed) deletions.push(part.value.trim());
  }

  const diffSummary = `Additions: "${additions.slice(0, 5).join('", "')}" | Deletions: "${deletions.slice(0, 5).join('", "')}"`;

  // Construct prompt for LLM to identify the underlying stylistic preference
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
Inserted / Preferred: ${additions.slice(0, 4).join(" | ")}`;

  let ruleText = "Refine vocabulary and sentence rhythm according to manual revision";
  let category: LearnedRule["category"] = "syntax";
  let beforeSnippet = deletions[0] || null;
  let afterSnippet = additions[0] || null;

  try {
    const rawResponse = await callLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      jsonMode: true,
    });

    const parsed = JSON.parse(rawResponse);
    if (parsed.rule_text) ruleText = parsed.rule_text;
    if (parsed.category) category = parsed.category;
    if (parsed.before_snippet) beforeSnippet = parsed.before_snippet;
    if (parsed.after_snippet) afterSnippet = parsed.after_snippet;
  } catch (err: any) {
    console.warn("Could not call LLM for edit learning, falling back to heuristic rule:", err.message);
    if (deletions.length > 0 && additions.length > 0) {
      ruleText = `Prefer "${additions[0]}" instead of "${deletions[0]}"`;
      category = "vocabulary";
    }
  }

  const newRule: LearnedRule = {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    rewrite_id: rewriteId || null,
    rule_text: ruleText,
    category,
    before_snippet: beforeSnippet,
    after_snippet: afterSnippet,
    is_active: 1,
    created_at: new Date().toISOString(),
  };

  addLearnedRule(newRule);

  return {
    rule: newRule,
    diffSummary,
  };
}

import { callLLM } from "./provider";
import {
  getActiveVoiceProfile,
  getActiveLearnedRules,
  getAllDocuments,
  addRewriteHistory,
  RewriteRecord,
} from "../db/queries";
import {
  extractCitations,
  extractEquations,
  extractNumbers,
  verifyFidelity,
  verifyNovelty,
  FidelityReport,
  VerbatimReport,
} from "./fidelity-guard";
import { getFingerprintRules } from "../styleDNA/fingerprint";

export interface RewriteOptions {
  draftInput: string;
  sectionType: string;
  customInstructions?: string;
  title?: string;
}

export interface RewriteResult {
  id: string;
  rewrittenOutput: string;
  fidelity: FidelityReport;
  novelty: VerbatimReport;
  appliedRulesCount: number;
  profileName: string;
  created_at: string;
}

export async function executeRewrite(options: RewriteOptions): Promise<RewriteResult> {
  const { draftInput, sectionType, customInstructions, title } = options;

  if (!draftInput || draftInput.trim().length === 0) {
    throw new Error("Draft input cannot be empty.");
  }

  // 1. Gather context from SQLite & VoiceDNA Profile
  const profile = getActiveVoiceProfile();
  const learnedRules = getActiveLearnedRules();
  const allDocs = getAllDocuments();
  const corpusTexts = allDocs.map((d) => d.raw_text);

  // 2. Load VoiceDNA Profile and Fingerprint Rules
  const fingerprintRules = getFingerprintRules();
  let fingerprintRulesPrompt = "";
  if (fingerprintRules.length > 0) {
    fingerprintRulesPrompt = `\n### VOICEDNA FINGERPRINT RULES (APPLY THESE MEASURABLE WRITING HABITS):
${fingerprintRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
  }

  // 3. Pre-extract invariance entities to inject into system prompt
  const citations = extractCitations(draftInput);
  const equations = extractEquations(draftInput);
  const numbers = extractNumbers(draftInput);

  // 4. Build Learned Rules section
  let learnedRulesPrompt = "";
  if (learnedRules.length > 0) {
    learnedRulesPrompt = `\n### USER'S LEARNED STYLE PREFERENCES (FROM PREVIOUS MANUAL EDITS - PRIORITIZE THESE):
${learnedRules.map((r, i) => `${i + 1}. [${r.category.toUpperCase()}] ${r.rule_text}`).join("\n")}`;
  }

  // 5. Build Guardrails for citations, numbers, and equations
  let invariancePrompt = `\n### STRICT PRESERVATION DIRECTIVES:
- TECHNICAL ACCURACY: Do not introduce unstated assumptions or alter factual claims.
- CITATIONS: You MUST preserve all citations verbatim in their original format. Do not renumber or change brackets/parentheses.
${citations.length > 0 ? `  Required Citations: ${citations.join(", ")}` : "  (No specific citations detected in input)"}
- NUMBERS & MEASUREMENTS: You MUST retain every exact numerical figure, percentage, sample size, unit, and p-value.
${numbers.length > 0 ? `  Required Figures: ${numbers.join(", ")}` : "  (No specific numbers detected in input)"}
- MATHEMATICS & EQUATIONS: Preserve all LaTeX expressions, formulas, and symbols ($...$, $$...$$) without alteration.
${equations.length > 0 ? `  Required Equations: ${equations.join(" | ")}` : "  (No equations detected in input)"}`;

  // 6. Build Synthesized Voice Guidelines
  const voiceGuidelines = profile?.synthesized_guidelines || "Maintain standard formal academic voice with analytical precision.";

  const systemPrompt = `You are "VoiceDNA", an expert academic writing assistant calibrated to write in the researcher's distinct academic voice.

Your primary mission:
1. Transform the researcher's draft notes or bullet points into a polished, publication-ready academic text for the section: "${sectionType}".
2. Adopt the researcher's exact syntactic rhythm, vocabulary complexity, transitional connectors, and scholarly tone.
3. NEVER copy sentences or phrasing verbatim from any training materials. Synthesize fresh language.
4. STRICT INVARIANCE: Every single citation, number, measurement, and equation MUST be preserved with 100% fidelity.

${invariancePrompt}

${fingerprintRulesPrompt}

### RESEARCHER'S VOICE DNA PROFILE:
${voiceGuidelines}
${learnedRulesPrompt}

OUTPUT DIRECTIVE:
Return ONLY the final rewritten text. Do NOT include conversational greetings, introductions (e.g. "Here is your rewrite:"), explanations, commentary, or fingerprint JSON. Output only the pure rewritten text.`;

  let userPrompt = `DRAFT INPUT TO REWRITE (${sectionType}):
${draftInput}`;

  if (customInstructions && customInstructions.trim()) {
    userPrompt += `\n\nADDITIONAL USER INSTRUCTION:\n${customInstructions.trim()}`;
  }

  // 7. Call Ollama / LLM Provider
  const rewrittenOutput = await callLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.35,
  });

  const cleanOutput = rewrittenOutput.trim();

  // 7. Verify Fidelity & Novelty
  const fidelity = verifyFidelity(draftInput, cleanOutput);
  const novelty = verifyNovelty(cleanOutput, corpusTexts);

  // 8. Record in rewrite history
  const recordId = `rewrite-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record: RewriteRecord = {
    id: recordId,
    title: title || `${sectionType} Rewrite`,
    section_type: sectionType,
    draft_input: draftInput,
    rewritten_output: cleanOutput,
    user_final_text: null,
    fidelity_data: fidelity,
    verbatim_check: novelty,
    created_at: new Date().toISOString(),
  };

  addRewriteHistory(record);

  return {
    id: recordId,
    rewrittenOutput: cleanOutput,
    fidelity,
    novelty,
    appliedRulesCount: learnedRules.length,
    profileName: profile?.name || "Academic Voice",
    created_at: record.created_at,
  };
}

import { callLLMStream } from "./provider";
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
  extractLists,
  verifyFidelity,
  verifyNovelty,
  FidelityReport,
  VerbatimReport,
} from "./fidelity-guard";
import { computeVoiceMatch, VoiceMatchReport } from "./voice-match";
import { loadMetrics } from "../styleDNA/extract";
import { loadFingerprint, getFingerprintRules } from "../styleDNA/fingerprint";

export type RewriteMode = "preserve" | "academic_polish" | "strong_voicedna";

export interface LexicalSubstitution {
  original: string;
  replacement: string;
}

export interface RewriteValidationReport {
  wordsChanged: number;
  totalInputWords: number;
  totalOutputWords: number;
  wordsChangedPct: number;
  sentencesPreserved: number;
  totalInputSentences: number;
  totalOutputSentences: number;
  structuralEdits: string[];
  lexicalSubstitutions: LexicalSubstitution[];
  vocabularyChanges: string[];
  grammarChanges: string[];
  inputVoiceMatch: VoiceMatchReport;
  outputVoiceMatch: VoiceMatchReport;
  voiceMatchDelta: number;
  mode: RewriteMode;
  preservationGoalMet: boolean;
  selectedCandidateReason: string;
}

export interface RewriteTimings {
  profileLoadingMs: number;
  promptConstructionMs: number;
  timeToFirstTokenMs: number;
  totalGenerationMs: number;
  sanitizationMs: number;
  fidelityCheckMs: number;
  voiceMatchMs: number;
  totalRewriteMs: number;
  ollamaRequestsCount: number;
}

export interface RewriteOptions {
  draftInput: string;
  sectionType: string;
  customInstructions?: string;
  title?: string;
  mode?: RewriteMode;
  onToken?: (token: string) => void;
}

export interface RewriteResult {
  id: string;
  rewrittenOutput: string;
  fidelity: FidelityReport;
  novelty: VerbatimReport;
  voiceMatch: VoiceMatchReport;
  validation: RewriteValidationReport;
  mode: RewriteMode;
  appliedRulesCount: number;
  profileName: string;
  created_at: string;
  timings: RewriteTimings;
}

/**
 * Forbidden Generic AI & Academic Clichés:
 * Generic filler phrases that standardize or inflate the author's natural voice.
 * Strictly forbidden in prompt instructions and cleansed deterministically.
 */
export const FORBIDDEN_ACADEMIC_CLICHES: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\btransformative paradigm\b/gi, replacement: "approach" },
  { pattern: /\bunprecedented\b/gi, replacement: "notable" },
  { pattern: /\barchitectural foundation\b/gi, replacement: "architecture" },
  { pattern: /\brobust framework\b/gi, replacement: "framework" },
  { pattern: /\bcomprehensive framework\b/gi, replacement: "framework" },
  { pattern: /\brigorous framework\b/gi, replacement: "framework" },
  { pattern: /\bcritical challenge\b/gi, replacement: "problem" },
  { pattern: /\bensuring operational continuity\b/gi, replacement: "maintaining continuity" },
  { pattern: /\bpivotal role\b/gi, replacement: "role" },
  { pattern: /\bplays a crucial role\b/gi, replacement: "is important" },
  { pattern: /\bplays a pivotal role\b/gi, replacement: "is important" },
  { pattern: /\bdelve into\b/gi, replacement: "examine" },
  { pattern: /\btestament to\b/gi, replacement: "evidence of" },
  { pattern: /\btapestry of\b/gi, replacement: "series of" },
  { pattern: /\bharnessing the power of\b/gi, replacement: "using" },
  { pattern: /\bgroundbreaking\b/gi, replacement: "effective" },
  { pattern: /\bcutting-edge\b/gi, replacement: "modern" },
  { pattern: /\bstate-of-the-art\b/gi, replacement: "current" },
  { pattern: /\bnotable advancement\b/gi, replacement: "improvement" },
  { pattern: /\bsignificantly enhances\b/gi, replacement: "improves" },
  { pattern: /\beffectively addresses\b/gi, replacement: "solves" },
  { pattern: /\bseamless integration\b/gi, replacement: "integration" },
  { pattern: /\bsophisticated mechanism\b/gi, replacement: "method" },
  { pattern: /\bmultifaceted\b/gi, replacement: "complex" },
  { pattern: /\bbeacon of\b/gi, replacement: "guide for" },
  { pattern: /\bcornerstone\b/gi, replacement: "foundation" },
];

/**
 * Sanitizes forbidden generic academic clichés and cleanses raw LLM output.
 */
export function sanitizeForbiddenAcademicPhrases(text: string): {
  cleanText: string;
  strippedCount: number;
  detectedPhrases: string[];
} {
  let cleanText = text;
  let strippedCount = 0;
  const detectedPhrases: string[] = [];

  for (const { pattern, replacement } of FORBIDDEN_ACADEMIC_CLICHES) {
    if (pattern.test(cleanText)) {
      detectedPhrases.push(pattern.source.replace(/\\b/g, ""));
      cleanText = cleanText.replace(pattern, replacement);
      strippedCount++;
    }
  }

  // Remove grand introductory fluff if model generated it
  cleanText = cleanText
    .replace(/^The architectural foundation of this system is anchored by\s+/i, "The core of ")
    .replace(/^At its architectural foundation,\s+/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { cleanText, strippedCount, detectedPhrases };
}

/**
 * Cleans markdown wrappers, meta conversational responses, and forbidden clichés.
 */
export function cleanAndSanitizeOutput(raw: string): string {
  let clean = raw.trim();

  // Strip ```markdown or ``` fences
  const codeBlockMatch = clean.match(/^```(?:markdown)?\s*\n([\s\S]*?)\n```$/i);
  if (codeBlockMatch) {
    clean = codeBlockMatch[1].trim();
  }

  // Strip conversational intros
  clean = clean
    .replace(/^(?:Here (?:is|are) (?:the|your)?\s*(?:rewritten|revised|re-written)?\s*(?:text|version|academic rewrite|paper|draft)?:?\s*\n+)/i, "")
    .replace(/^(?:Rewritten (?:version|text|draft)?:?\s*\n+)/i, "")
    .replace(/^(?:Revised (?:version|text|draft)?:?\s*\n+)/i, "")
    .trim();

  // Strip forbidden clichés
  const { cleanText } = sanitizeForbiddenAcademicPhrases(clean);
  return cleanText;
}

/**
 * Computes deterministic rewrite validation report comparing draft input against output.
 * Tracks words changed %, exact vocabulary substitutions, grammar fixes, and Voice Match delta.
 */
export function computeRewriteValidation(
  draftInput: string,
  rewrittenOutput: string,
  mode: RewriteMode,
  inputVoiceMatch: VoiceMatchReport,
  outputVoiceMatch: VoiceMatchReport,
  selectedReason: string = ""
): RewriteValidationReport {
  const inputWords = draftInput.trim().split(/\s+/).filter(Boolean);
  const outputWords = rewrittenOutput.trim().split(/\s+/).filter(Boolean);

  const inputWordMap = new Map<string, number>();
  for (const w of inputWords) {
    const clean = w.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (clean) inputWordMap.set(clean, (inputWordMap.get(clean) || 0) + 1);
  }

  let wordsChanged = 0;
  const lexicalSubstitutions: LexicalSubstitution[] = [];
  const vocabularyChanges: string[] = [];
  const grammarChanges: string[] = [];
  const minLen = Math.min(inputWords.length, outputWords.length);

  for (let i = 0; i < minLen; i++) {
    const inW = inputWords[i].replace(/[.,;:!?()"']/g, "");
    const outW = outputWords[i].replace(/[.,;:!?()"']/g, "");
    if (inW.toLowerCase() !== outW.toLowerCase() && inW.length > 1 && outW.length > 1) {
      if (lexicalSubstitutions.length < 15) {
        lexicalSubstitutions.push({ original: inW, replacement: outW });
      }
      vocabularyChanges.push(`"${inW}" -> "${outW}"`);
    } else if (inputWords[i] !== outputWords[i]) {
      grammarChanges.push(`Punctuation/casing edit: "${inputWords[i]}" -> "${outputWords[i]}"`);
    }
  }

  for (const w of outputWords) {
    const clean = w.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!clean) continue;
    const count = inputWordMap.get(clean) || 0;
    if (count > 0) {
      inputWordMap.set(clean, count - 1);
    } else {
      wordsChanged++;
    }
  }

  const wordsChangedPct = inputWords.length > 0
    ? Math.min(100, Math.round((wordsChanged / inputWords.length) * 1000) / 10)
    : 0;

  const inputSentences = draftInput.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 0);
  const outputSentences = rewrittenOutput.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 0);

  let sentencesPreserved = 0;
  for (const inS of inputSentences) {
    const inKey = inS.slice(0, 20).toLowerCase();
    if (outputSentences.some((outS) => outS.toLowerCase().includes(inKey))) {
      sentencesPreserved++;
    }
  }

  const structuralEdits: string[] = [];
  if (wordsChangedPct === 0) {
    structuralEdits.push("Original wording 100% preserved (0% words changed)");
  } else if (wordsChangedPct < 5) {
    structuralEdits.push("Minimal grammatical refinement applied (<5% words changed)");
  } else {
    structuralEdits.push(`${wordsChangedPct}% words changed`);
  }

  const inputLists = extractLists(draftInput);
  const outputLists = extractLists(rewrittenOutput);
  if (inputLists.length > 0) {
    structuralEdits.push(`Preserved list structure (${outputLists.length}/${inputLists.length} items intact)`);
  }

  const inputCitations = extractCitations(draftInput);
  if (inputCitations.length > 0) {
    structuralEdits.push(`Preserved ${inputCitations.length} citation markers`);
  }

  const voiceMatchDelta = Math.round((outputVoiceMatch.overallScore - inputVoiceMatch.overallScore) * 10) / 10;
  const preservationGoalMet = mode === "preserve" ? wordsChangedPct <= 10.0 : true;

  return {
    wordsChanged,
    totalInputWords: inputWords.length,
    totalOutputWords: outputWords.length,
    wordsChangedPct,
    sentencesPreserved,
    totalInputSentences: inputSentences.length,
    totalOutputSentences: outputSentences.length,
    structuralEdits,
    lexicalSubstitutions,
    vocabularyChanges,
    grammarChanges,
    inputVoiceMatch,
    outputVoiceMatch,
    voiceMatchDelta,
    mode,
    preservationGoalMet,
    selectedCandidateReason: selectedReason,
  };
}

/**
 * Executes a single-pass Personal Voice Preservation rewrite.
 * Core Product Equation:
 * MY ORIGINAL VOICE + GRAMMAR CORRECTION + NECESSARY CLARITY/READABILITY CORRECTION = FINAL OUTPUT
 */
export async function executeRewrite(options: RewriteOptions): Promise<RewriteResult> {
  const totalRewriteStart = Date.now();
  const { draftInput, sectionType, customInstructions, title, mode = "preserve", onToken } = options;

  if (!draftInput || draftInput.trim().length === 0) {
    throw new Error("Draft input cannot be empty.");
  }

  // 1. Gather context from SQLite & Corpus
  const profileLoadStart = Date.now();
  const profile = getActiveVoiceProfile();
  const learnedRules = getActiveLearnedRules();
  const allDocs = getAllDocuments();
  const corpusTexts = allDocs.map((d) => d.raw_text);

  // 2. Load deterministic metrics and qualitative fingerprint
  const metrics = loadMetrics();
  const fingerprint = loadFingerprint();
  const profileLoadingMs = Date.now() - profileLoadStart;

  // 3. Construct Prompts & Invariance Directives
  const promptConstructionStart = Date.now();

  const citations = extractCitations(draftInput);
  const equations = extractEquations(draftInput);
  const numbers = extractNumbers(draftInput);
  const lists = extractLists(draftInput);

  let learnedRulesPrompt = "";
  if (learnedRules.length > 0) {
    learnedRulesPrompt = `\n### USER'S LEARNED STYLE PREFERENCES (FROM PREVIOUS MANUAL EDITS):
${learnedRules.map((r, i) => `${i + 1}. [${r.category.toUpperCase()}] ${r.rule_text}`).join("\n")}`;
  }

  const invariancePrompt = `### STRICT PRESERVATION OF FACTUAL & STRUCTURAL INVARIANTS:
- MEANING & FACTUAL INTEGRITY: Preserve the author's exact technical claims, parameters, and relationships with 100% fidelity.
- CITATIONS: You MUST preserve all citations verbatim in their original format (${citations.length > 0 ? citations.join(", ") : "e.g. [1]"}). Do not renumber or alter.
- MATHEMATICS & EQUATIONS: Preserve all LaTeX expressions, formulas, and symbols ($...$, $$...$$) without alteration (${equations.length > 0 ? equations.join(" | ") : "none detected"}).
- NUMBERS & MEASUREMENTS: Retain every exact numerical figure, percentage, sample size, unit, and value (${numbers.length > 0 ? numbers.join(", ") : "none detected"}).
- LISTS & ENUMERATIONS: Preserve structured bullet points or numbered lists without flattening.`;

  // Mode Specific Directive
  let modeSpecificPrompt = "";
  if (mode === "preserve") {
    modeSpecificPrompt = `### REWRITE MODE: PRESERVE (CORE RULE: MINIMAL EDIT & STRICT IDENTITY PRESERVATION)
- PERFORM THE SMALLEST POSSIBLE EDIT.
- If the input is already grammatically acceptable and understandable: KEEP IT VERBATIM (OUTPUT ≈ INPUT).
- Do NOT rewrite or touch sentences that are already clear.
- Do NOT expand abbreviations unless strictly needed to resolve ambiguity.
- Example 1:
  * Input: "The core of ACO establishes the initial delivery paths."
  * Output: "The core of ACO establishes the initial delivery paths."
  * (DO NOT rewrite as "The architectural foundation establishes..." - KEEP THE AUTHOR'S WORDS!)
- Example 2:
  * Input: "A dual-layer TrajectoryLSTM recurrent neural network for dead-reckoning of 3-D flight dynamics in GPS-absent environments."
  * Output: "We use a dual-layer TrajectoryLSTM recurrent neural network for dead-reckoning of 3-D flight dynamics in GPS-absent environments."
  * (Fix incomplete fragments with the smallest possible addition; do NOT rewrite the whole sentence.)`;
  } else if (mode === "academic_polish") {
    modeSpecificPrompt = `### REWRITE MODE: ACADEMIC POLISH
- Focus purely on mechanical grammar, punctuation, and clause flow.
- STRICTLY RETAIN the author's original vocabulary, phrasing, and reasoning order.
- Do NOT replace natural words with elevated scholarly synonyms.`;
  } else {
    modeSpecificPrompt = `### REWRITE MODE: STRONG VOICEDNA
- Align the output strictly to the author's natural explanation progression and rhythm.
- Do NOT introduce generic LLM academic fluff.`;
  }

  // Layer Directives: Layer A = Thinking flow; Layer B = Safety boundary filter only
  let layersPrompt = "";
  if (fingerprint && (fingerprint as any).merged_directives) {
    const fp = fingerprint as any;
    layersPrompt = `### AUTHOR'S PERSONAL COGNITION STYLE (LAYER A - PRESERVE THIS THINKING STYLE):
- How the author introduces ideas: ${fp.layerA_personal_thinking?.sentence_framing || "Direct baseline setup"}
- How the author clarifies mechanisms: ${fp.layerA_personal_thinking?.clarification_loops || "Concise grounding"}
- How the author expands arguments: ${fp.layerA_personal_thinking?.thought_expansion || "Methodical step-by-step logic"}
- Explanation Order: ${fp.merged_directives?.explanation_order || "Sequential procedural progression"}

### ACADEMIC PROFILE (LAYER B - FILTER ONLY, NOT A STYLE TARGET):
- The Academic Profile is ONLY a safety boundary to filter out chat slang, texting abbreviations ("u", "idk"), profanity, or purely casual conversational filler.
- The Academic Profile MUST NOT be used to replace natural vocabulary, force formal synonyms, or lengthen sentences.`;
  }

  const voiceGuidelines = profile?.synthesized_guidelines || "Preserve the author's direct, analytical personal voice.";

  const systemPrompt = `You are "VoiceDNA", a specialized personal writing preservation engine.

CORE PRODUCT REQUIREMENT:
DO NOT "improve", elevate, or standardize the author's writing into standard academic English or journal boilerplate.
The author explicitly REJECTS:
- standard academic vocabulary or elevated synonyms
- scholarly vocabulary or formal synonyms
- generic polished prose or "better-sounding" academic language
- longer sentences or artificially complex sentences
- more formal transitions forced into every paragraph
- generic LLM phrasing
- IEEE template language, journal boilerplate, textbook prose, ChatGPT academic prose, or Grammarly-style rewriting.

THE OUTPUT MUST SOUND LIKE THE AUTHOR.
The author's unusual but understandable sentence construction is an essential part of their personal voice. Do NOT remove or standardize it merely because another construction is more conventional.

THE CORE TRANSFORMATION FORMULA:
AUTHOR'S ORIGINAL VOICE + GRAMMAR CORRECTION + NECESSARY CLARITY/READABILITY CORRECTION = FINAL OUTPUT.
The output must make a reader think: "This sounds like the exact same person wrote both versions," NOT "This sounds like a professionally polished academic AI rewrite."

CORE PRIORITY ORDER (FOLLOW STRICTLY):
1. Preserve the author's original wording.
2. Preserve the author's vocabulary.
3. Preserve the author's sentence framing (the way sentences open, anchor, and stage thoughts).
4. Preserve the author's reasoning order (step-by-step logic and sequence of assertions).
5. Preserve the author's paragraph structure.
6. Preserve the author's natural rhythm.
7. Correct grammar.
8. Correct punctuation.
9. Correct obvious sentence fragments only when necessary.
10. Fix unclear wording only when the original wording is genuinely grammatically or logically unclear.
NOTHING above should ever be used as an excuse to replace natural vocabulary.

VOCABULARY PRESERVATION MANDATE (CRITICAL - DO NOT VIOLATE):
Do NOT replace words simply because another word sounds more academic or formal:
- If the author writes "shows" -> KEEP "shows" (do NOT change to "demonstrates")
- If the author writes "uses" -> KEEP "uses" (do NOT change to "utilizes")
- If the author writes "helps" -> KEEP "helps" (do NOT change to "facilitates")
- If the author writes "important" -> KEEP "important" (do NOT change to "significant")
- If the author writes "problem" -> KEEP "problem" (do NOT change to "challenge")
- If the author writes "method" -> KEEP "method" (do NOT change to "framework")
- If the author writes "good" -> KEEP "good" (do NOT change to "effective")
Only change vocabulary when:
1. The original word is grammatically incorrect,
2. The word creates a factual ambiguity,
3. The word is clearly being used incorrectly,
4. Or changing it is strictly necessary to preserve technical meaning.
OTHERWISE, KEEP THE AUTHOR'S EXACT WORD.

MINIMAL-EDIT RULE:
Before changing any sentence, ask: "Is this change strictly necessary for grammar, clarity, or factual correctness?"
If the answer is NO: KEEP THE ORIGINAL SENTENCE AS-IS.
If the input is already grammatically sound and understandable:
OUTPUT ≈ INPUT. Make only minimal or zero edits.

FORBIDDEN GENERIC AI PHRASES (NEVER USE THESE OR SYNONYMS THEREOF):
Do NOT introduce: "transformative paradigm", "unprecedented", "pivotal role", "robust framework", "critical challenge", "architectural foundation", "comprehensive framework", "cutting-edge", "notable advancement", "plays a crucial role", "significantly enhances", "effectively addresses", "seamless integration", "sophisticated mechanism", "rigorous framework", "multifaceted", "state-of-the-art", "delve into", "testament to", "tapestry of", "harnessing the power of".

${modeSpecificPrompt}

${invariancePrompt}

${layersPrompt}

### AUTHOR'S PERSONAL GUIDELINES:
${voiceGuidelines}
${learnedRulesPrompt}

OUTPUT DIRECTIVE:
Return ONLY the final text for the section: "${sectionType}".
- Do NOT output conversational framing, greetings, or explanations.
- Output pure revised text only.`;

  let userPrompt = `DRAFT INPUT TO REWRITE (${sectionType}):
${draftInput}`;

  if (customInstructions && customInstructions.trim()) {
    userPrompt += `\n\nADDITIONAL USER INSTRUCTION:\n${customInstructions.trim()}`;
  }

  // Measure Baseline Input Voice Match (deterministic)
  const inputVoiceMatch = computeVoiceMatch(draftInput, metrics);

  // Configure reasonable num_predict based on input word count
  const inputWordsCount = draftInput.trim().split(/\s+/).filter(Boolean).length;
  const numPredict = Math.min(1024, Math.max(300, Math.ceil(inputWordsCount * 1.5)));

  const promptConstructionMs = Date.now() - promptConstructionStart;

  // 4. Exactly ONE Ollama Streaming Generation
  // In Preserve Mode, use very low temperature (0.05) to enforce minimal-edit discipline
  const generationTemp = mode === "preserve" ? 0.05 : 0.20;
  const streamResult = await callLLMStream({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: generationTemp,
    maxTokens: numPredict,
    onToken,
  });

  const timeToFirstTokenMs = streamResult.timing.timeToFirstTokenMs;
  const totalGenerationMs = streamResult.timing.totalGenerationMs;

  // 5. Sanitize Output
  const sanitizationStart = Date.now();
  const cleanOutput = cleanAndSanitizeOutput(streamResult.content);
  const sanitizationMs = Date.now() - sanitizationStart;

  // 6. Deterministic Fidelity Validation (0 LLM CALLS)
  const fidelityStart = Date.now();
  const fidelity = verifyFidelity(draftInput, cleanOutput);
  const fidelityCheckMs = Date.now() - fidelityStart;

  // 7. Deterministic Voice Match (0 LLM CALLS)
  const voiceMatchStart = Date.now();
  const outputVoiceMatch = computeVoiceMatch(cleanOutput, metrics);
  const voiceMatchMs = Date.now() - voiceMatchStart;

  // 8. Deterministic Validation Report & Novelty Check (0 LLM CALLS)
  const validation = computeRewriteValidation(
    draftInput,
    cleanOutput,
    mode,
    inputVoiceMatch,
    outputVoiceMatch,
    "Personal Voice Preservation (Minimal-Edit Rule)"
  );
  const novelty = verifyNovelty(cleanOutput, corpusTexts);

  // 9. Record in SQLite History
  const recordId = `rewrite-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record: RewriteRecord = {
    id: recordId,
    title: title || `${sectionType} Rewrite (${mode})`,
    section_type: sectionType,
    draft_input: draftInput,
    rewritten_output: cleanOutput,
    user_final_text: null,
    fidelity_data: {
      ...fidelity,
      voiceMatch: outputVoiceMatch,
      validation,
    },
    verbatim_check: novelty,
    mode,
    created_at: new Date().toISOString(),
  };

  addRewriteHistory(record);

  const totalRewriteMs = Date.now() - totalRewriteStart;

  const timings: RewriteTimings = {
    profileLoadingMs,
    promptConstructionMs,
    timeToFirstTokenMs,
    totalGenerationMs,
    sanitizationMs,
    fidelityCheckMs,
    voiceMatchMs,
    totalRewriteMs,
    ollamaRequestsCount: 1,
  };

  // Performance Log
  console.log(`\n[VoiceDNA Performance]
Profile Loading:      ${profileLoadingMs} ms
Prompt Construction:  ${promptConstructionMs} ms
Time to First Token:  ${timeToFirstTokenMs} ms
Ollama Generation:    ${totalGenerationMs} ms
Sanitization:         ${sanitizationMs} ms
Fidelity:             ${fidelityCheckMs} ms
Voice Match:          ${voiceMatchMs} ms
Total Rewrite:        ${totalRewriteMs} ms
Ollama requests for this rewrite: 1
Words Changed:        ${validation.wordsChanged} (${validation.wordsChangedPct}%)\n`);

  return {
    id: recordId,
    rewrittenOutput: cleanOutput,
    fidelity,
    novelty,
    voiceMatch: outputVoiceMatch,
    validation,
    mode,
    appliedRulesCount: learnedRules.length,
    profileName: profile?.name || "Personal Voice",
    created_at: record.created_at,
    timings,
  };
}

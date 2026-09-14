import { callLLMStream } from "./provider";
import {
  getActiveVoiceProfile,
  getActiveLearnedRules,
  getPersonalDocuments,
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
import { loadMetrics, loadLexicalFingerprint, loadStructuralFingerprint } from "../styleDNA/extract";
import { loadFingerprint } from "../styleDNA/fingerprint";
import {
  extractSemanticEnvelope,
  verifyProtectedTokens,
  ProtectedTokenMap,
} from "./meaning-extractor";
import {
  validateVoiceTransfer,
  VoiceValidationReport,
} from "./voice-validator";

export type RewriteMode =
  | "exact_voice"
  | "light_cleanup"
  | "rewrite"
  | "preserve"
  | "academic_polish"
  | "strong_voicedna";

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
  voiceValidation?: VoiceValidationReport;
  protectedTokensRate?: number;
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
  voiceValidation: VoiceValidationReport;
  mode: RewriteMode;
  appliedRulesCount: number;
  profileName: string;
  created_at: string;
  timings: RewriteTimings;
  truncated?: boolean;
  truncationReason?: string;
  generatedTokens?: number;
  maxTokens?: number;
  truncationMessage?: string;
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

export interface TruncationDetectionResult {
  isTruncated: boolean;
  reason?: string;
  generatedTokens?: number;
  maxTokens?: number;
  message?: string;
}

/**
 * Detects whether the generated rewrite output was truncated.
 */
export function detectTruncation(params: {
  content: string;
  doneReason?: string;
  evalCount?: number;
  maxTokens?: number;
}): TruncationDetectionResult {
  const { content, doneReason, evalCount, maxTokens } = params;
  const trimmed = content.trim();

  if (!trimmed) {
    return {
      isTruncated: false,
      generatedTokens: evalCount,
      maxTokens,
    };
  }

  const reachedTokenLimit =
    doneReason === "length" ||
    (typeof evalCount === "number" && typeof maxTokens === "number" && evalCount >= maxTokens);

  const nonCompleteStopReason =
    typeof doneReason === "string" && doneReason.length > 0 && doneReason !== "stop";

  const endsWithTerminalPunctuation = /[.!?]["'’”)\]}`*_~]*$/.test(trimmed);
  const endsAbruptly = !endsWithTerminalPunctuation;

  if (reachedTokenLimit || nonCompleteStopReason || endsAbruptly) {
    const reasons: string[] = [];
    if (reachedTokenLimit) {
      reasons.push(`Token limit reached (${evalCount ?? "?"}/${maxTokens ?? "?"})`);
    }
    if (nonCompleteStopReason && doneReason !== "length") {
      reasons.push(`Non-complete stop reason: "${doneReason}"`);
    }
    if (endsAbruptly) {
      reasons.push("Output ends abruptly mid-sentence without terminal punctuation");
    }

    const tokenMsg = typeof evalCount === "number" ? ` (Generated: ${evalCount} tokens)` : "";
    const displayMessage = `Output truncated — increase generation limit and retry${tokenMsg}`;

    return {
      isTruncated: true,
      reason: reasons.join("; "),
      generatedTokens: evalCount,
      maxTokens,
      message: displayMessage,
    };
  }

  return {
    isTruncated: false,
    generatedTokens: evalCount,
    maxTokens,
  };
}

/**
 * Normalizes user-facing rewrite modes to the canonical 3 modes:
 * "exact_voice" (default) | "light_cleanup" | "rewrite"
 */
export function normalizeRewriteMode(mode?: string): "exact_voice" | "light_cleanup" | "rewrite" {
  if (!mode) return "exact_voice";
  if (mode === "preserve" || mode === "strong_voicedna" || mode === "exact_voice") return "exact_voice";
  if (mode === "academic_polish" || mode === "light_cleanup") return "light_cleanup";
  if (mode === "rewrite") return "rewrite";
  return "exact_voice";
}

/**
 * Builds the constrained copy-editor system prompt for the Author-Style Compiler.
 */
export function buildAuthorCompilerPrompt(params: {
  mode: "exact_voice" | "light_cleanup" | "rewrite";
  lexicalFingerprint: ReturnType<typeof loadLexicalFingerprint>;
  structuralFingerprint: ReturnType<typeof loadStructuralFingerprint>;
  semanticEnvelope: ReturnType<typeof extractSemanticEnvelope>;
  learnedRulesPrompt: string;
  sectionType: string;
}): string {
  const { mode, lexicalFingerprint, structuralFingerprint, semanticEnvelope, learnedRulesPrompt, sectionType } = params;

  const protectedTokens = semanticEnvelope.protectedTokens;
  const protectedList = protectedTokens.acronyms
    .concat(protectedTokens.technicalTerms)
    .concat(protectedTokens.numbersAndUnits)
    .concat(protectedTokens.citations)
    .concat(protectedTokens.equations);

  const softConstraints = lexicalFingerprint?.softLexicalConstraints || [
    "Prefer natural verbs (show, use, keep, help) over inflated academic equivalents (demonstrate, utilize, preserve, facilitate).",
    "Use natural connectors (and, but, also, then, so). Never force formal transitions like Consequently, Furthermore, Therefore.",
    "Do not elevate nouns: keep 'problem', 'method', 'part', 'result'.",
    "Avoid vocabulary normalization.",
  ];

  const structuralBoundaries = structuralFingerprint?.structuralConstraints || [
    "Do not drift excessively away from author's natural sentence rhythm (~37 words/sentence).",
    "Allow sentences to develop across natural clause boundaries without forced complexity.",
    "Ground mechanisms using clarification markers ('for example', 'that is', 'specifically').",
  ];

  let modeDirective = "";
  if (mode === "exact_voice") {
    modeDirective = `### REWRITE MODE: EXACT VOICE (DEFAULT)
- You are a CONSTRAINED COPY EDITOR for this specific author — not a ghostwriter.
- Reconstruct the wording using the author's lexical and structural fingerprint.
- DO NOT use generic academic language or ChatGPT-style prose.
- Preserve 100% of the meaning and all protected tokens.
- Correct grammar and punctuation.
- Vocabulary must resemble the author's corpus — NOT inflated academic prose.`;
  } else if (mode === "light_cleanup") {
    modeDirective = `### REWRITE MODE: LIGHT CLEANUP
- Focus on mechanical grammar, punctuation, and clause flow.
- Perform the smallest edit necessary to fix grammatical issues.
- Do NOT rewrite or touch sentences that are already grammatically sound.
- Strictly avoid vocabulary inflation or word replacement.`;
  } else {
    modeDirective = `### REWRITE MODE: REWRITE (BROADER RESTRUCTURING)
- Restructure sentences for optimal clarity while strictly preserving the author's personal voice and vocabulary preferences.
- Preserve all facts, figures, and protected tokens with 100% fidelity.`;
  }

  return `You are "VoiceDNA", an Author-Style Compiler and constrained copy editor.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE ARCHITECTURE & PRODUCT PHILOSOPHY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. PERSONAL CORPUS = STYLE SOURCE.
   The author's writing style is defined entirely by their corpus. You are editing to match THIS specific author.
2. INPUT TEXT = MEANING SOURCE ONLY.
   The input supplies facts, numbers, technical entities, equations, citations, and logical relations.
   The input's wording is NOT the style authority.
3. ACADEMIC LAYER = SAFETY FILTER ONLY.
   The academic layer is ONLY a negative boundary: block texting abbreviations, slang, profanity, and chat shorthand.
   It must NEVER become a style target. NEVER force elevated vocabulary, formal connectors, or IEEE boilerplate.

${modeDirective}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROTECTED TOKEN MAP — MUST SURVIVE 100% UNCHANGED:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The following tokens must appear in the final output exactly as given:
${protectedList.length > 0 ? protectedList.slice(0, 25).map((t) => `- "${t}"`).join("\n") : "- None detected"}
- Technical acronyms & model names: PRESERVE EXACTLY (e.g. ${protectedTokens.acronyms.concat(protectedTokens.technicalTerms).join(", ") || "none"}).
- Numerical values & units: PRESERVE EXACTLY (${protectedTokens.numbersAndUnits.join(", ") || "none"}).
- Citations: PRESERVE VERBATIM (${protectedTokens.citations.join(", ") || "none"}).
- Equations: PRESERVE EXACTLY (${protectedTokens.equations.join(" | ") || "none"}).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUTHOR'S LEXICAL FINGERPRINT (WEIGHTED PREFERENCES):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${softConstraints.map((c) => `- ${c}`).join("\n")}
- Do NOT substitute words simply because another word sounds more academic:
  * "provide" -> KEEP "provide" (do NOT change to "offer")
  * "large"   -> KEEP "large" (do NOT change to "significant")
  * "combine" -> KEEP "combine" (do NOT change to "integrate")
  * "reduce"  -> KEEP "reduce" (do NOT change to "mitigate")
  * "show"    -> KEEP "show" (do NOT change to "demonstrate")
  * "use"     -> KEEP "use" (do NOT change to "utilize")
  * "help"    -> KEEP "help" (do NOT change to "facilitate")
  * "problem" -> KEEP "problem" (do NOT change to "challenge")
  * "method"  -> KEEP "method" (do NOT change to "framework")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUTHOR'S STRUCTURAL BOUNDARIES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${structuralBoundaries.map((b) => `- ${b}`).join("\n")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORBIDDEN GENERIC AI PHRASES (NEVER USE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Do NOT write: "transformative paradigm", "unprecedented", "pivotal role", "robust framework",
"critical challenge", "architectural foundation", "comprehensive framework", "cutting-edge",
"notable advancement", "plays a crucial role", "significantly enhances", "effectively addresses",
"seamless integration", "sophisticated mechanism", "rigorous framework", "multifaceted",
"state-of-the-art", "delve into", "testament to", "tapestry of", "harnessing the power of".
${learnedRulesPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT DIRECTIVE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY the edited text for the section: "${sectionType}".
- Output pure text only — no conversational filler, no greetings, no markdown fences.
- Complete paragraph — never truncate mid-sentence.`;
}

/**
 * Executes a single-generation Author-Style Compiler rewrite.
 * Single Ollama generation, streaming enabled, think:false, deterministic validation.
 */
export async function executeRewrite(options: RewriteOptions): Promise<RewriteResult> {
  const totalRewriteStart = Date.now();
  const { draftInput, sectionType, customInstructions, title, mode = "exact_voice", onToken } = options;

  if (!draftInput || draftInput.trim().length === 0) {
    throw new Error("Draft input cannot be empty.");
  }

  const canonicalMode = normalizeRewriteMode(mode);

  // 1. Gather context from SQLite & Corpus
  const profileLoadStart = Date.now();
  const profile = getActiveVoiceProfile();
  const learnedRules = getActiveLearnedRules();
  const personalDocs = getPersonalDocuments();
  const allDocs = getAllDocuments();
  const corpusTexts = (personalDocs.length > 0 ? personalDocs : allDocs).map((d) => d.raw_text);

  // 2. Load deterministic metrics and qualitative fingerprints
  const metrics = loadMetrics();
  const lexicalFingerprint = loadLexicalFingerprint();
  const structuralFingerprint = loadStructuralFingerprint();
  const profileLoadingMs = Date.now() - profileLoadStart;

  // 3. Construct Protected Token Map & Semantic Envelope
  const promptConstructionStart = Date.now();
  const semanticEnvelope = extractSemanticEnvelope(draftInput);

  let learnedRulesPrompt = "";
  if (learnedRules.length > 0) {
    learnedRulesPrompt = `\n### USER'S LEARNED CORRECTION MEMORY:
${learnedRules.map((r, i) => `${i + 1}. [${r.category.toUpperCase()}] ${r.rule_text}`).join("\n")}`;
  }

  const systemPrompt = buildAuthorCompilerPrompt({
    mode: canonicalMode,
    lexicalFingerprint,
    structuralFingerprint,
    semanticEnvelope,
    learnedRulesPrompt,
    sectionType,
  });

  let userPrompt = `INPUT TEXT TO EDIT (${sectionType}):
${draftInput}`;

  if (customInstructions && customInstructions.trim()) {
    userPrompt += `\n\nADDITIONAL INSTRUCTION:\n${customInstructions.trim()}`;
  }

  // Measure Baseline Input Voice Match (deterministic)
  const inputVoiceMatch = computeVoiceMatch(draftInput, metrics);

  // Calculate adaptive num_predict based on input word count:
  // Math.max(1024, Math.ceil(inputWordsCount * 3))
  const inputWordsCount = draftInput.trim().split(/\s+/).filter(Boolean).length;
  const numPredict = Math.max(1024, Math.ceil(inputWordsCount * 3));

  const promptConstructionMs = Date.now() - promptConstructionStart;

  // 4. Exactly ONE Ollama Streaming Generation (Do NOT make a second LLM request)
  const generationTemp = canonicalMode === "light_cleanup" ? 0.05 : canonicalMode === "exact_voice" ? 0.25 : 0.45;

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

  // 6. Truncation Detection
  const truncation = detectTruncation({
    content: cleanOutput,
    doneReason: streamResult.doneReason,
    evalCount: streamResult.evalCount,
    maxTokens: numPredict,
  });

  if (truncation.isTruncated) {
    console.warn(`[VoiceDNA Truncation Warning] ${truncation.message}. Reason: ${truncation.reason}`);
  }

  // 7. Deterministic Fidelity & Protected Token Validation (0 LLM CALLS)
  const fidelityStart = Date.now();
  const fidelity = verifyFidelity(draftInput, cleanOutput);
  const protectedTokenCheck = verifyProtectedTokens(cleanOutput, semanticEnvelope.protectedTokens);

  if (truncation.isTruncated || !protectedTokenCheck.allPreserved) {
    fidelity.allPreserved = false;
  }
  const fidelityCheckMs = Date.now() - fidelityStart;

  // 8. Deterministic Voice Match (0 LLM CALLS)
  const voiceMatchStart = Date.now();
  const outputVoiceMatch = computeVoiceMatch(cleanOutput, metrics);
  const voiceMatchMs = Date.now() - voiceMatchStart;

  // 9. Deterministic Voice Validator & Enforcement (0 LLM CALLS)
  const voiceValidation = validateVoiceTransfer({
    draftInput,
    rewrittenOutput: cleanOutput,
    mode: canonicalMode,
    lexicalFingerprint,
    structuralFingerprint,
    protectedTokens: semanticEnvelope.protectedTokens,
  });

  const novelty = verifyNovelty(cleanOutput, corpusTexts);

  // Compute standard validation report for backward compatibility
  const inputWords = draftInput.trim().split(/\s+/).filter(Boolean);
  const outputWords = cleanOutput.trim().split(/\s+/).filter(Boolean);
  const wordsChanged = voiceValidation.tokenChanges.filter((c) => !c.isAllowed).length;
  const wordsChangedPct = inputWords.length > 0 ? Math.round((wordsChanged / inputWords.length) * 1000) / 10 : 0;
  const inputSentences = draftInput.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 0);
  const outputSentences = cleanOutput.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 0);

  let sentencesPreserved = 0;
  for (const inS of inputSentences) {
    const inKey = inS.slice(0, 20).toLowerCase();
    if (outputSentences.some((outS) => outS.toLowerCase().includes(inKey))) {
      sentencesPreserved++;
    }
  }

  const validation: RewriteValidationReport = {
    wordsChanged,
    totalInputWords: inputWords.length,
    totalOutputWords: outputWords.length,
    wordsChangedPct,
    sentencesPreserved,
    totalInputSentences: inputSentences.length,
    totalOutputSentences: outputSentences.length,
    structuralEdits: [
      `Vocabulary Alignment: ${voiceValidation.vocabularyAlignmentPct}%`,
      `Structural Alignment: ${voiceValidation.structuralAlignmentPct}%`,
      `Grammar Fixes: ${voiceValidation.grammarFixesCount}`,
      `Unnecessary Synonym Swaps: ${voiceValidation.unnecessarySynonymCount}`,
      `Verdict: ${voiceValidation.enforcementVerdict}`,
    ],
    lexicalSubstitutions: voiceValidation.unnecessarySynonymSwaps.map((s) => ({
      original: s.original,
      replacement: s.replacement,
    })),
    vocabularyChanges: voiceValidation.unnecessarySynonymSwaps.map((s) => `"${s.original}" -> "${s.replacement}"`),
    grammarChanges: voiceValidation.tokenChanges.filter((c) => c.isAllowed).map((c) => `${c.classification}: "${c.original}" -> "${c.replacement}"`),
    inputVoiceMatch,
    outputVoiceMatch,
    voiceMatchDelta: Math.round((outputVoiceMatch.overallScore - inputVoiceMatch.overallScore) * 10) / 10,
    mode: canonicalMode,
    preservationGoalMet: voiceValidation.isPass,
    selectedCandidateReason: voiceValidation.summary,
    voiceValidation,
    protectedTokensRate: protectedTokenCheck.preservationRate,
  };

  // 10. Record in SQLite History
  const recordId = `rewrite-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record: RewriteRecord = {
    id: recordId,
    title: title || `${sectionType} Edit (${canonicalMode})`,
    section_type: sectionType,
    draft_input: draftInput,
    rewritten_output: cleanOutput,
    user_final_text: null,
    fidelity_data: {
      ...fidelity,
      voiceMatch: outputVoiceMatch,
      validation,
      truncated: truncation.isTruncated,
      truncationReason: truncation.reason,
      generatedTokens: truncation.generatedTokens,
      maxTokens: truncation.maxTokens,
      truncationMessage: truncation.message,
    },
    verbatim_check: novelty,
    mode: canonicalMode,
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
  console.log(`\n[VoiceDNA Author Compiler Performance]
Profile Loading:      ${profileLoadingMs} ms
Prompt Construction:  ${promptConstructionMs} ms
Time to First Token:  ${timeToFirstTokenMs} ms
Ollama Generation:    ${totalGenerationMs} ms
Fidelity & Protected: ${fidelityCheckMs} ms
Voice Match:          ${voiceMatchMs} ms
Total Rewrite:        ${totalRewriteMs} ms
Ollama requests for this rewrite: 1
Verdict:              ${voiceValidation.enforcementVerdict}
Summary:              ${voiceValidation.summary}
Truncated:            ${truncation.isTruncated ? `YES (${truncation.reason})` : "NO"}\n`);

  return {
    id: recordId,
    rewrittenOutput: cleanOutput,
    fidelity,
    novelty,
    voiceMatch: outputVoiceMatch,
    validation,
    voiceValidation,
    mode: canonicalMode,
    appliedRulesCount: learnedRules.length,
    profileName: profile?.name || "Personal Voice",
    created_at: record.created_at,
    timings,
    truncated: truncation.isTruncated,
    truncationReason: truncation.reason,
    generatedTokens: truncation.generatedTokens,
    maxTokens: truncation.maxTokens,
    truncationMessage: truncation.message,
  };
}

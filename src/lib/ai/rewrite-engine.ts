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

export interface TruncationDetectionResult {
  isTruncated: boolean;
  reason?: string;
  generatedTokens?: number;
  maxTokens?: number;
  message?: string;
}

/**
 * Detects whether the generated rewrite output was truncated.
 * A response is considered truncated when:
 * 1. The stream ends because the model reached the token limit (doneReason === "length" or evalCount >= maxTokens).
 * 2. The output ends abruptly in the middle of a sentence/word (no terminal punctuation).
 * 3. Ollama reports a non-complete stop reason (doneReason !== "stop").
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

  // 1. Model reached token limit (Ollama length reason or evalCount reached maxTokens)
  const reachedTokenLimit =
    doneReason === "length" ||
    (typeof evalCount === "number" && typeof maxTokens === "number" && evalCount >= maxTokens);

  // 2. Ollama reports a non-complete stop reason (e.g., anything other than "stop")
  const nonCompleteStopReason =
    typeof doneReason === "string" && doneReason.length > 0 && doneReason !== "stop";

  // 3. Output ends abruptly in the middle of a sentence or word (missing terminal punctuation)
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
 * Builds the system prompt exclusively for Strong VoiceDNA mode.
 *
 * ARCHITECTURE:
 *   INPUT TEXT  →  CONTENT SOURCE  (facts, entities, numbers, logic only)
 *   VOICE DNA   →  STYLE SOURCE    (all wording, framing, rhythm, vocabulary)
 *   ACADEMIC    →  SAFETY FILTER   (no slang/profanity — NOT a style target)
 *
 * This prompt is intentionally separate from the preserve/polish prompt
 * because the "CORE PRIORITY ORDER" of that prompt ("preserve original wording")
 * is fundamentally incompatible with genuine style transfer.
 */
function buildStrongVoiceDNASystemPrompt(params: {
  fingerprint: ReturnType<typeof loadFingerprint>;
  profile: ReturnType<typeof getActiveVoiceProfile>;
  metrics: ReturnType<typeof loadMetrics>;
  citations: string[];
  equations: string[];
  numbers: string[];
  lists: string[];
  learnedRulesPrompt: string;
  sectionType: string;
}): string {
  const { fingerprint, profile, metrics, citations, equations, numbers, learnedRulesPrompt, sectionType } = params;

  // Pull live measured values from the corpus profile
  const avgSentenceLenRaw = metrics?.sentenceLength?.averageWords ?? 37;
  const avgSentenceLen = Math.round(typeof avgSentenceLenRaw === "number" ? avgSentenceLenRaw : 37);
  const transitionDensity = metrics?.transitionFrequency?.densityPer100Words ?? 9.2;
  const clauseDensity = metrics?.clauseDensity?.averageClausesPerSentence ?? 3.1;

  // Layer A personal thinking directives from live fingerprint
  const fp = fingerprint as any;
  const sentenceFraming =
    fp?.layerA_personal_thinking?.sentence_framing ||
    "establishes direct contextual baseline before introducing complex operational mechanics; anchors problem space upfront";
  const clarificationLoops =
    fp?.layerA_personal_thinking?.clarification_loops ||
    "deploys immediate clarification loops (e.g. 'for example', 'that is', 'let\'s take') to ground theoretical propositions";
  const workflowExplanations =
    fp?.layerA_personal_thinking?.workflow_explanations ||
    "structures explanations with sequential procedural progression (initial setup -> core mechanism -> empirical outcome)";
  const thoughtExpansion =
    fp?.layerA_personal_thinking?.thought_expansion ||
    `develops expansive multi-part reasoning (averaging ~${avgSentenceLen} words/sentence), thoroughly expanding propositions before concluding`;
  const transitionOrder =
    fp?.layerA_personal_thinking?.transition_order ||
    "orders transitional thoughts deductively: establishes premise, introduces sequential mechanism, and summarizes operational impact";
  const paragraphRhythm =
    fp?.layerA_personal_thinking?.paragraph_rhythm ||
    "maintains modular, single-focus paragraph rhythm targeting one discrete conceptual block per section";
  const explanationOrder =
    fp?.merged_directives?.explanation_order ||
    "Structures theoretical explanations with sequential procedural progression: establish contextual baseline -> formalize operational mechanism -> evaluate outcomes.";

  // Invariance section (CONTENT invariants — these survive style transfer)
  const invarianceBlock = `### STRICT INVARIANTS — NEVER CHANGE THESE (THEY ARE CONTENT, NOT STYLE):
- CITATIONS: Preserve all verbatim (${citations.length > 0 ? citations.join(", ") : "e.g. [1]"}).
- EQUATIONS: Preserve all LaTeX exactly (${equations.length > 0 ? equations.join(" | ") : "none detected"}).
- NUMBERS: Retain every exact numerical value, percentage, unit, and measurement (${numbers.length > 0 ? numbers.join(", ") : "none detected"}).
- TECHNICAL ENTITIES: Preserve all acronyms, model names, algorithm names, and domain-specific terms exactly as given in the input.
- LISTS: Preserve structured lists without flattening.`;

  // Synthesized voice guidelines from the live voice profile
  const voiceGuidelines: string = (profile as any)?.synthesized_guidelines || "";

  return `You are "VoiceDNA", a writing style transfer engine.

YOUR MISSION IS STYLE TRANSFER — NOT TEXT PRESERVATION OR POLISHING.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FUNDAMENTAL ARCHITECTURE (READ THIS FIRST):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The input text is a CONTENT SOURCE — it tells you WHAT facts to convey.
The author's VoiceDNA corpus is a STYLE SOURCE — it tells you HOW to say it.
These are completely separate concerns.

DO NOT preserve the input's wording.
DO NOT polish the input's phrasing.
DO NOT treat the input as a draft to edit.

INSTEAD, follow exactly these three steps:
  STEP 1 — EXTRACT from the input: every fact, technical entity, numerical value,
             causal claim, logical relationship, and conclusion.
  STEP 2 — DISCARD the input's vocabulary, sentence structure, phrasing, and
             explanation order entirely.
  STEP 3 — RECONSTRUCT the paragraph from scratch using ONLY the author's
             personal VoiceDNA as the stylistic template.

The output must make a reader think: "This sounds like the exact same person who
wrote the corpus" — not "This is a polished rewrite of the input."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTENT EXTRACTION (from input text — carry these forward):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- All technical entity names (acronyms, model names, algorithm names, protocols)
- All numerical values, measurements, percentages, thresholds
- All citations (preserve verbatim)
- All causal claims ("X enables Y", "Z prevents W")
- The logical progression of the argument (what the paragraph argues, step by step)
- All conclusions and outcomes stated

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STYLE RECONSTRUCTION (author's VoiceDNA — your writing template):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sentence Cadence (CRITICAL):
- Target ~${avgSentenceLen} words per sentence — this is the author's measured natural cadence from their corpus.
- Write expansive, multi-clause constructions that thoroughly expand each proposition
  before moving to the next (measured: ~${clauseDensity} clauses/sentence).
- Do NOT write short, punchy, journalistic sentences.

Sentence Framing:
- ${sentenceFraming}

Reasoning Order — structure the paragraph in this sequence:
- ${explanationOrder}

Workflow Explanation Style:
- ${workflowExplanations}

Clarification Loops (USE THESE — the author naturally grounds every proposition):
- ${clarificationLoops}
- Embed at least one clarification marker per paragraph.

Transition Style (use the author's NATURAL connectors, NOT formal academic openers):
- The author's top transition words by frequency from corpus: "and", "but", "also", "then", "so"
- Use additive, sequential, and adversative connectors naturally within sentences.
- Target ~${transitionDensity} transitions per 100 words.
- Do NOT open sentences with heavy formal openers like "Furthermore," "Consequently," "Nevertheless," unless it reflects the author's actual usage.

Thought Expansion:
- ${thoughtExpansion}

Transition Order:
- ${transitionOrder}

Paragraph Rhythm:
- ${paragraphRhythm}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACADEMIC PROFILE — SAFETY/VALIDITY FILTER ONLY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The Academic Profile is NOT a style target. It is a content filter only.
Do NOT include: slang, profanity, texting abbreviations ("u", "idk"), or chat filler.
The Academic Profile does NOT mean:
- Use formal vocabulary or elevated synonyms
- Replace natural words with scholarly equivalents
- Write in IEEE/journal boilerplate style
Write as the AUTHOR, not as a journal article.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOCABULARY — DO NOT ARTIFICIALLY ELEVATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is the author's measured vocabulary preference from their corpus:
- Use "shows" not "demonstrates"
- Use "uses" not "utilizes"
- Use "helps" not "facilitates"
- Use "problem" not "challenge"
- Use "method" not "framework"
- Use "good" not "effective"
Choose vocabulary that reflects how the author naturally thinks and writes.

${invarianceBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORBIDDEN GENERIC AI PHRASES (NEVER USE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Do NOT write: "transformative paradigm", "unprecedented", "pivotal role", "robust framework",
"critical challenge", "architectural foundation", "comprehensive framework", "cutting-edge",
"notable advancement", "plays a crucial role", "significantly enhances", "effectively addresses",
"seamless integration", "sophisticated mechanism", "rigorous framework", "multifaceted",
"state-of-the-art", "delve into", "testament to", "tapestry of", "harnessing the power of".

${voiceGuidelines ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nAUTHOR'S CALIBRATED VOICE PROFILE:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${voiceGuidelines}\n` : ""}${learnedRulesPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT DIRECTIVE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY the reconstructed paragraph for the section: "${sectionType}".
- Output pure text only — no greetings, no meta-commentary, no explanations.
- Do NOT begin with "Here is..." or "Rewritten:" or any similar prefix.
- The paragraph must be complete — do not truncate mid-sentence.`;
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

  // Prompt Construction:
  // Strong VoiceDNA uses a completely separate system prompt enforcing content/style separation.
  // Preserve and Academic Polish keep the shared minimal-edit preservation frame.
  let systemPrompt: string;

  if (mode === "strong_voicedna") {
    // Dedicated style-transfer prompt — input is CONTENT source, VoiceDNA is STYLE source
    systemPrompt = buildStrongVoiceDNASystemPrompt({
      fingerprint,
      profile,
      metrics,
      citations,
      equations,
      numbers,
      lists,
      learnedRulesPrompt,
      sectionType,
    });
  } else {
    // Preserve + Academic Polish: shared minimal-edit frame ("preserve original wording" governs)
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
    } else {
      modeSpecificPrompt = `### REWRITE MODE: ACADEMIC POLISH
- Focus purely on mechanical grammar, punctuation, and clause flow.
- STRICTLY RETAIN the author's original vocabulary, phrasing, and reasoning order.
- Do NOT replace natural words with elevated scholarly synonyms.`;
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

    systemPrompt = `You are "VoiceDNA", a specialized personal writing preservation engine.

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
  }

  let userPrompt = `DRAFT INPUT TO REWRITE (${sectionType}):
${draftInput}`;

  if (customInstructions && customInstructions.trim()) {
    userPrompt += `\n\nADDITIONAL USER INSTRUCTION:\n${customInstructions.trim()}`;
  }

  // Measure Baseline Input Voice Match (deterministic)
  const inputVoiceMatch = computeVoiceMatch(draftInput, metrics);

  // Configure reasonable num_predict based on input word count:
  // 1. Minimum num_predict of 1024
  // 2. Prefer Math.max(1024, Math.ceil(inputWordsCount * 3))
  // 3. No maximum lower than 1024
  const inputWordsCount = draftInput.trim().split(/\s+/).filter(Boolean).length;
  const numPredict = Math.max(1024, Math.ceil(inputWordsCount * 3));

  const promptConstructionMs = Date.now() - promptConstructionStart;

  // 4. Exactly ONE Ollama Streaming Generation (Do NOT make a second LLM request)
  // In Preserve Mode, use very low temperature (0.05) to enforce minimal-edit discipline
  // Strong VoiceDNA needs higher temperature for genuine creative reconstruction;
  // Preserve mode uses near-zero temperature to enforce minimal-edit discipline.
  const generationTemp = mode === "preserve" ? 0.05 : mode === "strong_voicedna" ? 0.45 : 0.20;
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

  // 6. Truncation Detection (Evaluated after streaming completes)
  const truncation = detectTruncation({
    content: cleanOutput,
    doneReason: streamResult.doneReason,
    evalCount: streamResult.evalCount,
    maxTokens: numPredict,
  });

  if (truncation.isTruncated) {
    console.warn(
      `[VoiceDNA Truncation Warning] ${truncation.message}. Reason: ${truncation.reason}`
    );
  }

  // 7. Deterministic Fidelity Validation (0 LLM CALLS)
  const fidelityStart = Date.now();
  const fidelity = verifyFidelity(draftInput, cleanOutput);
  if (truncation.isTruncated) {
    fidelity.allPreserved = false;
  }
  const fidelityCheckMs = Date.now() - fidelityStart;

  // 8. Deterministic Voice Match (0 LLM CALLS)
  const voiceMatchStart = Date.now();
  const outputVoiceMatch = computeVoiceMatch(cleanOutput, metrics);
  const voiceMatchMs = Date.now() - voiceMatchStart;

  // 9. Deterministic Validation Report & Novelty Check (0 LLM CALLS)
  const validation = computeRewriteValidation(
    draftInput,
    cleanOutput,
    mode,
    inputVoiceMatch,
    outputVoiceMatch,
    "Personal Voice Preservation (Minimal-Edit Rule)"
  );
  const novelty = verifyNovelty(cleanOutput, corpusTexts);

  // 10. Record in SQLite History
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
      truncated: truncation.isTruncated,
      truncationReason: truncation.reason,
      generatedTokens: truncation.generatedTokens,
      maxTokens: truncation.maxTokens,
      truncationMessage: truncation.message,
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
Words Changed:        ${validation.wordsChanged} (${validation.wordsChangedPct}%)
Truncated:            ${truncation.isTruncated ? `YES (${truncation.reason})` : "NO"}\n`);

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
    truncated: truncation.isTruncated,
    truncationReason: truncation.reason,
    generatedTokens: truncation.generatedTokens,
    maxTokens: truncation.maxTokens,
    truncationMessage: truncation.message,
  };
}

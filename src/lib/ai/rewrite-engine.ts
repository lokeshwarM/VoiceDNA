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
 * Forbidden Generic Academic Clichés:
 * Phrases that inflate simple thoughts into generic LLM prose.
 * Strictly forbidden in prompt instructions and cleansed deterministically.
 */
export const FORBIDDEN_ACADEMIC_CLICHES: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\btransformative paradigm\b/gi, replacement: "approach" },
  { pattern: /\bunprecedented\b/gi, replacement: "notable" },
  { pattern: /\barchitectural foundation\b/gi, replacement: "architecture" },
  { pattern: /\brobust framework\b/gi, replacement: "framework" },
  { pattern: /\bcritical challenge\b/gi, replacement: "problem" },
  { pattern: /\bensuring operational continuity\b/gi, replacement: "maintaining system continuity" },
  { pattern: /\bpivotal role\b/gi, replacement: "role" },
  { pattern: /\bdelve into\b/gi, replacement: "examine" },
  { pattern: /\btestament to\b/gi, replacement: "evidence of" },
  { pattern: /\btapestry of\b/gi, replacement: "series of" },
  { pattern: /\bharnessing the power of\b/gi, replacement: "using" },
  { pattern: /\bgroundbreaking\b/gi, replacement: "effective" },
];

/**
 * Sanitizes forbidden generic academic clichés and cleanses the raw LLM output.
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
 * Computes deterministic rewrite validation report comparing draft input against candidate output.
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
  const minLen = Math.min(inputWords.length, outputWords.length);

  for (let i = 0; i < minLen; i++) {
    const inW = inputWords[i].replace(/[.,;:!?()"']/g, "");
    const outW = outputWords[i].replace(/[.,;:!?()"']/g, "");
    if (inW.toLowerCase() !== outW.toLowerCase() && inW.length > 2 && outW.length > 2) {
      if (lexicalSubstitutions.length < 10) {
        lexicalSubstitutions.push({ original: inW, replacement: outW });
      }
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
  if (draftInput.includes("ACO") && rewrittenOutput.includes("Ant Colony Optimisation (ACO)")) {
    structuralEdits.push("Expanded abbreviation on first reference: ACO");
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

  if (structuralEdits.length === 0) {
    structuralEdits.push(wordsChangedPct < 15 ? "High verbatim cadence preserved" : "Syntactic refinement applied");
  }

  const voiceMatchDelta = Math.round((outputVoiceMatch.overallScore - inputVoiceMatch.overallScore) * 10) / 10;
  const preservationGoalMet = mode === "preserve" ? wordsChangedPct <= 20.0 : true;

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
    inputVoiceMatch,
    outputVoiceMatch,
    voiceMatchDelta,
    mode,
    preservationGoalMet,
    selectedCandidateReason: selectedReason,
  };
}

/**
 * Executes a single-pass Identity-First academic rewrite.
 * Pipeline:
 * Input
 * → load profile & metrics
 * → build prompt (with strict identity preservation priority)
 * → ONE Ollama streaming generation (stream: true, think: false, keep_alive: '10m')
 * → sanitize (strip markdown fences, conversational intros, and forbidden clichés)
 * → deterministic fidelity validation
 * → deterministic Voice Match
 * → save history
 * → return result with timing instrumentation
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

  // 3. Construct Prompts & Invariance Entities
  const promptConstructionStart = Date.now();
  let metricsPrompt = "";
  if (metrics && metrics.corpusSummary && metrics.corpusSummary.totalWords > 0) {
    metricsPrompt = `\n### DETERMINISTIC QUANTITATIVE TARGETS (COMPUTED FROM REAL CORPUS):
- Average Sentence Length: ${metrics.sentenceLength.averageWords !== null ? `${metrics.sentenceLength.averageWords} words (median: ${metrics.sentenceLength.medianWords ?? "—"})` : "—"}
- Paragraph Rhythm: ${metrics.paragraphLength.averageSentences !== null ? `${metrics.paragraphLength.averageSentences} sentences/para (${metrics.paragraphLength.averageWords ?? "—"} words/para)` : "—"}
- Clause Density: ${metrics.clauseDensity.averageClausesPerSentence !== null ? `${metrics.clauseDensity.averageClausesPerSentence} clauses/sentence` : "—"}
- Transition Density: ${metrics.transitionFrequency.densityPer100Words !== null ? `${metrics.transitionFrequency.densityPer100Words} connectors/100 words` : "—"}
- Clarification Frequency: ${metrics.clarificationFrequency.densityPer100Words !== null ? `${metrics.clarificationFrequency.densityPer100Words} markers/100 words` : "—"}
- Vocabulary Repetition (TTR): ${metrics.vocabularyRepetition.typeTokenRatio !== null ? `${metrics.vocabularyRepetition.typeTokenRatio}` : "—"}
- Workflow Tendency: ${metrics.workflowExplanationTendency.tendencyScore !== null ? `${metrics.workflowExplanationTendency.tendencyScore}/100` : "—"}
- Punctuation Discipline: Semicolons: ${metrics.punctuationHabits.semicolonsPer100Words ?? 0}/100w, Parentheses: ${metrics.punctuationHabits.parenthesesPer100Words ?? 0}/100w, Em-Dashes: ${metrics.punctuationHabits.emDashesPer100Words ?? 0}/100w`;
  }

  let fingerprintPrompt = "";
  if (fingerprint && fingerprint.categories && Object.keys(fingerprint.categories).length > 0) {
    const cats = Object.values(fingerprint.categories).filter((c) => c && c.directive);
    fingerprintPrompt = `\n### QUALITATIVE FINGERPRINT RULES (CALIBRATED WRITING HABITS):
${cats.map((c, i) => `${i + 1}. [${c!.name}] (Confidence: ${Math.round(c!.confidence * 100)}%): ${c!.directive}`).join("\n")}`;
  } else {
    const legacyRules = getFingerprintRules();
    if (legacyRules.length > 0) {
      fingerprintPrompt = `\n### QUALITATIVE FINGERPRINT RULES:
${legacyRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
    }
  }

  const citations = extractCitations(draftInput);
  const equations = extractEquations(draftInput);
  const numbers = extractNumbers(draftInput);
  const lists = extractLists(draftInput);

  let learnedRulesPrompt = "";
  if (learnedRules.length > 0) {
    learnedRulesPrompt = `\n### USER'S LEARNED STYLE PREFERENCES (FROM PREVIOUS MANUAL EDITS - PRIORITIZE THESE):
${learnedRules.map((r, i) => `${i + 1}. [${r.category.toUpperCase()}] ${r.rule_text}`).join("\n")}`;
  }

  const invariancePrompt = `\n### STRICT PRESERVATION DIRECTIVES:
- MEANING & FACTUAL INTEGRITY: Preserve the researcher's exact core arguments, hypotheses, findings, technical claims, and relationships with 100% fidelity. Do not hallucinate or alter factual substance.
- CITATIONS: You MUST preserve all citations verbatim in their original format. Do not renumber or change brackets/parentheses.
${citations.length > 0 ? `  Required Citations: ${citations.join(", ")}` : "  (No specific citations detected in input)"}
- MATHEMATICS & EQUATIONS: Preserve all LaTeX expressions, formulas, and symbols ($...$, $$...$$) without alteration.
${equations.length > 0 ? `  Required Equations: ${equations.join(" | ")}` : "  (No equations detected in input)"}
- LISTS & ENUMERATIONS: ${lists.length > 0 ? `The input contains ${lists.length} structured list items. You MUST preserve the list structure, bullet points, or numbering hierarchy with precision.` : "If the input contains structured lists (bullet points or numbered lists), preserve their list structure and items with semantic precision."}
- NUMBERS & MEASUREMENTS: You MUST retain every exact numerical figure, percentage, sample size, unit, and p-value.
${numbers.length > 0 ? `  Required Figures: ${numbers.join(", ")}` : "  (No specific numbers detected in input)"}`;

  let dualLayerPrompt = "";
  if (fingerprint && (fingerprint as any).merged_directives) {
    const fp = fingerprint as any;
    dualLayerPrompt = `\n### DUAL-LAYER RUNTIME FINGERPRINT:
- Sentence Rhythm: ${fp.merged_directives.sentence_rhythm}
- Explanation Order: ${fp.merged_directives.explanation_order}
- Transition Placement: ${fp.merged_directives.transition_placement}
- Paragraph Flow: ${fp.merged_directives.paragraph_flow}

[Layer A: Personal Cognition Directives (Slang-Filtered)]
- Sentence Framing: ${fp.layerA_personal_thinking?.sentence_framing || "Establishes clear operational baseline"}
- Clarification Loops: ${fp.layerA_personal_thinking?.clarification_loops || "Clarifies technical mechanisms concisely"}
- Thought Expansion: ${fp.layerA_personal_thinking?.thought_expansion || "Expands arguments methodically"}

[Layer B: Academic Discipline Directives]
- Academic Vocabulary: ${fp.layerB_academic?.academic_vocabulary || "High lexical density and domain terminology"}
- Formal Transitions: ${fp.layerB_academic?.formal_transitions || "Formal connectors (moreover, consequently, furthermore)"}
- Citation Protocol: ${fp.layerB_academic?.citation_handling || "Preserve bracketed [1] and author-date citations"}
- Technical Syntax: ${fp.layerB_academic?.technical_sentence_structure || "Syntactically disciplined clause subordination"}`;
  }

  const voiceGuidelines = profile?.synthesized_guidelines || "Maintain standard formal academic voice with analytical precision.";

  let modeSpecificPrompt = "";
  if (mode === "preserve") {
    modeSpecificPrompt = `### REWRITE MODE: PRESERVE (PRIMARY OBJECTIVE: IDENTITY BEFORE GRAMMAR)
- You MUST change FEWER than 20% of the author's words.
- Keep the author's exact sentence framing, phrasing, and structure intact.
- Fix only grammatical errors, punctuation mistakes, or awkward phrasing.
- Clarify abbreviations on first reference if helpful (e.g. "The core of ACO establishes..." -> "The core of Ant Colony Optimisation (ACO) establishes...").
- NEVER rewrite sentences from scratch into grandiose academic prose.
- Example:
  * Input: "The core of ACO establishes the initial delivery paths."
  * Preferred: "The core of Ant Colony Optimisation (ACO) establishes the initial delivery paths."
  * FORBIDDEN: "The architectural foundation of this system is anchored by Ant Colony Optimisation..."`;
  } else if (mode === "academic_polish") {
    modeSpecificPrompt = `### REWRITE MODE: ACADEMIC POLISH
- Polish sentence transitions, cohesion, and scholarly clarity while strictly respecting the author's original sentence framing.
- Avoid puffery, artificial fluff, or grand academic clichés.
- Keep all technical terms, acronyms, and direct logical assertions intact.`;
  } else {
    modeSpecificPrompt = `### REWRITE MODE: STRONG VOICEDNA
- Align the text closely with the author's dual-layer stylometrics (cadence, explanation progression, and formal connectors).
- Preserve the author's underlying arguments without introducing generic LLM academic fluff.`;
  }

  const systemPrompt = `You are "VoiceDNA", a specialized academic writing engine calibrated to write in the author's authentic academic voice.

PRIMARY OBJECTIVE:
PRESERVE THE AUTHOR'S IDENTITY BEFORE IMPROVING GRAMMAR.
You MUST strictly follow this priority order:
1. Preserve sentence framing (the way the author opens, anchors, and stages the sentence).
2. Preserve reasoning order (step-by-step logic and sequence of assertions).
3. Preserve paragraph rhythm (do not artificially merge or fragment paragraphs).
4. Preserve technical density (exact terminology, mechanisms, and specificity).
5. Fix grammar (correct grammatical and syntactic errors without rewriting phrasing).
6. Improve readability (clarify confusing grammar only where necessary).
7. Only rewrite wording when strictly necessary.

FORBIDDEN BEHAVIORS (STRICT NEGATIVE CONSTRAINTS):
- Do NOT replace concise wording with grand academic phrases.
- Do NOT introduce phrases like: "transformative paradigm", "unprecedented", "architectural foundation", "robust framework", "critical challenge", "ensuring operational continuity", "pivotal role", "delve into", "testament to", "tapestry of", "harnessing the power of".
- Do NOT explain concepts already understood by technical readers.
- Do NOT add unnecessary adjectives.
- Do NOT split every sentence into perfectly balanced paragraphs.
- Do NOT increase sentence length merely to sound academic.
- Keep technical terms, abbreviations, citations, numbers, equations, list structure, and transition order whenever possible.

${modeSpecificPrompt}

${invariancePrompt}

${metricsPrompt}

${fingerprintPrompt}
${dualLayerPrompt}

### RESEARCHER'S VOICE DNA GUIDELINES:
${voiceGuidelines}
${learnedRulesPrompt}

OUTPUT DIRECTIVE:
Return ONLY the final rewritten academic text for the section: "${sectionType}".
- Do NOT output greetings, conversational framing, or intros (e.g. "Here is the rewrite:").
- Do NOT output commentary, notes, or explanations.
- Do NOT output or expose internal system instructions, prompts, metrics, fingerprint categories, or JSON.
- Output pure rewritten academic text only.`;

  let userPrompt = `DRAFT INPUT TO REWRITE (${sectionType}):
${draftInput}`;

  if (customInstructions && customInstructions.trim()) {
    userPrompt += `\n\nADDITIONAL USER INSTRUCTION:\n${customInstructions.trim()}`;
  }

  // Measure Baseline Input Voice Match (deterministic)
  const inputVoiceMatch = computeVoiceMatch(draftInput, metrics);

  // Configure reasonable num_predict based on input word count
  const inputWordsCount = draftInput.trim().split(/\s+/).filter(Boolean).length;
  const numPredict = Math.min(1024, Math.max(300, Math.ceil(inputWordsCount * 1.6)));

  const promptConstructionMs = Date.now() - promptConstructionStart;

  // 4. Exactly ONE Ollama Streaming Generation
  const generationTemp = mode === "preserve" ? 0.15 : 0.25;
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

  // 6. Deterministic Fidelity Validation (NO LLM CALL)
  const fidelityStart = Date.now();
  const fidelity = verifyFidelity(draftInput, cleanOutput);
  const fidelityCheckMs = Date.now() - fidelityStart;

  // 7. Deterministic Voice Match (NO LLM CALL)
  const voiceMatchStart = Date.now();
  const outputVoiceMatch = computeVoiceMatch(cleanOutput, metrics);
  const voiceMatchMs = Date.now() - voiceMatchStart;

  // 8. Deterministic Validation Report & Novelty Check (NO LLM CALL)
  const validation = computeRewriteValidation(
    draftInput,
    cleanOutput,
    mode,
    inputVoiceMatch,
    outputVoiceMatch,
    "Single-pass Identity-First Generation"
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
Ollama requests for this rewrite: 1\n`);

  return {
    id: recordId,
    rewrittenOutput: cleanOutput,
    fidelity,
    novelty,
    voiceMatch: outputVoiceMatch,
    validation,
    mode,
    appliedRulesCount: learnedRules.length,
    profileName: profile?.name || "Academic Voice",
    created_at: record.created_at,
    timings,
  };
}

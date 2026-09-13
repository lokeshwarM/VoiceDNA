import fs from "fs";
import path from "path";

export interface StyleDNAMetrics {
  corpusSummary: {
    totalFiles: number;
    totalWords: number;
    totalSentences: number;
    totalParagraphs: number;
  };
  sentenceLength: {
    averageWords: number;
    medianWords: number;
    minWords: number;
    maxWords: number;
    stdDev: number;
    distribution: {
      shortPercent: number; // < 14 words
      mediumPercent: number; // 14 - 26 words
      longPercent: number; // > 26 words
    };
  };
  clauseDensity: {
    averageClausesPerSentence: number;
    subordinateClauseRatio: number;
    coordinationRatio: number;
  };
  paragraphLength: {
    averageSentences: number;
    averageWords: number;
    totalParagraphs: number;
  };
  transitionFrequency: {
    densityPer100Words: number;
    categoryRatios: {
      causal: number;
      adversative: number;
      additive: number;
      sequential: number;
      emphasis: number;
    };
    topTransitions: { word: string; count: number }[];
  };
  clarificationFrequency: {
    densityPer100Words: number;
    occurrencesPer10Sentences: number;
    totalClarifications: number;
    topMarkers: { marker: string; count: number }[];
  };
  punctuationHabits: {
    semicolonsPer100Words: number;
    colonsPer100Words: number;
    emDashesPer100Words: number;
    parenthesesPer100Words: number;
    commasPer100Words: number;
    quotesPer100Words: number;
    questionsPer100Sentences: number;
  };
  vocabularyRepetition: {
    typeTokenRatio: number; // Unique words / Total words
    lexicalRedundancy: number; // 1 - TTR
    hapaxLegomenaRatio: number; // % of words used only once
  };
  workflowExplanationTendency: {
    densityPer100Words: number;
    proceduralMarkerCount: number;
    tendencyScore: number; // 0 to 100
  };
  timestamp: string;
}

const SUBORDINATING_CONJUNCTIONS = [
  "which", "that", "because", "although", "though", "since", "if", "unless",
  "when", "whenever", "while", "whereas", "wherein", "where", "after",
  "before", "as", "so that", "in order that", "provided that", "given that"
];

const TRANSITIONS = {
  causal: ["consequently", "therefore", "thus", "hence", "accordingly", "thereby", "as a result", "inevitably", "so"],
  adversative: ["however", "conversely", "nevertheless", "nonetheless", "in contrast", "on the other hand", "although", "whereas", "alternatively", "yet", "still", "but"],
  additive: ["furthermore", "moreover", "in addition", "additionally", "similarly", "likewise", "also", "and"],
  sequential: ["first", "initially", "then", "next", "subsequently", "finally", "ultimately", "starting", "afterwards"],
  emphasis: ["specifically", "notably", "significantly", "fundamentally", "in particular", "critically", "predominantly", "primarily", "especially"],
};

const CLARIFICATION_MARKERS = [
  "i.e.", "that is", "in other words", "specifically", "namely", "to clarify",
  "put differently", "more precisely", "in essence", "meaning that", "to be clear",
  "take for example", "for instance", "for example", "let's take", "just to explain",
  "i mean", "to put it another way", "basically"
];

const WORKFLOW_MARKERS = [
  "first", "second", "third", "then", "next", "subsequently", "finally",
  "step", "stage", "phase", "process", "workflow", "procedure", "pipeline",
  "algorithm", "setup", "deploy", "implementation", "proceed", "transition",
  "flow", "input", "output", "cycle", "loop", "mechanism", "execute", "run"
];

const STOP_WORDS = new Set([
  "the", "and", "that", "have", "for", "not", "with", "you", "this", "but", "his", "from",
  "they", "say", "her", "she", "will", "one", "all", "would", "there", "their", "what",
  "out", "about", "who", "get", "which", "go", "me", "when", "make", "can", "like", "time",
  "no", "just", "him", "know", "take", "people", "into", "year", "your", "good", "some",
  "could", "them", "see", "other", "than", "then", "now", "look", "only", "come", "its",
  "over", "think", "also", "back", "after", "use", "two", "how", "our", "work", "first",
  "well", "way", "even", "new", "want", "because", "any", "these", "give", "day", "most", "us"
]);

/**
 * Extracts strictly numerical and pattern-based StyleDNA metrics from all processed texts.
 * Contains numbers and statistical patterns only — NEVER copies previous sentences into the profile.
 */
export function extractStyleDNAFromTexts(corpusTexts: string[]): StyleDNAMetrics {
  const combinedText = corpusTexts.join("\n\n").trim();

  if (!combinedText) {
    return getEmptyMetrics();
  }

  // 1. Sentence splitting and length calculation
  const sentenceDelim = /(?<=[.?!])\s+(?=[A-Z0-9])/g;
  const rawSentences = combinedText
    .split(sentenceDelim)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  const sentenceWordCounts: number[] = [];
  let totalWords = 0;

  for (const s of rawSentences) {
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      sentenceWordCounts.push(words.length);
      totalWords += words.length;
    }
  }

  const totalSentences = Math.max(1, sentenceWordCounts.length);
  const avgSentenceLength = Math.round((totalWords / totalSentences) * 10) / 10;

  sentenceWordCounts.sort((a, b) => a - b);
  const medianWords = sentenceWordCounts[Math.floor(sentenceWordCounts.length / 2)] || 0;
  const minWords = sentenceWordCounts[0] || 0;
  const maxWords = sentenceWordCounts[sentenceWordCounts.length - 1] || 0;

  const variance = sentenceWordCounts.reduce((acc, len) => acc + Math.pow(len - avgSentenceLength, 2), 0) / totalSentences;
  const stdDev = Math.round(Math.sqrt(variance) * 10) / 10;

  let shortCount = 0;
  let mediumCount = 0;
  let longCount = 0;
  for (const len of sentenceWordCounts) {
    if (len < 14) shortCount++;
    else if (len <= 26) mediumCount++;
    else longCount++;
  }

  // 2. Clause density
  let subordinateCount = 0;
  let coordinationCount = 0;
  const lowerText = combinedText.toLowerCase();

  for (const conj of SUBORDINATING_CONJUNCTIONS) {
    const re = new RegExp(`\\b${conj}\\b`, "g");
    const m = lowerText.match(re);
    if (m) subordinateCount += m.length;
  }

  const coordMatches = lowerText.match(/,\s*(?:and|but|or|so|yet)\b/g);
  if (coordMatches) coordinationCount = coordMatches.length;

  const totalClauses = totalSentences + subordinateCount + coordinationCount;
  const avgClausesPerSentence = Math.round((totalClauses / totalSentences) * 10) / 10;

  // 3. Paragraph length
  const paragraphs = combinedText.split(/\n\s*\n+/).map((p) => p.trim()).filter((p) => p.length > 10);
  const totalParagraphs = Math.max(1, paragraphs.length);
  const avgParaWords = Math.round((totalWords / totalParagraphs) * 10) / 10;
  const avgParaSentences = Math.round((totalSentences / totalParagraphs) * 10) / 10;

  // 4. Transition frequency
  const transCounts: Record<string, number> = { causal: 0, adversative: 0, additive: 0, sequential: 0, emphasis: 0 };
  const specificTransCounts: Record<string, number> = {};
  let totalTransitions = 0;

  for (const [cat, words] of Object.entries(TRANSITIONS)) {
    for (const w of words) {
      const re = new RegExp(`\\b${w}\\b`, "g");
      const m = lowerText.match(re);
      if (m) {
        transCounts[cat] = (transCounts[cat] || 0) + m.length;
        specificTransCounts[w] = (specificTransCounts[w] || 0) + m.length;
        totalTransitions += m.length;
      }
    }
  }

  const topTransitions = Object.entries(specificTransCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }));

  const transDensityPer100Words = totalWords > 0 ? Math.round((totalTransitions / (totalWords / 100)) * 10) / 10 : 0;

  // 5. Clarification frequency
  const clarificationCounts: Record<string, number> = {};
  let totalClarifications = 0;
  for (const marker of CLARIFICATION_MARKERS) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    const m = combinedText.match(re);
    if (m) {
      clarificationCounts[marker] = m.length;
      totalClarifications += m.length;
    }
  }

  const topClarifications = Object.entries(clarificationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([marker, count]) => ({ marker, count }));

  const clarificationDensityPer100 = totalWords > 0 ? Math.round((totalClarifications / (totalWords / 100)) * 100) / 100 : 0;
  const clarificationPer10Sentences = Math.round((totalClarifications / (totalSentences / 10)) * 10) / 10;

  // 6. Punctuation habits per 100 words
  const calcPunctPer100 = (regex: RegExp) => {
    const count = (combinedText.match(regex) || []).length;
    return totalWords > 0 ? Math.round((count / (totalWords / 100)) * 100) / 100 : 0;
  };

  const semicolonsPer100Words = calcPunctPer100(/;/g);
  const colonsPer100Words = calcPunctPer100(/(?<!https?):/g);
  const emDashesPer100Words = calcPunctPer100(/(?:—|–|--)/g);
  const parenthesesPer100Words = calcPunctPer100(/\(/g);
  const commasPer100Words = calcPunctPer100(/,/g);
  const quotesPer100Words = calcPunctPer100(/(?:"|“|”)/g);
  const questionCount = (combinedText.match(/\?/g) || []).length;
  const questionsPer100Sentences = Math.round((questionCount / (totalSentences / 100)) * 10) / 10;

  // 7. Vocabulary repetition
  const allTokens = lowerText.replace(/[^\w\s]/g, "").split(/\s+/).filter((w) => w.length > 2);
  const wordFreq: Record<string, number> = {};
  for (const w of allTokens) {
    wordFreq[w] = (wordFreq[w] || 0) + 1;
  }

  const uniqueWordCount = Object.keys(wordFreq).length;
  const typeTokenRatio = allTokens.length > 0 ? Math.round((uniqueWordCount / allTokens.length) * 1000) / 1000 : 0;
  const lexicalRedundancy = Math.round((1 - typeTokenRatio) * 1000) / 1000;

  let hapaxCount = 0;
  for (const count of Object.values(wordFreq)) {
    if (count === 1) hapaxCount++;
  }
  const hapaxLegomenaRatio = uniqueWordCount > 0 ? Math.round((hapaxCount / uniqueWordCount) * 1000) / 1000 : 0;

  // 8. Workflow explanation tendency
  let proceduralCount = 0;
  for (const wm of WORKFLOW_MARKERS) {
    const re = new RegExp(`\\b${wm}\\b`, "g");
    const m = lowerText.match(re);
    if (m) proceduralCount += m.length;
  }

  const workflowDensityPer100 = totalWords > 0 ? Math.round((proceduralCount / (totalWords / 100)) * 10) / 10 : 0;
  // Normalized score 0-100 (where ~3 markers per 100 words is ~75)
  const tendencyScore = Math.min(100, Math.round(workflowDensityPer100 * 25));

  return {
    corpusSummary: {
      totalFiles: corpusTexts.length,
      totalWords,
      totalSentences,
      totalParagraphs,
    },
    sentenceLength: {
      averageWords: avgSentenceLength,
      medianWords,
      minWords,
      maxWords,
      stdDev,
      distribution: {
        shortPercent: Math.round((shortCount / totalSentences) * 100),
        mediumPercent: Math.round((mediumCount / totalSentences) * 100),
        longPercent: Math.round((longCount / totalSentences) * 100),
      },
    },
    clauseDensity: {
      averageClausesPerSentence: avgClausesPerSentence,
      subordinateClauseRatio: Math.round((subordinateCount / totalSentences) * 100) / 100,
      coordinationRatio: Math.round((coordinationCount / totalSentences) * 100) / 100,
    },
    paragraphLength: {
      averageSentences: avgParaSentences,
      averageWords: avgParaWords,
      totalParagraphs,
    },
    transitionFrequency: {
      densityPer100Words: transDensityPer100Words,
      categoryRatios: {
        causal: totalTransitions > 0 ? Math.round((transCounts.causal / totalTransitions) * 100) : 0,
        adversative: totalTransitions > 0 ? Math.round((transCounts.adversative / totalTransitions) * 100) : 0,
        additive: totalTransitions > 0 ? Math.round((transCounts.additive / totalTransitions) * 100) : 0,
        sequential: totalTransitions > 0 ? Math.round((transCounts.sequential / totalTransitions) * 100) : 0,
        emphasis: totalTransitions > 0 ? Math.round((transCounts.emphasis / totalTransitions) * 100) : 0,
      },
      topTransitions,
    },
    clarificationFrequency: {
      densityPer100Words: clarificationDensityPer100,
      occurrencesPer10Sentences: clarificationPer10Sentences,
      totalClarifications,
      topMarkers: topClarifications,
    },
    punctuationHabits: {
      semicolonsPer100Words,
      colonsPer100Words,
      emDashesPer100Words,
      parenthesesPer100Words,
      commasPer100Words,
      quotesPer100Words,
      questionsPer100Sentences,
    },
    vocabularyRepetition: {
      typeTokenRatio,
      lexicalRedundancy,
      hapaxLegomenaRatio,
    },
    workflowExplanationTendency: {
      densityPer100Words: workflowDensityPer100,
      proceduralMarkerCount: proceduralCount,
      tendencyScore,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Reads every processed corpus file from data/processed/ and compiles data/profile/voiceDNA.json
 */
export function extractAndSaveProfileFromProcessed(): StyleDNAMetrics {
  const processedDir = path.join(process.cwd(), "data", "processed");
  const profileDir = path.join(process.cwd(), "data", "profile");

  if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
  }
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const files = fs.readdirSync(processedDir).filter((f) => f.endsWith(".txt"));
  const texts: string[] = [];

  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(processedDir, f), "utf-8");
      if (content.trim()) {
        texts.push(content);
      }
    } catch (err: any) {
      console.warn(`Error reading processed file ${f}:`, err.message);
    }
  }

  const metrics = extractStyleDNAFromTexts(texts);

  // Save everything into data/profile/voiceDNA.json (Contains numbers and patterns only, NO copied sentences)
  const profilePath = path.join(profileDir, "voiceDNA.json");
  fs.writeFileSync(profilePath, JSON.stringify(metrics, null, 2), "utf-8");

  return metrics;
}

export function getEmptyMetrics(): StyleDNAMetrics {
  return {
    corpusSummary: { totalFiles: 0, totalWords: 0, totalSentences: 0, totalParagraphs: 0 },
    sentenceLength: {
      averageWords: 0,
      medianWords: 0,
      minWords: 0,
      maxWords: 0,
      stdDev: 0,
      distribution: { shortPercent: 0, mediumPercent: 0, longPercent: 0 },
    },
    clauseDensity: { averageClausesPerSentence: 0, subordinateClauseRatio: 0, coordinationRatio: 0 },
    paragraphLength: { averageSentences: 0, averageWords: 0, totalParagraphs: 0 },
    transitionFrequency: {
      densityPer100Words: 0,
      categoryRatios: { causal: 0, adversative: 0, additive: 0, sequential: 0, emphasis: 0 },
      topTransitions: [],
    },
    clarificationFrequency: {
      densityPer100Words: 0,
      occurrencesPer10Sentences: 0,
      totalClarifications: 0,
      topMarkers: [],
    },
    punctuationHabits: {
      semicolonsPer100Words: 0,
      colonsPer100Words: 0,
      emDashesPer100Words: 0,
      parenthesesPer100Words: 0,
      commasPer100Words: 0,
      quotesPer100Words: 0,
      questionsPer100Sentences: 0,
    },
    vocabularyRepetition: { typeTokenRatio: 0, lexicalRedundancy: 0, hapaxLegomenaRatio: 0 },
    workflowExplanationTendency: { densityPer100Words: 0, proceduralMarkerCount: 0, tendencyScore: 0 },
    timestamp: new Date().toISOString(),
  };
}

export interface DocumentMetrics {
  avgSentenceLength: number;
  sentenceVariance?: string;
  lexicalDiversity: number;
  passiveRatio: number;
  transitionDensity: number;
  detectedCitationStyle: string;
  topTransitions?: string[];
  sampleCount: number;
  paragraphLength?: {
    averageWords: number;
    averageSentences: number;
    totalParagraphs: number;
  };
  punctuationHabits?: {
    semicolons: { count: number; per100Words: number };
    colons: { count: number; per100Words: number };
    emDashes: { count: number; per100Words: number };
    parentheses: { count: number; per100Words: number };
    commas: { count: number; per100Words: number };
  };
  passiveVsActive?: {
    activePercentage: number;
    passivePercentage: number;
    activeToPassiveRatio: string;
    summary: string;
  };
}

/**
 * Computes individual document metrics using the real StyleDNA extraction algorithms.
 */
export function computeDocumentMetrics(text: string): DocumentMetrics {
  const styleMetrics = extractStyleDNAFromTexts([text]);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const totalWords = Math.max(1, words.length);

  const passiveMatches = text.match(/\b(?:is|are|was|were|be|been|being)\s+[a-z]+(?:ed|en)\b/gi) || [];
  const passiveCount = passiveMatches.length;
  const sentencesCount = Math.max(1, styleMetrics.corpusSummary.totalSentences);
  const passivePerSentence = passiveCount / sentencesCount;
  const passiveRatio = Math.min(1, Math.round(passivePerSentence * 100) / 100);

  const passivePct = Math.round(Math.min(100, (passiveCount / Math.max(1, sentencesCount)) * 100));
  const activePct = 100 - passivePct;

  const bracketMatches = text.match(/\[\d+(?:,\s*\d+)*\]/g) || [];
  const authorDateMatches = text.match(/\([A-Z][a-zA-Z\s]+,\s*(?:19|20)\d{2}\)/g) || [];
  let detectedCitationStyle = "None detected";
  if (bracketMatches.length >= authorDateMatches.length && bracketMatches.length > 0) {
    detectedCitationStyle = `IEEE / ACM Numeric Brackets [1] (${bracketMatches.length} detected)`;
  } else if (authorDateMatches.length > 0) {
    detectedCitationStyle = `APA / Harvard Author-Date (Smith, 2024) (${authorDateMatches.length} detected)`;
  }

  return {
    avgSentenceLength: styleMetrics.sentenceLength.averageWords,
    sentenceVariance: styleMetrics.sentenceLength.stdDev > 7 ? "high" : "moderate",
    lexicalDiversity: styleMetrics.vocabularyRepetition.typeTokenRatio,
    passiveRatio,
    transitionDensity: styleMetrics.transitionFrequency.densityPer100Words,
    detectedCitationStyle,
    topTransitions: styleMetrics.transitionFrequency.topTransitions.map((t) => t.word),
    sampleCount: styleMetrics.corpusSummary.totalSentences,
    paragraphLength: styleMetrics.paragraphLength,
    punctuationHabits: {
      semicolons: {
        count: Math.round((styleMetrics.punctuationHabits.semicolonsPer100Words * totalWords) / 100),
        per100Words: styleMetrics.punctuationHabits.semicolonsPer100Words,
      },
      colons: {
        count: Math.round((styleMetrics.punctuationHabits.colonsPer100Words * totalWords) / 100),
        per100Words: styleMetrics.punctuationHabits.colonsPer100Words,
      },
      emDashes: {
        count: Math.round((styleMetrics.punctuationHabits.emDashesPer100Words * totalWords) / 100),
        per100Words: styleMetrics.punctuationHabits.emDashesPer100Words,
      },
      parentheses: {
        count: Math.round((styleMetrics.punctuationHabits.parenthesesPer100Words * totalWords) / 100),
        per100Words: styleMetrics.punctuationHabits.parenthesesPer100Words,
      },
      commas: {
        count: Math.round((styleMetrics.punctuationHabits.commasPer100Words * totalWords) / 100),
        per100Words: styleMetrics.punctuationHabits.commasPer100Words,
      },
    },
    passiveVsActive: {
      activePercentage: activePct,
      passivePercentage: passivePct,
      activeToPassiveRatio: `${(activePct / Math.max(1, passivePct)).toFixed(1)} : 1`,
      summary: `${activePct}% Active / ${passivePct}% Passive`,
    },
  };
}

/**
 * Builds a VoiceProfile from an array of TrainingDocuments without any mock or baseline texts.
 */
export function synthesizeVoiceProfileFromDocs(documents: any[]): any {
  if (!documents || documents.length === 0) {
    return null;
  }

  const texts = documents.map((d) => d.raw_text).filter(Boolean);
  if (texts.length === 0) {
    return null;
  }

  const metrics = extractStyleDNAFromTexts(texts);
  const totalWords = metrics.corpusSummary.totalWords;
  const topTrans = metrics.transitionFrequency.topTransitions.map((t) => t.word);

  const profileDir = path.join(process.cwd(), "data", "profile");
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, "voiceDNA.json"), JSON.stringify(metrics, null, 2), "utf-8");

  const synthesizedGuidelines = `# Calibrated Academic Voice Guidelines
- Maintain scholarly tone with deliberate syntactic rhythm (averaging ~${Math.round(metrics.sentenceLength.averageWords)} words/sentence).
- Transition density: ${metrics.transitionFrequency.densityPer100Words} per 100 words (favors: ${topTrans.slice(0, 5).join(", ") || "standard connectors"}).
- Strictly preserve all mathematical formulations, technical figures, statistical metrics, and bibliographic citations.
- Never use colloquialisms or generic conversational filler.`;

  return {
    id: "default-profile",
    name: "Learned Academic Voice Profile",
    is_active: 1,
    tone_descriptors: ["Analytical", "Precision-Oriented", "Objective"],
    sentence_cadence: metrics.sentenceLength,
    preferred_transitions: topTrans,
    rhetorical_habits: [
      "Frames theoretical context before empirical evidence",
      "Employs disciplined epistemic hedging",
      "Maintains scholarly syntactic cadence",
    ],
    synthesized_guidelines: synthesizedGuidelines,
    profile_json: JSON.stringify(metrics, null, 2),
    unified_profile: {
      version: "2.0",
      status: "Voice Learned",
      updatedAt: new Date().toISOString(),
      corpusSummary: {
        totalDocuments: documents.length,
        totalWords,
        totalSentences: metrics.corpusSummary.totalSentences,
        totalParagraphs: metrics.paragraphLength.totalParagraphs,
      },
      metrics,
    },
    updated_at: new Date().toISOString(),
  };
}

export interface StructuralChange {
  dimension: string;
  description: string;
  before: number | string;
  after: number | string;
  impact: string;
}

/**
 * Compares generated output vs user's manual edit to detect measurable structural changes.
 */
export function detectStructuralChanges(originalOutput: string, userEditedText: string): StructuralChange[] {
  const changes: StructuralChange[] = [];

  const metricsBefore = extractStyleDNAFromTexts([originalOutput]);
  const metricsAfter = extractStyleDNAFromTexts([userEditedText]);

  // 1. Sentence length shift
  const lenDiff = metricsAfter.sentenceLength.averageWords - metricsBefore.sentenceLength.averageWords;
  if (Math.abs(lenDiff) >= 1.5) {
    changes.push({
      dimension: "Sentence Length",
      description:
        lenDiff < 0
          ? `Shortened sentences from ~${Math.round(metricsBefore.sentenceLength.averageWords)} to ~${Math.round(metricsAfter.sentenceLength.averageWords)} words`
          : `Expanded sentences from ~${Math.round(metricsBefore.sentenceLength.averageWords)} to ~${Math.round(metricsAfter.sentenceLength.averageWords)} words`,
      before: metricsBefore.sentenceLength.averageWords,
      after: metricsAfter.sentenceLength.averageWords,
      impact: lenDiff < 0 ? "Favors punchier, more concise cadence" : "Favors expansive multi-clause elaboration",
    });
  }

  // 2. Clause density shift
  const clauseDiff =
    metricsAfter.clauseDensity.averageClausesPerSentence - metricsBefore.clauseDensity.averageClausesPerSentence;
  if (Math.abs(clauseDiff) >= 0.2) {
    changes.push({
      dimension: "Clause Density",
      description: clauseDiff < 0 ? "Streamlined compound/subordinate clauses" : "Increased syntactic subordination",
      before: metricsBefore.clauseDensity.averageClausesPerSentence,
      after: metricsAfter.clauseDensity.averageClausesPerSentence,
      impact: clauseDiff < 0 ? "Prefers linear, direct sentence structure" : "Prefers complex analytical nesting",
    });
  }

  // 3. Clarification markers
  const clarifDiff =
    metricsAfter.clarificationFrequency.totalClarifications - metricsBefore.clarificationFrequency.totalClarifications;
  if (clarifDiff > 0) {
    const afterMarkers = metricsAfter.clarificationFrequency.topMarkers.map((m) => m.marker);
    changes.push({
      dimension: "Clarification Habits",
      description: `Inserted clarification markers (${afterMarkers.join(", ") || "explanatory signposts"})`,
      before: metricsBefore.clarificationFrequency.totalClarifications,
      after: metricsAfter.clarificationFrequency.totalClarifications,
      impact: "Grounds theoretical statements with immediate clarifying definitions",
    });
  }

  // 4. Transitions
  const transDiff =
    metricsAfter.transitionFrequency.densityPer100Words - metricsBefore.transitionFrequency.densityPer100Words;
  if (Math.abs(transDiff) >= 0.3) {
    changes.push({
      dimension: "Transition Frequency",
      description: transDiff > 0 ? "Added explicit transitional signposts" : "Removed transitional clutter",
      before: metricsBefore.transitionFrequency.densityPer100Words,
      after: metricsAfter.transitionFrequency.densityPer100Words,
      impact: transDiff > 0 ? "Signposts deductive argument progression" : "Tighter narrative economy",
    });
  }

  // 5. Workflow/Procedural Markers
  const workflowDiff =
    metricsAfter.workflowExplanationTendency.tendencyScore -
    metricsBefore.workflowExplanationTendency.tendencyScore;
  if (Math.abs(workflowDiff) >= 5) {
    changes.push({
      dimension: "Workflow Structure",
      description: workflowDiff > 0 ? "Strengthened sequential procedural phrasing" : "Reduced procedural phrasing",
      before: metricsBefore.workflowExplanationTendency.tendencyScore,
      after: metricsAfter.workflowExplanationTendency.tendencyScore,
      impact: workflowDiff > 0 ? "Prefers step-by-step sequential workflow explanations" : "Conceptual framing",
    });
  }

  // 6. Punctuation habits
  const puncBefore = metricsBefore.punctuationHabits;
  const puncAfter = metricsAfter.punctuationHabits;
  if (puncAfter.semicolonsPer100Words > puncBefore.semicolonsPer100Words) {
    changes.push({
      dimension: "Punctuation Habit",
      description: "Added semicolon connectors between clauses",
      before: puncBefore.semicolonsPer100Words,
      after: puncAfter.semicolonsPer100Words,
      impact: "Prefers coordinating related assertions with semicolons",
    });
  }
  if (puncAfter.emDashesPer100Words > puncBefore.emDashesPer100Words) {
    changes.push({
      dimension: "Punctuation Habit",
      description: "Added em-dash interjections or emphasis",
      before: puncBefore.emDashesPer100Words,
      after: puncAfter.emDashesPer100Words,
      impact: "Employs em-dashes for appositive emphasis",
    });
  }

  return changes;
}

/**
 * Updates VoiceDNA profile metrics in data/profile/voiceDNA.json from manual edit.
 * Contains numbers and patterns only — NEVER copies previous sentences into the profile.
 */
export function updateVoiceDNAMetricsWithEdit(userEditedText: string): StyleDNAMetrics {
  const profileDir = path.join(process.cwd(), "data", "profile");
  const profilePath = path.join(profileDir, "voiceDNA.json");

  let currentMetrics: StyleDNAMetrics;
  if (fs.existsSync(profilePath)) {
    try {
      currentMetrics = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
    } catch {
      currentMetrics = getEmptyMetrics();
    }
  } else {
    currentMetrics = getEmptyMetrics();
  }

  const editMetrics = extractStyleDNAFromTexts([userEditedText]);

  // Blend metrics: 85% existing baseline, 15% new edit habits
  const alpha = 0.15;
  const blend = (curr: number, editVal: number) =>
    Math.round((curr * (1 - alpha) + editVal * alpha) * 100) / 100;

  currentMetrics.sentenceLength.averageWords = blend(
    currentMetrics.sentenceLength.averageWords,
    editMetrics.sentenceLength.averageWords
  );
  currentMetrics.clauseDensity.averageClausesPerSentence = blend(
    currentMetrics.clauseDensity.averageClausesPerSentence,
    editMetrics.clauseDensity.averageClausesPerSentence
  );
  currentMetrics.paragraphLength.averageWords = blend(
    currentMetrics.paragraphLength.averageWords,
    editMetrics.paragraphLength.averageWords
  );
  currentMetrics.transitionFrequency.densityPer100Words = blend(
    currentMetrics.transitionFrequency.densityPer100Words,
    editMetrics.transitionFrequency.densityPer100Words
  );
  currentMetrics.clarificationFrequency.densityPer100Words = blend(
    currentMetrics.clarificationFrequency.densityPer100Words,
    editMetrics.clarificationFrequency.densityPer100Words
  );
  currentMetrics.punctuationHabits.semicolonsPer100Words = blend(
    currentMetrics.punctuationHabits.semicolonsPer100Words,
    editMetrics.punctuationHabits.semicolonsPer100Words
  );
  currentMetrics.punctuationHabits.parenthesesPer100Words = blend(
    currentMetrics.punctuationHabits.parenthesesPer100Words,
    editMetrics.punctuationHabits.parenthesesPer100Words
  );
  currentMetrics.punctuationHabits.emDashesPer100Words = blend(
    currentMetrics.punctuationHabits.emDashesPer100Words,
    editMetrics.punctuationHabits.emDashesPer100Words
  );
  currentMetrics.workflowExplanationTendency.tendencyScore = blend(
    currentMetrics.workflowExplanationTendency.tendencyScore,
    editMetrics.workflowExplanationTendency.tendencyScore
  );
  currentMetrics.vocabularyRepetition.typeTokenRatio = blend(
    currentMetrics.vocabularyRepetition.typeTokenRatio,
    editMetrics.vocabularyRepetition.typeTokenRatio
  );
  currentMetrics.timestamp = new Date().toISOString();

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }
  fs.writeFileSync(profilePath, JSON.stringify(currentMetrics, null, 2), "utf-8");

  return currentMetrics;
}


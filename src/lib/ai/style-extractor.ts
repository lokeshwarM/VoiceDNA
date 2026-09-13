import fs from "fs";
import path from "path";
import { callLLM } from "./provider";
import { TrainingDocument, VoiceProfile, updateVoiceProfile, getActiveVoiceProfile } from "../db/queries";

export interface SentenceLengthMetrics {
  averageWords: number;
  variance: string;
  minWords: number;
  maxWords: number;
  distribution: {
    shortCount: number; // < 15 words
    mediumCount: number; // 15-25 words
    longCount: number; // > 25 words
  };
}

export interface ParagraphLengthMetrics {
  averageWords: number;
  averageSentences: number;
  totalParagraphs: number;
  minWords: number;
  maxWords: number;
}

export interface TransitionWordsMetrics {
  totalCount: number;
  densityPer100Words: number;
  topTransitions: { word: string; count: number }[];
  categoryBreakdown: {
    causal: number;
    contrast: number;
    additive: number;
    emphasis: number;
    sequential: number;
  };
}

export interface PunctuationHabitsMetrics {
  semicolons: { count: number; per100Words: number };
  colons: { count: number; per100Words: number };
  emDashes: { count: number; per100Words: number };
  parentheses: { count: number; per100Words: number };
  commas: { count: number; per100Words: number };
  quotes: { count: number; per100Words: number };
  summary: string;
}

export interface TechnicalVocabularyMetrics {
  acronyms: string[];
  topTechnicalTerms: string[];
  technicalTermDensity: number;
  uniqueTechnicalWordsCount: number;
}

export interface PassiveVsActiveMetrics {
  activeSentences: number;
  passiveSentences: number;
  activePercentage: number;
  passivePercentage: number;
  activeToPassiveRatio: string;
  summary: string;
}

export interface LinguisticMetrics {
  avgSentenceLength: number;
  sentenceVariance?: string;
  lexicalDiversity: number;
  passiveRatio: number;
  transitionDensity: number;
  detectedCitationStyle: string;
  topTransitions?: string[];
  sampleCount: number;
  sentenceLength: SentenceLengthMetrics;
  paragraphLength: ParagraphLengthMetrics;
  transitionWords: TransitionWordsMetrics;
  punctuationHabits: PunctuationHabitsMetrics;
  technicalVocabulary: TechnicalVocabularyMetrics;
  passiveVsActive: PassiveVsActiveMetrics;
}

export interface UnifiedVoiceDNAProfile {
  version: "1.0";
  status: "Voice Learned";
  updatedAt: string;
  corpusSummary: {
    totalDocuments: number;
    totalWords: number;
    totalSentences: number;
    totalParagraphs: number;
  };
  metrics: {
    sentenceLength: SentenceLengthMetrics;
    paragraphLength: ParagraphLengthMetrics;
    transitionWords: TransitionWordsMetrics;
    punctuationHabits: PunctuationHabitsMetrics;
    technicalVocabulary: TechnicalVocabularyMetrics;
    passiveVsActive: PassiveVsActiveMetrics;
  };
  toneDescriptors: string[];
  rhetoricalHabits: string[];
  synthesizedGuidelines: string;
}

const TRANSITION_CATEGORIES: Record<string, string[]> = {
  causal: [
    "consequently", "therefore", "thus", "hence", "accordingly",
    "thereby", "as a result", "inevitably"
  ],
  contrast: [
    "however", "conversely", "nevertheless", "nonetheless",
    "in contrast", "on the other hand", "although", "alternatively", "whereas"
  ],
  additive: [
    "furthermore", "moreover", "in addition", "additionally",
    "similarly", "likewise"
  ],
  emphasis: [
    "specifically", "notably", "significantly", "fundamentally",
    "in particular", "critically", "predominantly", "primarily"
  ],
  sequential: [
    "subsequently", "initially", "previously", "ultimately", "finally"
  ],
};

const COMMON_NON_TECHNICAL_WORDS = new Set([
  "the", "and", "that", "have", "for", "not", "with", "you", "this", "but", "his", "from",
  "they", "say", "her", "she", "will", "one", "all", "would", "there", "their", "what",
  "out", "about", "who", "get", "which", "go", "me", "when", "make", "can", "like", "time",
  "no", "just", "him", "know", "take", "people", "into", "year", "your", "good", "some",
  "could", "them", "see", "other", "than", "then", "now", "look", "only", "come", "its",
  "over", "think", "also", "back", "after", "use", "two", "how", "our", "work", "first",
  "well", "way", "even", "new", "want", "because", "any", "these", "give", "day", "most", "us"
]);

export function computeTextMetrics(text: string): LinguisticMetrics {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) {
    const emptySent: SentenceLengthMetrics = {
      averageWords: 0,
      variance: "low",
      minWords: 0,
      maxWords: 0,
      distribution: { shortCount: 0, mediumCount: 0, longCount: 0 },
    };
    const emptyPara: ParagraphLengthMetrics = {
      averageWords: 0,
      averageSentences: 0,
      totalParagraphs: 0,
      minWords: 0,
      maxWords: 0,
    };
    const emptyTrans: TransitionWordsMetrics = {
      totalCount: 0,
      densityPer100Words: 0,
      topTransitions: [],
      categoryBreakdown: { causal: 0, contrast: 0, additive: 0, emphasis: 0, sequential: 0 },
    };
    const emptyPunct: PunctuationHabitsMetrics = {
      semicolons: { count: 0, per100Words: 0 },
      colons: { count: 0, per100Words: 0 },
      emDashes: { count: 0, per100Words: 0 },
      parentheses: { count: 0, per100Words: 0 },
      commas: { count: 0, per100Words: 0 },
      quotes: { count: 0, per100Words: 0 },
      summary: "No punctuation data",
    };
    const emptyTech: TechnicalVocabularyMetrics = {
      acronyms: [],
      topTechnicalTerms: [],
      technicalTermDensity: 0,
      uniqueTechnicalWordsCount: 0,
    };
    const emptyVoice: PassiveVsActiveMetrics = {
      activeSentences: 0,
      passiveSentences: 0,
      activePercentage: 100,
      passivePercentage: 0,
      activeToPassiveRatio: "1 : 0",
      summary: "100% Active",
    };

    return {
      avgSentenceLength: 0,
      sentenceVariance: "low",
      lexicalDiversity: 0,
      passiveRatio: 0,
      transitionDensity: 0,
      detectedCitationStyle: "None",
      topTransitions: [],
      sampleCount: 0,
      sentenceLength: emptySent,
      paragraphLength: emptyPara,
      transitionWords: emptyTrans,
      punctuationHabits: emptyPunct,
      technicalVocabulary: emptyTech,
      passiveVsActive: emptyVoice,
    };
  }

  // 1. Sentence Analysis
  const sentenceDelim = /(?<=[.?!])\s+(?=[A-Z0-9])/g;
  const rawSentences = clean.split(sentenceDelim).filter((s) => s.trim().length > 8);
  const sentenceWordCounts = rawSentences.map((s) => s.trim().split(/\s+/).filter(Boolean).length);
  const totalWords = sentenceWordCounts.reduce((a, b) => a + b, 0);
  const avgSentenceLength = rawSentences.length > 0 ? Math.round((totalWords / rawSentences.length) * 10) / 10 : 0;

  let minWords = sentenceWordCounts.length > 0 ? Math.min(...sentenceWordCounts) : 0;
  let maxWords = sentenceWordCounts.length > 0 ? Math.max(...sentenceWordCounts) : 0;

  let varianceStr = "moderate";
  let shortCount = 0;
  let mediumCount = 0;
  let longCount = 0;

  sentenceWordCounts.forEach((len) => {
    if (len < 15) shortCount++;
    else if (len <= 25) mediumCount++;
    else longCount++;
  });

  if (sentenceWordCounts.length > 1) {
    const mean = avgSentenceLength;
    const variance = sentenceWordCounts.reduce((acc, len) => acc + Math.pow(len - mean, 2), 0) / sentenceWordCounts.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev < 5) varianceStr = "low (uniform sentence rhythm)";
    else if (stdDev > 11) varianceStr = "high (dynamic cadence with contrasting short & long sentences)";
    else varianceStr = "moderate (balanced academic rhythm)";
  }

  const sentenceLengthMetrics: SentenceLengthMetrics = {
    averageWords: avgSentenceLength,
    variance: varianceStr,
    minWords,
    maxWords,
    distribution: { shortCount, mediumCount, longCount },
  };

  // 2. Paragraph Length Analysis
  const rawParagraphs = clean.split(/\n\s*\n+/).filter((p) => p.trim().length > 15);
  const paraWordCounts = rawParagraphs.map((p) => p.trim().split(/\s+/).filter(Boolean).length);
  const paraSentCounts = rawParagraphs.map((p) => p.split(sentenceDelim).filter((s) => s.trim().length > 8).length);

  const totalParas = Math.max(1, rawParagraphs.length);
  const avgWordsPerPara = Math.round((totalWords / totalParas) * 10) / 10;
  const avgSentsPerPara = Math.round((rawSentences.length / totalParas) * 10) / 10;

  const paragraphLengthMetrics: ParagraphLengthMetrics = {
    averageWords: avgWordsPerPara,
    averageSentences: avgSentsPerPara,
    totalParagraphs: totalParas,
    minWords: paraWordCounts.length > 0 ? Math.min(...paraWordCounts) : 0,
    maxWords: paraWordCounts.length > 0 ? Math.max(...paraWordCounts) : 0,
  };

  // 3. Transition Words Analysis
  const lowerText = clean.toLowerCase();
  const foundTransitions: Record<string, number> = {};
  const categoryBreakdown = { causal: 0, contrast: 0, additive: 0, emphasis: 0, sequential: 0 };
  let totalTransitions = 0;

  for (const [cat, wordsList] of Object.entries(TRANSITION_CATEGORIES)) {
    for (const trans of wordsList) {
      const regex = new RegExp(`\\b${trans}\\b`, "g");
      const count = (lowerText.match(regex) || []).length;
      if (count > 0) {
        foundTransitions[trans] = (foundTransitions[trans] || 0) + count;
        (categoryBreakdown as any)[cat] += count;
        totalTransitions += count;
      }
    }
  }

  const sortedTransitions = Object.entries(foundTransitions)
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count }));

  const transitionWordsMetrics: TransitionWordsMetrics = {
    totalCount: totalTransitions,
    densityPer100Words: totalWords > 0 ? Math.round((totalTransitions / (totalWords / 100)) * 10) / 10 : 0,
    topTransitions: sortedTransitions.slice(0, 10),
    categoryBreakdown,
  };

  // 4. Punctuation Habits Analysis
  const calcPunct = (regex: RegExp) => {
    const count = (clean.match(regex) || []).length;
    const per100Words = totalWords > 0 ? Math.round((count / (totalWords / 100)) * 100) / 100 : 0;
    return { count, per100Words };
  };

  const semicolons = calcPunct(/;/g);
  const colons = calcPunct(/(?<!https?):/g);
  const emDashes = calcPunct(/(?:—|–|--)/g);
  const parentheses = calcPunct(/\(/g);
  const commas = calcPunct(/,/g);
  const quotes = calcPunct(/(?:"|“|”)/g);

  const punctSummaries: string[] = [];
  if (semicolons.count > 0) punctSummaries.push(`Uses semicolons (${semicolons.count}) for complex independent clauses`);
  if (emDashes.count > 0) punctSummaries.push(`Employs em-dashes (${emDashes.count}) for appositive emphasis`);
  if (parentheses.count > 0) punctSummaries.push(`Frequent parenthetical signposts and qualifications (${parentheses.count})`);
  if (colons.count > 0) punctSummaries.push(`Colons (${colons.count}) for deductive introducing`);

  const punctuationHabitsMetrics: PunctuationHabitsMetrics = {
    semicolons,
    colons,
    emDashes,
    parentheses,
    commas,
    quotes,
    summary: punctSummaries.length > 0 ? punctSummaries.join("; ") : "Standard academic punctuation with balanced commas.",
  };

  // 5. Technical Vocabulary Analysis
  // Acronyms (e.g. BFT, PBFT, GST, API, LLM, CPU)
  const acronyms = Array.from(new Set(clean.match(/\b[A-Z]{2,6}\b/g) || []));

  // Specialized terms: words >= 8 characters or specialized academic vocabulary
  const allWords = clean
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const uniqueWords = new Set(allWords);
  const lexicalDiversity = allWords.length > 0 ? Math.round((uniqueWords.size / allWords.length) * 100) / 100 : 0;

  const technicalWordsCount: Record<string, number> = {};
  let totalTechnicalOccurrences = 0;

  for (const w of allWords) {
    if (w.length >= 8 && !COMMON_NON_TECHNICAL_WORDS.has(w)) {
      technicalWordsCount[w] = (technicalWordsCount[w] || 0) + 1;
      totalTechnicalOccurrences++;
    }
  }

  const topTechnicalTerms = Object.entries(technicalWordsCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w);

  const technicalVocabularyMetrics: TechnicalVocabularyMetrics = {
    acronyms: acronyms.slice(0, 15),
    topTechnicalTerms,
    technicalTermDensity: totalWords > 0 ? Math.round((totalTechnicalOccurrences / totalWords) * 1000) / 10 : 0,
    uniqueTechnicalWordsCount: Object.keys(technicalWordsCount).length,
  };

  // 6. Passive vs Active Voice Ratio Analysis
  const passiveRegex = /\b(?:is|are|was|were|be|been|being)\s+([a-z]+ed|known|shown|found|derived|observed|analyzed|demonstrated|evaluated|obtained|conducted|established|measured|calculated|implemented|constructed|formulated|tested)\b/gi;
  let passiveSentenceCount = 0;
  for (const s of rawSentences) {
    if (passiveRegex.test(s)) {
      passiveSentenceCount++;
    }
  }

  const totalSents = Math.max(1, rawSentences.length);
  const activeSentenceCount = Math.max(0, totalSents - passiveSentenceCount);
  const activePercentage = Math.round((activeSentenceCount / totalSents) * 100);
  const passivePercentage = Math.round((passiveSentenceCount / totalSents) * 100);
  const ratioStr = passiveSentenceCount > 0
    ? `${(activeSentenceCount / passiveSentenceCount).toFixed(2)} : 1`
    : `${activeSentenceCount} : 0`;

  const passiveVsActiveMetrics: PassiveVsActiveMetrics = {
    activeSentences: activeSentenceCount,
    passiveSentences: passiveSentenceCount,
    activePercentage,
    passivePercentage,
    activeToPassiveRatio: ratioStr,
    summary: `${activePercentage}% Active / ${passivePercentage}% Passive (${activePercentage >= 60 ? "Favors active construction" : "Balanced passive scholarly tone"})`,
  };

  // Citation style detection
  let detectedCitationStyle = "Unspecified / Mixed";
  const numericCount = (clean.match(/\[\s*\d+\s*\]/g) || []).length;
  const authorDateCount = (clean.match(/\((?:[A-Z][a-zA-Z\s]+,?\s*(?:19|20)\d{2}[a-z]?)\)/g) || []).length;
  if (numericCount > authorDateCount && numericCount >= 2) {
    detectedCitationStyle = "IEEE / Numeric Bracket [1]";
  } else if (authorDateCount > 0) {
    detectedCitationStyle = "APA / Author-Year (Smith, 2022)";
  }

  return {
    avgSentenceLength,
    sentenceVariance: varianceStr,
    lexicalDiversity,
    passiveRatio: Math.round((passiveSentenceCount / totalSents) * 100) / 100,
    transitionDensity: transitionWordsMetrics.densityPer100Words,
    detectedCitationStyle,
    topTransitions: sortedTransitions.slice(0, 8).map((t) => t.word),
    sampleCount: rawSentences.length,
    sentenceLength: sentenceLengthMetrics,
    paragraphLength: paragraphLengthMetrics,
    transitionWords: transitionWordsMetrics,
    punctuationHabits: punctuationHabitsMetrics,
    technicalVocabulary: technicalVocabularyMetrics,
    passiveVsActive: passiveVsActiveMetrics,
  };
}

/**
 * Builds ONE unified VoiceDNA profile from all uploaded documents and saves it as one JSON file.
 */
export async function synthesizeVoiceProfile(documents: TrainingDocument[]): Promise<VoiceProfile> {
  const currentProfile = getActiveVoiceProfile();

  // If no documents exist, create a baseline profile
  if (!documents || documents.length === 0) {
    const baselineText = `Autonomous distributed consensus protocols fundamentally rely upon bounded message transmission delays to ensure safety and liveness under adversarial network partitions [1]. While classical Byzantine Fault Tolerant systems exhibit high communication complexity, modern architectures employ threshold cryptographic signatures to achieve linear complexity. Consequently, transaction finality can be evaluated with statistical bounds yielding p < 0.001. Furthermore, experimental results demonstrate that cryptographic aggregation reduces bandwidth overhead. In contrast to synchronous models, our empirical analysis indicates that partial synchrony preserves safety under arbitrary timing delays.`;
    const baselineMetrics = computeTextMetrics(baselineText);

    const unifiedProfile: UnifiedVoiceDNAProfile = {
      version: "1.0",
      status: "Voice Learned",
      updatedAt: new Date().toISOString(),
      corpusSummary: {
        totalDocuments: 0,
        totalWords: 0,
        totalSentences: 0,
        totalParagraphs: 0,
      },
      metrics: {
        sentenceLength: baselineMetrics.sentenceLength,
        paragraphLength: baselineMetrics.paragraphLength,
        transitionWords: baselineMetrics.transitionWords,
        punctuationHabits: baselineMetrics.punctuationHabits,
        technicalVocabulary: baselineMetrics.technicalVocabulary,
        passiveVsActive: baselineMetrics.passiveVsActive,
      },
      toneDescriptors: ["Analytical", "Nuanced", "Precision-Oriented", "Objective"],
      rhetoricalHabits: [
        "Frames theoretical context before empirical evidence",
        "Employs disciplined epistemic hedging (e.g. 'suggests', 'indicates')",
        "Uses active voice for author methodology and passive for experimental conditions",
      ],
      synthesizedGuidelines: `# Default Academic Voice Guidelines
- Maintain rigorous scholarly tone with deliberate syntactic rhythm (average ${baselineMetrics.sentenceLength.averageWords} words/sentence).
- Transition density: ${baselineMetrics.transitionWords.densityPer100Words} per 100 words.
- Strictly preserve all mathematical formulations, technical figures, and bibliographic citations.
- Never use colloquialisms or generic conversational filler.`,
    };

    saveProfileJsonToDisk(unifiedProfile);

    const defaultProfile: VoiceProfile = {
      id: "default-profile",
      name: "Default Academic Voice",
      is_active: 1,
      tone_descriptors: unifiedProfile.toneDescriptors,
      sentence_cadence: unifiedProfile.metrics.sentenceLength,
      preferred_transitions: unifiedProfile.metrics.transitionWords.topTransitions.map((t) => t.word),
      rhetorical_habits: unifiedProfile.rhetoricalHabits,
      synthesized_guidelines: unifiedProfile.synthesizedGuidelines,
      profile_json: JSON.stringify(unifiedProfile, null, 2),
      unified_profile: unifiedProfile,
      updated_at: unifiedProfile.updatedAt,
    };

    updateVoiceProfile(defaultProfile);
    return defaultProfile;
  }

  // Combine raw text from ALL uploaded documents to build ONE unified VoiceDNA profile
  const combinedCorpusText = documents.map((d) => d.raw_text).join("\n\n---\n\n");
  const aggregatedMetrics = computeTextMetrics(combinedCorpusText);

  let toneDescriptors = ["Analytical", "Precision-Oriented", "Nuanced", "Disciplined Hedging"];
  let rhetoricalHabits = [
    "Grounds theoretical claims in empirical context before deducing consequences",
    "Uses disciplined epistemic hedging (e.g. 'indicates', 'suggests', 'demonstrates')",
    "Favors structured paragraph topic sentences followed by analytical elaboration",
  ];

  const topTransWords = aggregatedMetrics.transitionWords.topTransitions.map((t) => t.word);
  const acronymsList = aggregatedMetrics.technicalVocabulary.acronyms.slice(0, 10);
  const techTermsList = aggregatedMetrics.technicalVocabulary.topTechnicalTerms.slice(0, 10);

  let guidelines = `# Academic Voice Blueprint (Derived from ${documents.length} Documents)
- Sentence Cadence: Average ${aggregatedMetrics.sentenceLength.averageWords} words per sentence (${aggregatedMetrics.sentenceLength.variance}).
- Paragraph Structure: Average ${aggregatedMetrics.paragraphLength.averageWords} words (${aggregatedMetrics.paragraphLength.averageSentences} sentences) per paragraph.
- Logical Transitions: ${topTransWords.slice(0, 6).join(", ") || "furthermore, consequently, notably, in contrast"}.
- Voice Distribution: ${aggregatedMetrics.passiveVsActive.summary}.
- Punctuation Signature: ${aggregatedMetrics.punctuationHabits.summary}.
- Technical Lexicon: ${acronymsList.join(", ")} | Specialized terms: ${techTermsList.join(", ")}.
- Strict Preservation: Retain 100% of all mathematical formulations, statistics, measurements, and bibliographic citations.
- Novelty: Never copy previous sentences verbatim.`;

  // Attempt LLM qualitative refinement if provider is active
  try {
    const sampleExcerpts = documents
      .slice(0, 4)
      .map((d) => `--- Excerpt from "${d.title}" ---\n${d.raw_text.slice(0, 1200)}...`)
      .join("\n\n");

    const prompt = `You are an expert computational linguist. Analyze excerpts from a researcher's academic documents:

${sampleExcerpts}

Calculated Quantitative Profile from ALL documents:
- Average sentence length: ${aggregatedMetrics.sentenceLength.averageWords} words
- Average paragraph length: ${aggregatedMetrics.paragraphLength.averageWords} words (${aggregatedMetrics.paragraphLength.averageSentences} sentences)
- Transition words frequency: ${topTransWords.slice(0, 8).join(", ")}
- Punctuation habits: ${aggregatedMetrics.punctuationHabits.summary}
- Technical vocabulary: ${acronymsList.join(", ")} | ${techTermsList.join(", ")}
- Passive vs Active: ${aggregatedMetrics.passiveVsActive.summary}

Generate a concise Voice DNA summary in valid JSON matching this schema:
{
  "tone_descriptors": ["string", "string", "string", "string"],
  "rhetorical_habits": ["string", "string", "string"],
  "synthesized_guidelines": "Comprehensive markdown guidelines instructing an LLM how to write in this author's exact academic cadence, vocabulary level, argumentation style, and sentence structure without ever copying original sentences."
}`;

    const rawResponse = await callLLM({
      messages: [
        { role: "system", content: "You analyze academic writing styles and output JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      jsonMode: true,
    });

    const parsed = JSON.parse(rawResponse);
    if (parsed.tone_descriptors && Array.isArray(parsed.tone_descriptors)) {
      toneDescriptors = parsed.tone_descriptors;
    }
    if (parsed.rhetorical_habits && Array.isArray(parsed.rhetorical_habits)) {
      rhetoricalHabits = parsed.rhetorical_habits;
    }
    if (parsed.synthesized_guidelines && typeof parsed.synthesized_guidelines === "string") {
      guidelines = parsed.synthesized_guidelines;
    }
  } catch (err: any) {
    console.warn("LLM profile synthesis fallback to deterministic metrics:", err.message);
  }

  // Construct ONE single unified JSON profile
  const totalWords = documents.reduce((acc, d) => acc + d.word_count, 0);
  const unifiedProfile: UnifiedVoiceDNAProfile = {
    version: "1.0",
    status: "Voice Learned",
    updatedAt: new Date().toISOString(),
    corpusSummary: {
      totalDocuments: documents.length,
      totalWords,
      totalSentences: aggregatedMetrics.sampleCount,
      totalParagraphs: aggregatedMetrics.paragraphLength.totalParagraphs,
    },
    metrics: {
      sentenceLength: aggregatedMetrics.sentenceLength,
      paragraphLength: aggregatedMetrics.paragraphLength,
      transitionWords: aggregatedMetrics.transitionWords,
      punctuationHabits: aggregatedMetrics.punctuationHabits,
      technicalVocabulary: aggregatedMetrics.technicalVocabulary,
      passiveVsActive: aggregatedMetrics.passiveVsActive,
    },
    toneDescriptors,
    rhetoricalHabits,
    synthesizedGuidelines: guidelines,
  };

  // Save profile as ONE JSON file on disk
  saveProfileJsonToDisk(unifiedProfile);

  const newProfile: VoiceProfile = {
    id: currentProfile?.id || "default-profile",
    name: "Learned Academic Voice Profile",
    is_active: 1,
    tone_descriptors: toneDescriptors,
    sentence_cadence: aggregatedMetrics.sentenceLength,
    preferred_transitions: topTransWords,
    rhetorical_habits: rhetoricalHabits,
    synthesized_guidelines: guidelines,
    profile_json: JSON.stringify(unifiedProfile, null, 2),
    unified_profile: unifiedProfile,
    updated_at: unifiedProfile.updatedAt,
  };

  updateVoiceProfile(newProfile);
  return newProfile;
}

function saveProfileJsonToDisk(profile: UnifiedVoiceDNAProfile) {
  try {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const filePath = path.join(dataDir, "voicedna_profile.json");
    fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), "utf-8");
  } catch (err: any) {
    console.warn("Could not save profile JSON to data/voicedna_profile.json:", err.message);
  }
}

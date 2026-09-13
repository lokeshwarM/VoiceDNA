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
    averageWords: number | null;
    medianWords: number | null;
    minWords: number | null;
    maxWords: number | null;
    stdDev: number | null;
    distribution: {
      shortPercent: number; // < 14 words
      mediumPercent: number; // 14 - 26 words
      longPercent: number; // > 26 words
    } | null;
  };
  clauseDensity: {
    averageClausesPerSentence: number | null;
    subordinateClauseRatio: number | null;
    coordinationRatio: number | null;
  };
  paragraphLength: {
    averageSentences: number | null;
    averageWords: number | null;
    totalParagraphs: number;
  };
  transitionFrequency: {
    densityPer100Words: number | null;
    categoryRatios: {
      causal: number;
      adversative: number;
      additive: number;
      sequential: number;
      emphasis: number;
    };
    topTransitions: { word: string; count: number }[];
    totalTransitions: number;
  };
  clarificationFrequency: {
    densityPer100Words: number | null;
    occurrencesPer10Sentences: number | null;
    totalClarifications: number;
    topMarkers: { marker: string; count: number }[];
  };
  punctuationHabits: {
    semicolonsPer100Words: number | null;
    colonsPer100Words: number | null;
    emDashesPer100Words: number | null;
    parenthesesPer100Words: number | null;
    commasPer100Words: number | null;
    quotesPer100Words: number | null;
    questionsPer100Sentences: number | null;
  };
  vocabularyRepetition: {
    typeTokenRatio: number | null; // Unique words / Total words
    lexicalRedundancy: number | null; // 1 - TTR
    hapaxLegomenaRatio: number | null; // % of words used only once
  };
  workflowExplanationTendency: {
    densityPer100Words: number | null;
    proceduralMarkerCount: number;
    tendencyScore: number | null; // 0 to 100
  };
  timestamp: string;
}

export const ACADEMIC_ABBREVIATIONS = [
  "e.g.", "i.e.", "et al.", "cf.", "vs.", "approx.", "fig.", "figs.", "eq.", "eqs.",
  "ref.", "refs.", "no.", "vol.", "pp.", "dr.", "prof.", "dept.", "univ.", "sec.",
  "mr.", "mrs.", "ms.", "al.", "etc.", "ph.d.", "m.s.", "b.s.", "u.s.", "ai."
];

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

export interface TextParagraph {
  text: string;
  words: number;
  sentences: number;
}

export interface TextSentence {
  text: string;
  words: number;
}

export interface TextStructure {
  paragraphs: TextParagraph[];
  sentences: TextSentence[];
  words: number;
}

/**
 * Deterministically splits raw text into paragraphs and sentences.
 * Safely handles abbreviations, decimals, quotations, URLs, initials, and common academic punctuation.
 * Guarantees mathematical invariants:
 *   sum(paragraphs.words) == sum(sentences.words) == words
 *   sum(paragraphs.sentences) == sentences.length
 */
export function analyzeTextStructure(text: string): TextStructure {
  if (!text || !text.trim()) {
    return {
      paragraphs: [],
      sentences: [],
      words: 0,
    };
  }

  // 1. Separate paragraphs strictly by double newlines (or runs of newlines with whitespace)
  const rawParagraphs = text
    .split(/\r?\n\s*\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const paragraphs: TextParagraph[] = [];
  const allSentences: TextSentence[] = [];
  let totalWordCount = 0;

  for (const paraText of rawParagraphs) {
    let sanitized = paraText;

    // A. Protect URLs and emails
    const urls: string[] = [];
    sanitized = sanitized.replace(/(?:https?:\/\/|www\.)[^\s]+/gi, (m) => {
      urls.push(m);
      return `__URL_${urls.length - 1}__`;
    });

    // B. Protect decimal numbers (e.g. 8.2, 3.14, p < .05)
    const decimals: string[] = [];
    sanitized = sanitized.replace(/(?<=\s|^|[([<>=])\d+\.\d+(?=\s|$|[,;:)\]>])/g, (m) => {
      decimals.push(m);
      return `__DEC_${decimals.length - 1}__`;
    });

    // C. Protect academic abbreviations
    const abbrevs: string[] = [];
    for (const abbr of ACADEMIC_ABBREVIATIONS) {
      const escaped = abbr.replace(/\./g, "\\.");
      const regex = new RegExp(`\\b${escaped}`, "gi");
      sanitized = sanitized.replace(regex, (m) => {
        abbrevs.push(m);
        return `__ABBR_${abbrevs.length - 1}__`;
      });
    }

    // D. Protect single-letter initials followed by period (e.g., J. Smith)
    const initials: string[] = [];
    sanitized = sanitized.replace(/\b([A-Z])\.\s+(?=[A-Z])/g, (m) => {
      initials.push(m);
      return `__INIT_${initials.length - 1}__`;
    });

    // E. Protect ellipses
    sanitized = sanitized.replace(/\.{3,}/g, "…");

    // F. Segment sentences within paragraph:
    // A sentence ends with [.?!…] optionally followed by closing quotes, brackets, or parentheses,
    // followed by whitespace or end of string.
    const sentenceBoundary = /([.?!…]+['"”’\)\]]*)(?:\s+|$)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    const restore = (str: string) => {
      let r = str;
      r = r.replace(/__URL_(\d+)__/g, (_, idx) => urls[Number(idx)]);
      r = r.replace(/__DEC_(\d+)__/g, (_, idx) => decimals[Number(idx)]);
      r = r.replace(/__ABBR_(\d+)__/g, (_, idx) => abbrevs[Number(idx)]);
      r = r.replace(/__INIT_(\d+)__/g, (_, idx) => initials[Number(idx)]);
      return r;
    };

    const paraSentences: TextSentence[] = [];

    while ((match = sentenceBoundary.exec(sanitized)) !== null) {
      const boundaryEnd = match.index + match[0].length;
      const rawSent = sanitized.substring(lastIndex, boundaryEnd).trim();
      lastIndex = boundaryEnd;

      if (rawSent) {
        const restored = restore(rawSent);
        const words = restored.split(/\s+/).filter(Boolean);
        if (words.length > 0) {
          const sentObj = { text: restored, words: words.length };
          paraSentences.push(sentObj);
          allSentences.push(sentObj);
          totalWordCount += words.length;
        }
      }
    }

    // Handle trailing text in paragraph without terminal punctuation (e.g. note or bullet point)
    if (lastIndex < sanitized.length) {
      const trailing = sanitized.substring(lastIndex).trim();
      if (trailing) {
        const restored = restore(trailing);
        const words = restored.split(/\s+/).filter(Boolean);
        if (words.length > 0) {
          const sentObj = { text: restored, words: words.length };
          paraSentences.push(sentObj);
          allSentences.push(sentObj);
          totalWordCount += words.length;
        }
      }
    }

    const paraWordCount = paraSentences.reduce((acc, s) => acc + s.words, 0);
    paragraphs.push({
      text: paraText,
      words: paraWordCount,
      sentences: paraSentences.length,
    });
  }

  return {
    paragraphs,
    sentences: allSentences,
    words: totalWordCount,
  };
}

/**
 * Extracts strictly numerical and pattern-based StyleDNA metrics from all processed texts.
 * Pure deterministic mathematical calculation — NEVER uses or infers statistics with an LLM.
 */
export function extractStyleDNAFromTexts(corpusTexts: string[]): StyleDNAMetrics {
  const nonEmptyTexts = corpusTexts.filter((t) => t && t.trim().length > 0);

  if (nonEmptyTexts.length === 0) {
    return getEmptyMetrics();
  }

  // Combine and structure text
  const combinedText = nonEmptyTexts.join("\n\n").trim();
  const structure = analyzeTextStructure(combinedText);

  const totalWords = structure.words;
  const totalSentences = structure.sentences.length;
  const totalParagraphs = structure.paragraphs.length;

  if (totalWords === 0 || totalSentences === 0) {
    return getEmptyMetrics();
  }

  // 1. Sentence length metrics
  const sentenceWordCounts = structure.sentences.map((s) => s.words);
  const avgSentenceLength = Math.round((totalWords / totalSentences) * 10) / 10;

  sentenceWordCounts.sort((a, b) => a - b);
  const medianWords = sentenceWordCounts[Math.floor(sentenceWordCounts.length / 2)] ?? null;
  const minWords = sentenceWordCounts[0] ?? null;
  const maxWords = sentenceWordCounts[sentenceWordCounts.length - 1] ?? null;

  let stdDev: number | null = null;
  if (totalSentences >= 2) {
    const variance =
      sentenceWordCounts.reduce((acc, len) => acc + Math.pow(len - (totalWords / totalSentences), 2), 0) /
      totalSentences;
    stdDev = Math.round(Math.sqrt(variance) * 10) / 10;
  }

  let distribution: { shortPercent: number; mediumPercent: number; longPercent: number } | null = null;
  if (totalSentences >= 1) {
    let shortCount = 0;
    let mediumCount = 0;
    let longCount = 0;
    for (const len of sentenceWordCounts) {
      if (len < 14) shortCount++;
      else if (len <= 26) mediumCount++;
      else longCount++;
    }
    const shortPct = Math.round((shortCount / totalSentences) * 100);
    const medPct = Math.round((mediumCount / totalSentences) * 100);
    // Guarantee distribution percentages sum to exactly 100%
    const longPct = 100 - (shortPct + medPct);
    distribution = { shortPercent: shortPct, mediumPercent: medPct, longPercent: Math.max(0, longPct) };
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
  const subordinateClauseRatio = Math.round((subordinateCount / totalSentences) * 100) / 100;
  const coordinationRatio = Math.round((coordinationCount / totalSentences) * 100) / 100;

  // 3. Paragraph length
  const avgParaWords = totalParagraphs > 0 ? Math.round((totalWords / totalParagraphs) * 10) / 10 : null;
  const avgParaSentences = totalParagraphs > 0 ? Math.round((totalSentences / totalParagraphs) * 10) / 10 : null;

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

  const transDensityPer100Words = Math.round((totalTransitions / (totalWords / 100)) * 10) / 10;

  const categoryRatios = {
    causal: totalTransitions > 0 ? Math.round((transCounts.causal / totalTransitions) * 100) : 0,
    adversative: totalTransitions > 0 ? Math.round((transCounts.adversative / totalTransitions) * 100) : 0,
    additive: totalTransitions > 0 ? Math.round((transCounts.additive / totalTransitions) * 100) : 0,
    sequential: totalTransitions > 0 ? Math.round((transCounts.sequential / totalTransitions) * 100) : 0,
    emphasis: totalTransitions > 0 ? Math.round((transCounts.emphasis / totalTransitions) * 100) : 0,
  };

  // 5. Clarification frequency (safe word boundaries for markers with trailing punctuation)
  const clarificationCounts: Record<string, number> = {};
  let totalClarifications = 0;
  for (const marker of CLARIFICATION_MARKERS) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hasNonWordEnd = /\W$/.test(marker);
    const re = hasNonWordEnd
      ? new RegExp(`(?:^|\\s|[([{"'])${escaped}(?=[\\s,;:!?)\]"']|$)`, "gi")
      : new RegExp(`\\b${escaped}\\b`, "gi");
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

  const clarificationDensityPer100 = Math.round((totalClarifications / (totalWords / 100)) * 100) / 100;
  const clarificationPer10Sentences = Math.round((totalClarifications / (totalSentences / 10)) * 10) / 10;

  // 6. Punctuation habits per 100 words
  const calcPunctPer100 = (regex: RegExp) => {
    const count = (combinedText.match(regex) || []).length;
    return Math.round((count / (totalWords / 100)) * 100) / 100;
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
  let typeTokenRatio: number | null = null;
  let lexicalRedundancy: number | null = null;
  let hapaxLegomenaRatio: number | null = null;

  if (totalWords >= 20) {
    const allTokens = lowerText.replace(/[^\w\s]/g, "").split(/\s+/).filter((w) => w.length > 1);
    const wordFreq: Record<string, number> = {};
    for (const w of allTokens) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }

    const uniqueWordCount = Object.keys(wordFreq).length;
    if (allTokens.length > 0) {
      typeTokenRatio = Math.round((uniqueWordCount / allTokens.length) * 1000) / 1000;
      lexicalRedundancy = Math.round((1 - typeTokenRatio) * 1000) / 1000;
      let hapaxCount = 0;
      for (const count of Object.values(wordFreq)) {
        if (count === 1) hapaxCount++;
      }
      hapaxLegomenaRatio = uniqueWordCount > 0 ? Math.round((hapaxCount / uniqueWordCount) * 1000) / 1000 : null;
    }
  }

  // 8. Workflow explanation tendency
  let proceduralCount = 0;
  for (const wm of WORKFLOW_MARKERS) {
    const re = new RegExp(`\\b${wm}\\b`, "g");
    const m = lowerText.match(re);
    if (m) proceduralCount += m.length;
  }

  const workflowDensityPer100 = Math.round((proceduralCount / (totalWords / 100)) * 10) / 10;
  const tendencyScore = Math.min(100, Math.round(workflowDensityPer100 * 25));

  const result: StyleDNAMetrics = {
    corpusSummary: {
      totalFiles: nonEmptyTexts.length,
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
      distribution,
    },
    clauseDensity: {
      averageClausesPerSentence: avgClausesPerSentence,
      subordinateClauseRatio,
      coordinationRatio,
    },
    paragraphLength: {
      averageSentences: avgParaSentences,
      averageWords: avgParaWords,
      totalParagraphs,
    },
    transitionFrequency: {
      densityPer100Words: transDensityPer100Words,
      categoryRatios,
      topTransitions,
      totalTransitions,
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

  return result;
}

/**
 * Validation layer that detects impossible, contradictory, or inconsistent metrics.
 * Ensures strict mathematical trustworthiness before writing to disk.
 */
export function validateStyleDNAMetrics(metrics: StyleDNAMetrics): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const { totalFiles, totalWords, totalSentences, totalParagraphs } = metrics.corpusSummary;

  if (totalFiles < 0) errors.push(`Negative totalFiles: ${totalFiles}`);
  if (totalWords < 0) errors.push(`Negative totalWords: ${totalWords}`);
  if (totalSentences < 0) errors.push(`Negative totalSentences: ${totalSentences}`);
  if (totalParagraphs < 0) errors.push(`Negative totalParagraphs: ${totalParagraphs}`);

  if (totalWords === 0) {
    if (totalSentences !== 0) errors.push(`Inconsistency: totalWords is 0 but totalSentences is ${totalSentences}`);
    if (totalParagraphs !== 0) errors.push(`Inconsistency: totalWords is 0 but totalParagraphs is ${totalParagraphs}`);
  } else {
    if (totalSentences < 1) errors.push(`totalWords is ${totalWords} but totalSentences is ${totalSentences}`);
    if (totalParagraphs < 1) errors.push(`totalWords is ${totalWords} but totalParagraphs is ${totalParagraphs}`);
    if (totalParagraphs > totalSentences) {
      errors.push(`Impossible: totalParagraphs (${totalParagraphs}) exceeds totalSentences (${totalSentences})`);
    }

    // Sentence length invariant: totalWords / totalSentences == averageWords within rounding tolerance (0.15)
    if (metrics.sentenceLength.averageWords !== null) {
      const expectedAvg = totalWords / totalSentences;
      const diff = Math.abs(metrics.sentenceLength.averageWords - expectedAvg);
      if (diff > 0.15) {
        errors.push(
          `Sentence length invariant violated: averageWords (${metrics.sentenceLength.averageWords}) differs from totalWords/totalSentences (${expectedAvg.toFixed(2)}) by ${diff.toFixed(2)}`
        );
      }
    } else {
      errors.push("Sentence length averageWords is null despite totalWords > 0");
    }

    if (
      metrics.sentenceLength.minWords !== null &&
      metrics.sentenceLength.maxWords !== null &&
      metrics.sentenceLength.minWords > metrics.sentenceLength.maxWords
    ) {
      errors.push(
        `Sentence length minWords (${metrics.sentenceLength.minWords}) > maxWords (${metrics.sentenceLength.maxWords})`
      );
    }

    if (
      metrics.sentenceLength.medianWords !== null &&
      metrics.sentenceLength.minWords !== null &&
      metrics.sentenceLength.maxWords !== null
    ) {
      if (
        metrics.sentenceLength.medianWords < metrics.sentenceLength.minWords ||
        metrics.sentenceLength.medianWords > metrics.sentenceLength.maxWords
      ) {
        errors.push(
          `Sentence length medianWords (${metrics.sentenceLength.medianWords}) out of bounds [${metrics.sentenceLength.minWords}, ${metrics.sentenceLength.maxWords}]`
        );
      }
    }

    if (metrics.sentenceLength.distribution) {
      const sumDist =
        metrics.sentenceLength.distribution.shortPercent +
        metrics.sentenceLength.distribution.mediumPercent +
        metrics.sentenceLength.distribution.longPercent;
      if (Math.abs(sumDist - 100) > 2) {
        errors.push(`Sentence distribution percentages do not sum to ~100%: ${sumDist}%`);
      }
    }

    // Paragraph length invariant
    if (metrics.paragraphLength.totalParagraphs !== totalParagraphs) {
      errors.push(
        `Paragraph count mismatch: paragraphLength.totalParagraphs (${metrics.paragraphLength.totalParagraphs}) !== corpusSummary.totalParagraphs (${totalParagraphs})`
      );
    }
    if (metrics.paragraphLength.averageWords !== null) {
      const expectedParaWords = totalWords / totalParagraphs;
      const diff = Math.abs(metrics.paragraphLength.averageWords - expectedParaWords);
      if (diff > 0.15) {
        errors.push(
          `Paragraph words invariant violated: averageWords (${metrics.paragraphLength.averageWords}) differs from totalWords/totalParagraphs (${expectedParaWords.toFixed(2)}) by ${diff.toFixed(2)}`
        );
      }
    }
    if (metrics.paragraphLength.averageSentences !== null) {
      const expectedParaSentences = totalSentences / totalParagraphs;
      const diff = Math.abs(metrics.paragraphLength.averageSentences - expectedParaSentences);
      if (diff > 0.15) {
        errors.push(
          `Paragraph sentences invariant violated: averageSentences (${metrics.paragraphLength.averageSentences}) differs from totalSentences/totalParagraphs (${expectedParaSentences.toFixed(2)}) by ${diff.toFixed(2)}`
        );
      }
    }

    // Clause density invariant
    if (metrics.clauseDensity.averageClausesPerSentence !== null) {
      if (metrics.clauseDensity.averageClausesPerSentence < 1.0) {
        errors.push(
          `Invalid averageClausesPerSentence: ${metrics.clauseDensity.averageClausesPerSentence} (< 1.0)`
        );
      }
    }

    // Vocabulary TTR invariant
    if (metrics.vocabularyRepetition.typeTokenRatio !== null) {
      const ttr = metrics.vocabularyRepetition.typeTokenRatio;
      if (ttr < 0 || ttr > 1) {
        errors.push(`Invalid typeTokenRatio: ${ttr} (must be 0 <= TTR <= 1)`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
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

  // Validate before saving
  const validation = validateStyleDNAMetrics(metrics);
  if (!validation.valid) {
    throw new Error(`StyleDNA mathematical validation failed: ${validation.errors.join("; ")}`);
  }

  // Save validated metrics to data/profile/voiceDNA.json
  const profilePath = path.join(profileDir, "voiceDNA.json");
  fs.writeFileSync(profilePath, JSON.stringify(metrics, null, 2), "utf-8");

  return metrics;
}

export function getEmptyMetrics(): StyleDNAMetrics {
  return {
    corpusSummary: { totalFiles: 0, totalWords: 0, totalSentences: 0, totalParagraphs: 0 },
    sentenceLength: {
      averageWords: null,
      medianWords: null,
      minWords: null,
      maxWords: null,
      stdDev: null,
      distribution: null,
    },
    clauseDensity: {
      averageClausesPerSentence: null,
      subordinateClauseRatio: null,
      coordinationRatio: null,
    },
    paragraphLength: {
      averageSentences: null,
      averageWords: null,
      totalParagraphs: 0,
    },
    transitionFrequency: {
      densityPer100Words: null,
      categoryRatios: { causal: 0, adversative: 0, additive: 0, sequential: 0, emphasis: 0 },
      topTransitions: [],
      totalTransitions: 0,
    },
    clarificationFrequency: {
      densityPer100Words: null,
      occurrencesPer10Sentences: null,
      totalClarifications: 0,
      topMarkers: [],
    },
    punctuationHabits: {
      semicolonsPer100Words: null,
      colonsPer100Words: null,
      emDashesPer100Words: null,
      parenthesesPer100Words: null,
      commasPer100Words: null,
      quotesPer100Words: null,
      questionsPer100Sentences: null,
    },
    vocabularyRepetition: {
      typeTokenRatio: null,
      lexicalRedundancy: null,
      hapaxLegomenaRatio: null,
    },
    workflowExplanationTendency: {
      densityPer100Words: null,
      proceduralMarkerCount: 0,
      tendencyScore: null,
    },
    timestamp: new Date().toISOString(),
  };
}

export interface DocumentMetrics {
  avgSentenceLength: number | null;
  sentenceVariance?: string;
  lexicalDiversity: number | null;
  passiveRatio: number;
  transitionDensity: number | null;
  detectedCitationStyle: string;
  topTransitions?: string[];
  sampleCount: number;
  paragraphLength?: {
    averageWords: number | null;
    averageSentences: number | null;
    totalParagraphs: number;
  };
  punctuationHabits?: {
    semicolons: { count: number; per100Words: number | null };
    colons: { count: number; per100Words: number | null };
    emDashes: { count: number; per100Words: number | null };
    parentheses: { count: number; per100Words: number | null };
    commas: { count: number; per100Words: number | null };
  };
  passiveVsActive?: {
    activePercentage: number;
    passivePercentage: number;
    activeToPassiveRatio: string;
    summary: string;
  };
}

/**
 * Computes individual document metrics using the deterministic StyleDNA extraction algorithm.
 */
export function computeDocumentMetrics(text: string): DocumentMetrics {
  const styleMetrics = extractStyleDNAFromTexts([text]);
  const totalWords = styleMetrics.corpusSummary.totalWords;
  const totalSentences = styleMetrics.corpusSummary.totalSentences;

  const passiveMatches = text.match(/\b(?:is|are|was|were|be|been|being)\s+[a-z]+(?:ed|en)\b/gi) || [];
  const passiveCount = passiveMatches.length;
  const passivePerSentence = totalSentences > 0 ? passiveCount / totalSentences : 0;
  const passiveRatio = Math.min(1, Math.round(passivePerSentence * 100) / 100);

  const passivePct = totalSentences > 0 ? Math.round(Math.min(100, (passiveCount / totalSentences) * 100)) : 0;
  const activePct = 100 - passivePct;

  const bracketMatches = text.match(/\[\d+(?:,\s*\d+)*\]/g) || [];
  const authorDateMatches = text.match(/\([A-Z][a-zA-Z\s]+,\s*(?:19|20)\d{2}\)/g) || [];
  let detectedCitationStyle = "None detected";
  if (bracketMatches.length >= authorDateMatches.length && bracketMatches.length > 0) {
    detectedCitationStyle = `IEEE / ACM Numeric Brackets [1] (${bracketMatches.length} detected)`;
  } else if (authorDateMatches.length > 0) {
    detectedCitationStyle = `APA / Harvard Author-Date (Smith, 2024) (${authorDateMatches.length} detected)`;
  }

  const punct = styleMetrics.punctuationHabits;
  const puncCalc = (per100: number | null) => ({
    count: per100 !== null ? Math.round((per100 * totalWords) / 100) : 0,
    per100Words: per100,
  });

  return {
    avgSentenceLength: styleMetrics.sentenceLength.averageWords,
    sentenceVariance: (styleMetrics.sentenceLength.stdDev ?? 0) > 7 ? "high" : "moderate",
    lexicalDiversity: styleMetrics.vocabularyRepetition.typeTokenRatio,
    passiveRatio,
    transitionDensity: styleMetrics.transitionFrequency.densityPer100Words,
    detectedCitationStyle,
    topTransitions: styleMetrics.transitionFrequency.topTransitions.map((t) => t.word),
    sampleCount: totalSentences,
    paragraphLength: styleMetrics.paragraphLength,
    punctuationHabits: {
      semicolons: puncCalc(punct.semicolonsPer100Words),
      colons: puncCalc(punct.colonsPer100Words),
      emDashes: puncCalc(punct.emDashesPer100Words),
      parentheses: puncCalc(punct.parenthesesPer100Words),
      commas: puncCalc(punct.commasPer100Words),
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

  const validation = validateStyleDNAMetrics(metrics);
  if (!validation.valid) {
    throw new Error(`StyleDNA mathematical validation failed: ${validation.errors.join("; ")}`);
  }

  const profileDir = path.join(process.cwd(), "data", "profile");
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, "voiceDNA.json"), JSON.stringify(metrics, null, 2), "utf-8");

  const avgLenDisplay = metrics.sentenceLength.averageWords !== null ? `~${Math.round(metrics.sentenceLength.averageWords)}` : "moderate";
  const transDensityDisplay = metrics.transitionFrequency.densityPer100Words !== null ? `${metrics.transitionFrequency.densityPer100Words}` : "standard";

  const synthesizedGuidelines = `# Calibrated Academic Voice Guidelines
- Maintain scholarly tone with deliberate syntactic rhythm (averaging ${avgLenDisplay} words/sentence).
- Transition density: ${transDensityDisplay} per 100 words (favors: ${topTrans.slice(0, 5).join(", ") || "standard connectors"}).
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
  if (metricsBefore.sentenceLength.averageWords !== null && metricsAfter.sentenceLength.averageWords !== null) {
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
  }

  // 2. Clause density shift
  if (metricsBefore.clauseDensity.averageClausesPerSentence !== null && metricsAfter.clauseDensity.averageClausesPerSentence !== null) {
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
  if (metricsBefore.transitionFrequency.densityPer100Words !== null && metricsAfter.transitionFrequency.densityPer100Words !== null) {
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
  }

  // 5. Workflow/Procedural Markers
  if (metricsBefore.workflowExplanationTendency.tendencyScore !== null && metricsAfter.workflowExplanationTendency.tendencyScore !== null) {
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
  }

  // 6. Punctuation habits
  const puncBefore = metricsBefore.punctuationHabits;
  const puncAfter = metricsAfter.punctuationHabits;
  if (puncAfter.semicolonsPer100Words !== null && puncBefore.semicolonsPer100Words !== null && puncAfter.semicolonsPer100Words > puncBefore.semicolonsPer100Words) {
    changes.push({
      dimension: "Punctuation Habit",
      description: "Added semicolon connectors between clauses",
      before: puncBefore.semicolonsPer100Words,
      after: puncAfter.semicolonsPer100Words,
      impact: "Prefers coordinating related assertions with semicolons",
    });
  }
  if (puncAfter.emDashesPer100Words !== null && puncBefore.emDashesPer100Words !== null && puncAfter.emDashesPer100Words > puncBefore.emDashesPer100Words) {
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
  const blend = (curr: number | null, editVal: number | null): number | null => {
    if (curr === null && editVal === null) return null;
    if (curr === null) return editVal;
    if (editVal === null) return curr;
    return Math.round((curr * (1 - alpha) + editVal * alpha) * 100) / 100;
  };

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

  // Validate before saving
  const validation = validateStyleDNAMetrics(currentMetrics);
  if (!validation.valid) {
    console.warn("StyleDNA edit blend validation warnings:", validation.errors);
  }

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }
  fs.writeFileSync(profilePath, JSON.stringify(currentMetrics, null, 2), "utf-8");

  return currentMetrics;
}

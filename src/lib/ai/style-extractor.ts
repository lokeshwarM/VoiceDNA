import { callLLM } from "./provider";
import { TrainingDocument, VoiceProfile, updateVoiceProfile, getActiveVoiceProfile } from "../db/queries";

export interface LinguisticMetrics {
  avgSentenceLength: number;
  sentenceVariance: string;
  lexicalDiversity: number;
  passiveRatio: number;
  transitionDensity: number;
  detectedCitationStyle: string;
  topTransitions: string[];
  sampleCount: number;
}

const COMMON_TRANSITIONS = [
  "furthermore", "moreover", "consequently", "however", "conversely",
  "nevertheless", "thus", "hence", "notably", "fundamentally",
  "substantially", "specifically", "alternatively", "accordingly",
  "in contrast", "in particular", "significantly", "critically",
  "predominantly", "ultimately", "therefore", "in addition"
];

export function computeTextMetrics(text: string): LinguisticMetrics {
  // Normalize whitespace
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) {
    return {
      avgSentenceLength: 0,
      sentenceVariance: "low",
      lexicalDiversity: 0,
      passiveRatio: 0,
      transitionDensity: 0,
      detectedCitationStyle: "None",
      topTransitions: [],
      sampleCount: 0,
    };
  }

  // Split into sentences (handles standard terminal punctuation while ignoring abbreviations like e.g., i.e., et al.)
  const sentenceDelim = /(?<=[.?!])\s+(?=[A-Z0-9])/g;
  const rawSentences = clean.split(sentenceDelim).filter((s) => s.trim().length > 10);
  const sentenceLengths = rawSentences.map((s) => s.trim().split(/\s+/).length);

  const totalWords = sentenceLengths.reduce((a, b) => a + b, 0);
  const avgSentenceLength = rawSentences.length > 0 ? Math.round((totalWords / rawSentences.length) * 10) / 10 : 0;

  // Calculate variance / standard deviation
  let varianceStr = "moderate";
  if (sentenceLengths.length > 1) {
    const mean = avgSentenceLength;
    const variance = sentenceLengths.reduce((acc, len) => acc + Math.pow(len - mean, 2), 0) / sentenceLengths.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev < 5) varianceStr = "low (uniform sentence lengths)";
    else if (stdDev > 11) varianceStr = "high (dynamic cadence with contrasting short & long sentences)";
    else varianceStr = "moderate (balanced academic rhythm)";
  }

  // Lexical diversity (Type-Token Ratio on lowercased words)
  const words = clean
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const uniqueWords = new Set(words);
  const lexicalDiversity = words.length > 0 ? Math.round((uniqueWords.size / words.length) * 100) / 100 : 0;

  // Passive voice detection: aux verb + past participle (-ed or irregular past participle)
  const passiveRegex = /\b(?:is|are|was|were|be|been|being)\s+([a-z]+ed|known|shown|found|derived|observed|analyzed|demonstrated|evaluated|obtained|conducted|established|measured)\b/gi;
  const passiveMatches = clean.match(passiveRegex) || [];
  const passiveRatio = rawSentences.length > 0 ? Math.round((passiveMatches.length / rawSentences.length) * 100) / 100 : 0;

  // Academic transitions count
  const foundTransitions: Record<string, number> = {};
  const lowerText = clean.toLowerCase();
  for (const trans of COMMON_TRANSITIONS) {
    const regex = new RegExp(`\\b${trans}\\b`, "g");
    const count = (lowerText.match(regex) || []).length;
    if (count > 0) {
      foundTransitions[trans] = count;
    }
  }

  const sortedTransitions = Object.entries(foundTransitions)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  const totalTransitions = Object.values(foundTransitions).reduce((a, b) => a + b, 0);
  const transitionDensity = totalWords > 0 ? Math.round((totalTransitions / (totalWords / 100)) * 10) / 10 : 0; // occurrences per 100 words

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
    passiveRatio,
    transitionDensity,
    detectedCitationStyle,
    topTransitions: sortedTransitions.slice(0, 8),
    sampleCount: rawSentences.length,
  };
}

export async function synthesizeVoiceProfile(documents: TrainingDocument[]): Promise<VoiceProfile> {
  const currentProfile = getActiveVoiceProfile();

  if (!documents || documents.length === 0) {
    return currentProfile || {
      id: "default-profile",
      name: "Default Academic Voice",
      is_active: 1,
      tone_descriptors: ["Rigorous", "Analytical", "Precise"],
      sentence_cadence: { avgSentenceLength: 22, variance: "moderate", compoundComplexRatio: 0.65 },
      preferred_transitions: ["furthermore", "consequently", "notably"],
      rhetorical_habits: ["Epistemic hedging", "Methodological signposting"],
      synthesized_guidelines: "Maintain scholarly rigor, technical accuracy, and varied sentence length.",
      updated_at: new Date().toISOString(),
    };
  }

  // Aggregate quantitative stats across all docs
  let totalWords = 0;
  let weightedSentenceLengthSum = 0;
  let totalSentences = 0;
  let transitionOccurrences: Record<string, number> = {};
  const citationStyles: string[] = [];

  for (const doc of documents) {
    totalWords += doc.word_count;
    const m = doc.metrics;
    if (m && m.sampleCount) {
      totalSentences += m.sampleCount;
      weightedSentenceLengthSum += m.avgSentenceLength * m.sampleCount;
      if (m.topTransitions) {
        for (const t of m.topTransitions) {
          transitionOccurrences[t] = (transitionOccurrences[t] || 0) + 1;
        }
      }
      if (m.detectedCitationStyle && m.detectedCitationStyle !== "None") {
        citationStyles.push(m.detectedCitationStyle);
      }
    }
  }

  const avgSentenceLength = totalSentences > 0 ? Math.round((weightedSentenceLengthSum / totalSentences) * 10) / 10 : 22;
  const topTransitions = Object.entries(transitionOccurrences)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);

  // Take short excerpt excerpts (up to 300 words each from up to 3 docs) for qualitative synthesis
  const sampleExcerpts = documents
    .slice(0, 4)
    .map((d) => `--- Excerpt from "${d.title}" ---\n${d.raw_text.slice(0, 1200)}...`)
    .join("\n\n");

  let toneDescriptors = ["Analytical", "Nuanced", "Precision-Oriented", "Measured Hedging"];
  let rhetoricalHabits = [
    "Grounds theoretical claims in empirical context before deducing consequences",
    "Uses disciplined epistemic hedging (e.g. 'indicates', 'suggests', 'demonstrates')",
    "Favors structured paragraph topic sentences followed by analytical elaboration",
  ];
  let guidelines = `# Academic Voice Blueprint
- Average Sentence Length: ${avgSentenceLength} words per sentence with dynamic rhythmic variance.
- Preferred Logical Transitions: ${topTransitions.join(", ") || "furthermore, consequently, notably, in contrast"}.
- Preferred Citation Pattern: ${citationStyles[0] || "Preserve author's in-text style"}.
- Maintain absolute preservation of formulas, citations, and data figures.
- Prohibit verbatim copying of any reference texts.`;

  // Attempt LLM qualitative synthesis
  try {
    const prompt = `You are an expert computational linguist. Analyze the following excerpts from a researcher/student's actual academic papers and notes:

${sampleExcerpts}

Quantitative Metrics:
- Average sentence length: ${avgSentenceLength} words
- Frequently used transitions: ${topTransitions.join(", ")}

Generate a detailed, actionable "Voice DNA Profile" that will be used as a system prompt to rewrite draft notes into this exact academic style.

Respond strictly in valid JSON matching this schema:
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
    console.warn("LLM synthesis skipped or failed; using heuristic voice blueprint:", err.message);
  }

  const newProfile: VoiceProfile = {
    id: currentProfile?.id || "default-profile",
    name: "Calibrated Academic Voice",
    is_active: 1,
    tone_descriptors: toneDescriptors,
    sentence_cadence: {
      avgSentenceLength,
      variance: "balanced academic rhythm",
      compoundComplexRatio: 0.65,
    },
    preferred_transitions: topTransitions.length > 0 ? topTransitions : ["consequently", "furthermore", "notably"],
    rhetorical_habits: rhetoricalHabits,
    synthesized_guidelines: guidelines,
    updated_at: new Date().toISOString(),
  };

  updateVoiceProfile(newProfile);
  return newProfile;
}

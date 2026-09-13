export interface FidelityReport {
  citationsFound: string[];
  citationsPreserved: string[];
  citationsMissing: string[];
  numbersFound: string[];
  numbersPreserved: string[];
  numbersMissing: string[];
  equationsFound: string[];
  equationsPreserved: string[];
  equationsMissing: string[];
  fidelityScore: number; // 0 to 100
  allPreserved: boolean;
}

export interface VerbatimReport {
  maxNgramMatch: number;
  isClean: boolean;
  verbatimPhrases: string[];
  verbatimScore: number; // 100 means completely clean/novel
}

/**
 * Extracts citations such as [1], [1, 2], [1-3], (Smith, 2020), (Smith & Jones, 2021; Miller, 2022), Smith et al. (2020)
 */
export function extractCitations(text: string): string[] {
  const citations = new Set<string>();

  // Numeric brackets e.g. [1], [1, 2], [12]
  const numericBracketRegex = /\[\s*\d+(?:\s*[,-]\s*\d+)*\s*\]/g;
  let match;
  while ((match = numericBracketRegex.exec(text)) !== null) {
    citations.add(match[0].trim());
  }

  // Author-date in parentheses e.g. (Smith, 2020), (Doe et al., 2021; Taylor, 2023)
  const authorDateRegex = /\((?:[A-Z][A-Za-z\s.,&'-]+(?:et\s+al\.?)?,?\s*(?:18|19|20)\d{2}[a-z]?(?:;\s*)?)+\)/g;
  while ((match = authorDateRegex.exec(text)) !== null) {
    citations.add(match[0].trim());
  }

  // In-text citation e.g. Smith et al. (2020)
  const inTextRegex = /\b[A-Z][a-zA-Z]+(?:\s+et\s+al\.?)?\s*\((?:18|19|20)\d{2}[a-z]?\)/g;
  while ((match = inTextRegex.exec(text)) !== null) {
    citations.add(match[0].trim());
  }

  return Array.from(citations);
}

/**
 * Extracts mathematical formulas and LaTeX expressions: $...$, $$...$$, \begin{equation}...\end{equation}
 */
export function extractEquations(text: string): string[] {
  const equations = new Set<string>();

  // LaTeX block environments
  const blockEnvRegex = /\\begin\{(?:equation|align|gather|matrix|bmatrix|pmatrix)\*?\}[\s\S]*?\\end\{(?:equation|align|gather|matrix|bmatrix|pmatrix)\*?\}/g;
  let match;
  while ((match = blockEnvRegex.exec(text)) !== null) {
    equations.add(match[0].trim());
  }

  // Display math $$...$$
  const displayMathRegex = /\$\$[\s\S]+?\$\$/g;
  while ((match = displayMathRegex.exec(text)) !== null) {
    equations.add(match[0].trim());
  }

  // Inline math $...$
  const inlineMathRegex = /(?<!\\)\$(?!\$)(.+?)(?<!\\)\$/g;
  while ((match = inlineMathRegex.exec(text)) !== null) {
    equations.add(match[0].trim());
  }

  return Array.from(equations);
}

/**
 * Extracts numbers, p-values, percentages, scientific measurements
 */
export function extractNumbers(text: string): string[] {
  const numbers = new Set<string>();

  // p-values: p < 0.05, p = 0.001, etc.
  const pValueRegex = /\bp\s*[<>=≤≥]\s*0?\.\d+\b/gi;
  let match;
  while ((match = pValueRegex.exec(text)) !== null) {
    numbers.add(match[0].trim());
  }

  // Numbers with units or percentages: e.g. 95.4%, 120 ms, 3.5 GHz, 10 mg
  const unitNumberRegex = /\b\d+(?:\.\d+)?\s*(?:%|mg|kg|g|Hz|kHz|MHz|GHz|ms|s|min|h|km|m|cm|mm|px|GB|MB|KB|dB)\b/gi;
  while ((match = unitNumberRegex.exec(text)) !== null) {
    numbers.add(match[0].trim());
  }

  // Isolated significant decimal and integer figures (>10 or precise decimals)
  const standAloneNumberRegex = /\b(?:\d+\.\d+|\d{2,})\b/g;
  while ((match = standAloneNumberRegex.exec(text)) !== null) {
    // Avoid capturing standalone years like 2023 if it was part of a citation
    const num = match[0].trim();
    if (!(num.length === 4 && (num.startsWith("19") || num.startsWith("20")))) {
      numbers.add(num);
    }
  }

  return Array.from(numbers);
}

/**
 * Compares draft input and rewritten output to verify preservation of citations, equations, and numbers.
 */
export function verifyFidelity(draftInput: string, rewrittenOutput: string): FidelityReport {
  const citationsFound = extractCitations(draftInput);
  const equationsFound = extractEquations(draftInput);
  const numbersFound = extractNumbers(draftInput);

  // Normalize text for flexible whitespace matching
  const normalizedOutput = rewrittenOutput.replace(/\s+/g, " ");

  const citationsPreserved: string[] = [];
  const citationsMissing: string[] = [];
  for (const cit of citationsFound) {
    // Check if the citation or its key numeric identifier is in the output
    const normCit = cit.replace(/\s+/g, " ");
    if (normalizedOutput.includes(normCit)) {
      citationsPreserved.push(cit);
    } else {
      // Check if bracket content is preserved e.g. [1] vs [ 1 ]
      const bracketMatch = cit.match(/\[(\d+)\]/);
      if (bracketMatch && normalizedOutput.includes(`[${bracketMatch[1]}]`)) {
        citationsPreserved.push(cit);
      } else {
        citationsMissing.push(cit);
      }
    }
  }

  const equationsPreserved: string[] = [];
  const equationsMissing: string[] = [];
  for (const eq of equationsFound) {
    const normEq = eq.replace(/\s+/g, " ");
    if (normalizedOutput.includes(normEq) || normalizedOutput.includes(eq.replace(/^\$|\$$/g, "").trim())) {
      equationsPreserved.push(eq);
    } else {
      equationsMissing.push(eq);
    }
  }

  const numbersPreserved: string[] = [];
  const numbersMissing: string[] = [];
  for (const num of numbersFound) {
    const cleanNum = num.replace(/\s+/g, "");
    if (normalizedOutput.replace(/\s+/g, "").includes(cleanNum) || normalizedOutput.includes(num)) {
      numbersPreserved.push(num);
    } else {
      numbersMissing.push(num);
    }
  }

  const totalItems = citationsFound.length + equationsFound.length + numbersFound.length;
  const totalPreserved = citationsPreserved.length + equationsPreserved.length + numbersPreserved.length;

  const fidelityScore = totalItems === 0 ? 100 : Math.round((totalPreserved / totalItems) * 100);
  const allPreserved = totalItems === totalPreserved;

  return {
    citationsFound,
    citationsPreserved,
    citationsMissing,
    numbersFound,
    numbersPreserved,
    numbersMissing,
    equationsFound,
    equationsPreserved,
    equationsMissing,
    fidelityScore,
    allPreserved,
  };
}

/**
 * Scans output text against training documents to ensure no 6-gram+ sentence chunks were copied verbatim.
 */
export function verifyNovelty(rewrittenOutput: string, trainingCorpusTexts: string[]): VerbatimReport {
  if (!trainingCorpusTexts || trainingCorpusTexts.length === 0) {
    return {
      maxNgramMatch: 0,
      isClean: true,
      verbatimPhrases: [],
      verbatimScore: 100,
    };
  }

  // Tokenize words
  const tokenize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 0);

  const outputTokens = tokenize(rewrittenOutput);
  if (outputTokens.length < 6) {
    return { maxNgramMatch: 0, isClean: true, verbatimPhrases: [], verbatimScore: 100 };
  }

  // Build 6-gram set from training texts
  const corpusNgrams = new Set<string>();
  for (const text of trainingCorpusTexts) {
    const tokens = tokenize(text);
    for (let i = 0; i <= tokens.length - 6; i++) {
      corpusNgrams.add(tokens.slice(i, i + 6).join(" "));
    }
  }

  const matches: string[] = [];
  for (let i = 0; i <= outputTokens.length - 6; i++) {
    const ngram = outputTokens.slice(i, i + 6).join(" ");
    if (corpusNgrams.has(ngram)) {
      matches.push(ngram);
      i += 5; // jump ahead to avoid reporting overlapping sub-windows
    }
  }

  const isClean = matches.length === 0;
  const verbatimScore = Math.max(0, 100 - matches.length * 15);

  return {
    maxNgramMatch: matches.length > 0 ? 6 : 0,
    isClean,
    verbatimPhrases: matches.slice(0, 5),
    verbatimScore,
  };
}

import fs from "fs";
import path from "path";
import { parseDocumentBuffer } from "../parser";
import { extractAndSaveProfileFromProcessed, StyleDNAMetrics, analyzeTextStructure, classifyTextLayer } from "./extract";
import { getFingerprintRules } from "./fingerprint";

export interface CorpusFileInfo {
  fileName: string;
  fileType: string;
  words: number;
  sentences: number;
  lastModified: string;
  sizeBytes: number;
  processedFileName: string;
  layer: "personal_thinking" | "academic";
}

export interface CorpusSummary {
  files: CorpusFileInfo[];
  totalFiles: number;
  totalWords: number;
  totalSentences: number;
  profileExists: boolean;
  lastProfileUpdate: string | null;
  fingerprintRules: string[];
}

/**
 * Scans data/corpus/ for TXT, PDF, and DOCX files.
 * Extracts text into data/processed/<filename>.txt without modifying the original.
 * Returns metadata for every corpus file (words, sentences, last modified).
 */
export async function scanAndSyncCorpus(): Promise<CorpusSummary> {
  const corpusDir = path.join(process.cwd(), "data", "corpus");
  const processedDir = path.join(process.cwd(), "data", "processed");
  const profileDir = path.join(process.cwd(), "data", "profile");

  if (!fs.existsSync(corpusDir)) fs.mkdirSync(corpusDir, { recursive: true });
  if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

  const rawFiles = fs.readdirSync(corpusDir);
  const supportedExts = [".txt", ".pdf", ".docx", ".md"];

  const validFiles = rawFiles.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return supportedExts.includes(ext);
  });

  const fileInfos: CorpusFileInfo[] = [];

  for (const fileName of validFiles) {
    const originalFilePath = path.join(corpusDir, fileName);
    const stat = fs.statSync(originalFilePath);
    const parsed = path.parse(fileName);
    const processedFileName = `${parsed.name}_${parsed.ext.replace(".", "")}.txt`;
    const processedFilePath = path.join(processedDir, processedFileName);

    let needsProcess = false;
    if (!fs.existsSync(processedFilePath)) {
      needsProcess = true;
    } else {
      const procStat = fs.statSync(processedFilePath);
      if (procStat.mtimeMs < stat.mtimeMs) {
        needsProcess = true;
      }
    }

    let textContent = "";
    if (needsProcess) {
      try {
        const buffer = fs.readFileSync(originalFilePath);
        const parseRes = await parseDocumentBuffer(buffer, fileName);
        textContent = parseRes.text;
        // Save processed text inside data/processed/ (Never overwrite original files)
        fs.writeFileSync(processedFilePath, textContent, "utf-8");
      } catch (err: any) {
        console.error(`Error processing ${fileName}:`, err.message);
        if (fs.existsSync(processedFilePath)) {
          textContent = fs.readFileSync(processedFilePath, "utf-8");
        }
      }
    } else {
      textContent = fs.readFileSync(processedFilePath, "utf-8");
    }

    const structure = analyzeTextStructure(textContent);
    const words = structure.words;
    const sentences = structure.sentences.length;
    const layer = classifyTextLayer(textContent, fileName);

    fileInfos.push({
      fileName,
      fileType: parsed.ext.replace(".", "").toUpperCase(),
      words,
      sentences,
      lastModified: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      processedFileName,
      layer,
    });
  }

  const profilePath = path.join(profileDir, "voiceDNA.json");
  const profileExists = fs.existsSync(profilePath);
  let lastProfileUpdate: string | null = null;
  if (profileExists) {
    const pStat = fs.statSync(profilePath);
    lastProfileUpdate = pStat.mtime.toISOString();
  }

  const totalWords = fileInfos.reduce((acc, f) => acc + f.words, 0);
  const totalSentences = fileInfos.reduce((acc, f) => acc + f.sentences, 0);
  const fingerprintRules = getFingerprintRules();

  return {
    files: fileInfos,
    totalFiles: fileInfos.length,
    totalWords,
    totalSentences,
    profileExists,
    lastProfileUpdate,
    fingerprintRules,
  };
}

/**
 * Rebuilds the entire VoiceDNA profile:
 * 1. Ensures all corpus files are extracted to data/processed/
 * 2. Analyzes measurable habits and writes numbers & patterns to data/profile/voiceDNA.json
 * 3. Generates fingerprint rules
 */
export async function rebuildVoiceDNA(): Promise<{
  metrics: StyleDNAMetrics;
  fingerprintRules: string[];
  summary: CorpusSummary;
}> {
  // Sync all files
  const summary = await scanAndSyncCorpus();

  // Extract measurable habits into data/profile/voiceDNA.json
  const metrics = extractAndSaveProfileFromProcessed();

  // Generate fingerprint rules
  const fingerprintRules = getFingerprintRules(metrics);

  return {
    metrics,
    fingerprintRules,
    summary: {
      ...summary,
      profileExists: true,
      lastProfileUpdate: new Date().toISOString(),
      fingerprintRules,
    },
  };
}

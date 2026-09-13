"use client";

import React, { useState } from "react";
import {
  Dna,
  RefreshCw,
  Sparkles,
  BookOpen,
  Quote,
  Cpu,
  ShieldCheck,
  Check,
  FileCode,
  Copy,
  ChevronDown,
  ChevronUp,
  Hash,
  Binary,
  Layers,
  Activity,
  Award,
} from "lucide-react";
import { VoiceProfile } from "@/lib/db/queries";

interface VoiceMatrixProps {
  profile: VoiceProfile | null;
  stats: {
    documentCount: number;
    totalWordsAnalyzed: number;
    activeRulesCount: number;
  };
  onRebuildProfile: () => Promise<void>;
}

export const VoiceMatrix: React.FC<VoiceMatrixProps> = ({ profile, stats, onRebuildProfile }) => {
  const [rebuilding, setRebuilding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);

  const handleRebuild = async () => {
    try {
      setRebuilding(true);
      setFeedback(null);
      await onRebuildProfile();
      setFeedback("Voice Learned: Profile successfully recalibrated!");
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback(`Failed to rebuild: ${err.message}`);
    } finally {
      setRebuilding(false);
    }
  };

  if (!profile) {
    return (
      <div className="p-8 text-center text-slate-400">
        <Dna className="w-10 h-10 mx-auto mb-3 text-indigo-400 opacity-50" />
        <p>No Voice DNA profile detected. Ingest papers in the Training Papers tab.</p>
      </div>
    );
  }

  // Parse unified profile JSON if available
  const unified = profile.unified_profile || (profile.profile_json ? JSON.parse(profile.profile_json) : null);
  const m = unified?.metrics;

  const sentLength = m?.sentenceLength || {
    averageWords: profile.sentence_cadence?.avgSentenceLength || 22,
    variance: profile.sentence_cadence?.variance || "moderate",
    minWords: 6,
    maxWords: 45,
  };

  const paraLength = m?.paragraphLength || {
    averageWords: 110,
    averageSentences: 5.2,
    totalParagraphs: stats.documentCount > 0 ? stats.documentCount * 4 : 1,
  };

  const transitions = m?.transitionWords || {
    totalCount: 18,
    densityPer100Words: 2.1,
    topTransitions: (profile.preferred_transitions || ["consequently", "furthermore"]).map((w) => ({ word: w, count: 3 })),
    categoryBreakdown: { causal: 6, contrast: 5, additive: 4, emphasis: 3 },
  };

  const punct = m?.punctuationHabits || {
    semicolons: { count: 4, per100Words: 0.3 },
    colons: { count: 2, per100Words: 0.15 },
    emDashes: { count: 3, per100Words: 0.2 },
    parentheses: { count: 12, per100Words: 0.8 },
    commas: { count: 68, per100Words: 4.6 },
    summary: "Balanced academic punctuation with parenthetical qualifications and compound semicolons.",
  };

  const techVocab = m?.technicalVocabulary || {
    acronyms: ["BFT", "PBFT", "API"],
    topTechnicalTerms: ["consensus", "cryptographic", "synchronous", "throughput"],
    technicalTermDensity: 7.8,
  };

  const passiveVoice = m?.passiveVsActive || {
    activePercentage: 68,
    passivePercentage: 32,
    activeToPassiveRatio: "2.13 : 1",
    summary: "68% Active / 32% Passive (Favors active voice)",
  };

  const toneDescriptors = profile.tone_descriptors || ["Analytical", "Precision-Oriented", "Nuanced", "Disciplined Hedging"];
  const rhetoricalHabits = profile.rhetorical_habits || [];

  const handleCopyJson = () => {
    navigator.clipboard.writeText(profile.profile_json || JSON.stringify(unified || profile, null, 2));
    setJsonCopied(true);
    setTimeout(() => setJsonCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Voice Learned Status */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Prominent Voice Learned Status Badge */}
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/10">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Voice Learned</span>
              </div>

              <span className="text-xs text-slate-400 font-mono">
                Built from {stats.documentCount} document{stats.documentCount === 1 ? "" : "s"} ({stats.totalWordsAnalyzed.toLocaleString()} words)
              </span>

              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                Saved as single VoiceDNA JSON
              </span>
            </div>

            <h1 className="mt-2.5 text-2xl font-bold tracking-tight text-white">{profile.name}</h1>
            <p className="mt-1 text-xs text-slate-300 max-w-2xl leading-relaxed">
              Synthesized linguistic DNA across 6 core dimensions: sentence rhythm, paragraph structure, transition frequency, punctuation habits, technical lexicon, and active/passive voice ratio.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start md:self-center">
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition"
            >
              <FileCode className="w-3.5 h-3.5 text-indigo-400" />
              <span>{showRawJson ? "Hide JSON Profile" : "View JSON Profile"}</span>
            </button>

            <button
              onClick={handleRebuild}
              disabled={rebuilding}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rebuilding ? "animate-spin" : ""}`} />
              <span>{rebuilding ? "Recalibrating..." : "Rebuild Voice DNA"}</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div className="mt-4 p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold">{feedback}</span>
          </div>
        )}
      </div>

      {/* Raw JSON Profile Viewer Drawer */}
      {showRawJson && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-semibold text-white font-mono">voicedna_profile.json (Unified Local JSON Profile)</h3>
            </div>
            <button
              onClick={handleCopyJson}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700"
            >
              {jsonCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{jsonCopied ? "Copied!" : "Copy JSON"}</span>
            </button>
          </div>
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap">
            {profile.profile_json || JSON.stringify(unified || profile, null, 2)}
          </pre>
        </div>
      )}

      {/* 6 Required Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* 1. Average Sentence Length */}
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              1. Sentence Cadence
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-900/40">
              {sentLength.variance}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-indigo-300">
              {sentLength.averageWords}
            </span>
            <span className="text-xs text-slate-400">words / sentence</span>
          </div>

          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Short (&lt;15 words):</span>
              <span className="font-mono text-slate-300">{sentLength.distribution?.shortCount ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Medium (15-25 words):</span>
              <span className="font-mono text-slate-300">{sentLength.distribution?.mediumCount ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Long (&gt;25 words):</span>
              <span className="font-mono text-slate-300">{sentLength.distribution?.longCount ?? 0}</span>
            </div>
          </div>
        </div>

        {/* 2. Paragraph Length */}
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              2. Paragraph Length
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-900/40">
              {paraLength.totalParagraphs} Paragraphs
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-indigo-300">
              {paraLength.averageWords}
            </span>
            <span className="text-xs text-slate-400">words / paragraph</span>
          </div>

          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Average Sentences:</span>
              <span className="font-mono text-slate-300">{paraLength.averageSentences} sents / para</span>
            </div>
            <div className="flex justify-between">
              <span>Shortest Paragraph:</span>
              <span className="font-mono text-slate-300">{paraLength.minWords} words</span>
            </div>
            <div className="flex justify-between">
              <span>Longest Paragraph:</span>
              <span className="font-mono text-slate-300">{paraLength.maxWords} words</span>
            </div>
          </div>
        </div>

        {/* 3. Transition Words */}
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              3. Transition Words
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-900/40">
              {transitions.densityPer100Words} / 100 words
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 min-h-[40px] items-center">
            {transitions.topTransitions?.slice(0, 6).map((t: any, i: number) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-950/60 text-indigo-300 border border-indigo-900/50"
              >
                {t.word} ({t.count})
              </span>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex flex-wrap gap-2">
            <span>Causal: {transitions.categoryBreakdown?.causal ?? 0}</span>
            <span>•</span>
            <span>Contrast: {transitions.categoryBreakdown?.contrast ?? 0}</span>
            <span>•</span>
            <span>Additive: {transitions.categoryBreakdown?.additive ?? 0}</span>
          </div>
        </div>

        {/* 4. Punctuation Habits */}
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              4. Punctuation Habits
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-900/40">
              Syntactic Markers
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Semicolons</span>
              <span className="font-mono font-bold text-slate-200">{punct.semicolons?.count ?? 0}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Parentheses</span>
              <span className="font-mono font-bold text-slate-200">{punct.parentheses?.count ?? 0}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Em-dashes</span>
              <span className="font-mono font-bold text-slate-200">{punct.emDashes?.count ?? 0}</span>
            </div>
          </div>

          <p className="pt-1 text-[11px] text-slate-400 leading-snug line-clamp-2">
            {punct.summary}
          </p>
        </div>

        {/* 5. Technical Vocabulary */}
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              5. Technical Vocabulary
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-900/40">
              {techVocab.technicalTermDensity ?? 0}% Density
            </span>
          </div>

          {techVocab.acronyms?.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                Acronyms:
              </span>
              <div className="flex flex-wrap gap-1">
                {techVocab.acronyms.slice(0, 6).map((acr: string, i: number) => (
                  <span key={i} className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-800 text-indigo-300 border border-slate-700">
                    {acr}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-800/80">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
              Top Domain Terms:
            </span>
            <div className="flex flex-wrap gap-1">
              {techVocab.topTechnicalTerms?.slice(0, 5).map((term: string, i: number) => (
                <span key={i} className="text-[11px] text-slate-300 font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                  {term}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 6. Passive vs Active Ratio */}
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              6. Passive vs Active Voice
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-900/40">
              {passiveVoice.activeToPassiveRatio} Ratio
            </span>
          </div>

          {/* Progress bar visual */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-emerald-400">{passiveVoice.activePercentage}% Active</span>
              <span className="text-indigo-400">{passiveVoice.passivePercentage}% Passive</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-950 overflow-hidden flex border border-slate-800">
              <div
                style={{ width: `${passiveVoice.activePercentage}%` }}
                className="bg-emerald-500 h-full"
                title={`Active sentences: ${passiveVoice.activePercentage}%`}
              ></div>
              <div
                style={{ width: `${passiveVoice.passivePercentage}%` }}
                className="bg-indigo-500 h-full"
                title={`Passive sentences: ${passiveVoice.passivePercentage}%`}
              ></div>
            </div>
          </div>

          <p className="pt-1 text-[11px] text-slate-400 leading-snug">
            {passiveVoice.summary}
          </p>
        </div>
      </div>

      {/* Rhetorical Habits & Voice Guidelines Blueprint */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Tone & Rhetorical Patterns */}
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-4">
          <div>
            <div className="flex items-center gap-2 text-slate-200">
              <Quote className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold">Scholarly Tone & Persona</h2>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {toneDescriptors.map((tone, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-200 border border-slate-700/60"
                >
                  {tone}
                </span>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 space-y-2.5">
            <span className="text-xs font-semibold text-slate-300 block">Rhetorical Habits:</span>
            {rhetoricalHabits.map((habit, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0"></span>
                <span>{habit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Full LLM Voice Directive Blueprint */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-200">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold">Unified VoiceDNA Blueprint (LLM System Directive)</h2>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Single JSON Profile Active</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-300 leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto">
            {profile.synthesized_guidelines}
          </div>
        </div>
      </div>
    </div>
  );
};

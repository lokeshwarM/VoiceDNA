"use client";

import React, { useState } from "react";
import { Dna, RefreshCw, Sparkles, BookOpen, Quote, Cpu, ShieldCheck, Check } from "lucide-react";
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

  const handleRebuild = async () => {
    try {
      setRebuilding(true);
      setFeedback(null);
      await onRebuildProfile();
      setFeedback("Voice DNA profile successfully recalibrated!");
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

  const cadence = profile.sentence_cadence || { avgSentenceLength: 22, variance: "balanced" };
  const transitions = profile.preferred_transitions || [];
  const toneDescriptors = profile.tone_descriptors || [];
  const rhetoricalHabits = profile.rhetorical_habits || [];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                ACTIVE CALIBRATION
              </span>
              <span className="text-xs text-slate-400">
                Derived from {stats.documentCount} document{stats.documentCount === 1 ? "" : "s"} ({stats.totalWordsAnalyzed.toLocaleString()} words analyzed)
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">{profile.name}</h1>
            <p className="mt-1 text-xs text-slate-400 max-w-2xl">
              Your distinct scholarly persona, syntactic cadence, vocabulary distribution, and argumentative structure distilled into a deterministic writing blueprint.
            </p>
          </div>

          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="self-start md:self-center flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rebuilding ? "animate-spin" : ""}`} />
            <span>{rebuilding ? "Recalibrating..." : "Recalibrate Voice Profile"}</span>
          </button>
        </div>

        {feedback && (
          <div className="mt-4 p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{feedback}</span>
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Average Sentence Length */}
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 shadow-md">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Sentence Cadence</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-indigo-300">
              {cadence.avgSentenceLength || 22}
            </span>
            <span className="text-xs text-slate-400">words/sentence</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Variance: <span className="text-slate-300 font-medium">{cadence.variance || "dynamic"}</span>
          </p>
        </div>

        {/* Metric 2: Scholarly Tone */}
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 shadow-md">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Scholarly Tone</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {toneDescriptors.slice(0, 4).map((tone, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-200 border border-slate-700/60"
              >
                {tone}
              </span>
            ))}
          </div>
        </div>

        {/* Metric 3: Transition Density */}
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 shadow-md">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Logical Connectors</span>
          <div className="mt-2 flex flex-wrap gap-1">
            {transitions.slice(0, 5).map((trans, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-indigo-950/60 text-indigo-300 border border-indigo-900/50"
              >
                {trans}
              </span>
            ))}
          </div>
        </div>

        {/* Metric 4: Learned Rules Active */}
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 shadow-md">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Adaptive Rules Active</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              {stats.activeRulesCount}
            </span>
            <span className="text-xs text-slate-400">rules memorized</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Learned from your manual edits</p>
        </div>
      </div>

      {/* Rhetorical Habits & Guidelines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 1/3: Rhetorical Habits */}
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-4">
          <div className="flex items-center gap-2 text-slate-200">
            <Quote className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold">Rhetorical Patterns</h2>
          </div>

          <div className="space-y-3">
            {rhetoricalHabits.map((habit, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0"></span>
                <span>{habit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right 2/3: Voice Guidelines Blueprint */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-200">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold">Synthesized Voice Blueprint (LLM System Directive)</h2>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Invariance & Tone Rules</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-300 leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto">
            {profile.synthesized_guidelines}
          </div>
        </div>
      </div>
    </div>
  );
};

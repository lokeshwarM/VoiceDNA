"use client";

import React from "react";
import { diffWordsWithSpace, Change } from "diff";

interface DiffViewerProps {
  original: string;
  modified: string;
  labelOriginal?: string;
  labelModified?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  original,
  modified,
  labelOriginal = "Draft Input",
  labelModified = "Rewritten Voice",
}) => {
  const diffs: Change[] = diffWordsWithSpace(original || "", modified || "");

  let additionsCount = 0;
  let deletionsCount = 0;
  diffs.forEach((part) => {
    if (part.added) additionsCount++;
    if (part.removed) deletionsCount++;
  });

  return (
    <div className="flex flex-col h-full bg-slate-900/60 rounded-xl border border-slate-800/80 overflow-hidden shadow-inner">
      {/* Diff Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-300">Style Evolution Diff</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            {additionsCount} additions / rephrases
          </span>
          <span className="flex items-center gap-1 text-rose-400">
            <span className="inline-block w-2 h-2 rounded-full bg-rose-500"></span>
            {deletionsCount} trimmed elements
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-900/50">Removed</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-900/50">Synthesized Voice</span>
        </div>
      </div>

      {/* Diff Stream */}
      <div className="p-4 overflow-y-auto flex-1 font-serif text-sm leading-relaxed text-slate-200 select-text whitespace-pre-wrap">
        {diffs.map((part, index) => {
          if (part.added) {
            return (
              <span
                key={index}
                className="bg-emerald-500/20 text-emerald-300 px-1 py-0.5 rounded border-b border-emerald-500/40"
                title="Academic Voice Synthesized"
              >
                {part.value}
              </span>
            );
          }
          if (part.removed) {
            return (
              <span
                key={index}
                className="bg-rose-500/20 text-rose-400/80 line-through px-1 py-0.5 rounded border-b border-rose-500/30 mr-0.5"
                title="Draft phrase replaced"
              >
                {part.value}
              </span>
            );
          }
          return <span key={index}>{part.value}</span>;
        })}
      </div>
    </div>
  );
};

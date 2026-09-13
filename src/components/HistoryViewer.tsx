"use client";

import React, { useState, useEffect } from "react";
import { Clock, ExternalLink, ArrowRight, ShieldCheck, FileText, Check } from "lucide-react";
import { RewriteRecord } from "@/lib/db/queries";

interface HistoryViewerProps {
  onLoadIntoStudio: (draft: string, output: string, sectionType: string, id: string) => void;
}

export const HistoryViewer: React.FC<HistoryViewerProps> = ({ onLoadIntoStudio }) => {
  const [history, setHistory] = useState<RewriteRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/history");
      const data = await res.json();
      if (data.success) {
        setHistory(data.rewrites || []);
      }
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/70 shadow-lg">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-400" />
          <h1 className="text-base font-bold text-white">Rewrite History & Evolution ({history.length})</h1>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Review previous draft transformations, technical preservation scores, and load any past output back into the workbench.
        </p>
      </div>

      {history.length === 0 ? (
        <div className="py-16 text-center text-slate-400 border border-dashed border-slate-800 rounded-2xl">
          <FileText className="w-8 h-8 mx-auto mb-2 text-slate-400 opacity-60" />
          <p className="text-xs">No rewrites generated yet. Head over to the Rewrite Studio to transform your first draft.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {history.map((item) => {
            const score = item.fidelity_data?.fidelityScore ?? 100;
            return (
              <div
                key={item.id}
                className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 shadow-md space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      {item.section_type}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-mono px-2 py-0.5 rounded border ${
                        score >= 95
                          ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/50"
                          : "bg-amber-950/40 text-amber-300 border-amber-800/50"
                      }`}
                    >
                      Fidelity: {score}%
                    </span>

                    <button
                      onClick={() => onLoadIntoStudio(item.draft_input, item.user_final_text || item.rewritten_output, item.section_type, item.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                    >
                      <span>Open in Studio</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-serif leading-relaxed">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60 text-slate-400">
                    <span className="block font-sans text-[10px] uppercase font-semibold text-slate-400 mb-1">
                      Draft Input
                    </span>
                    <p className="line-clamp-4">{item.draft_input}</p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/90 border border-indigo-950/60 text-slate-200">
                    <span className="block font-sans text-[10px] uppercase font-semibold text-indigo-400 mb-1">
                      {item.user_final_text ? "Final Refined Output" : "VoiceDNA Output"}
                    </span>
                    <p className="line-clamp-4">{item.user_final_text || item.rewritten_output}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

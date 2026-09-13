"use client";

import React from "react";
import {
  Dna,
  Sparkles,
  BookOpen,
  Brain,
  Clock,
  Settings as SettingsIcon,
  FolderArchive,
  Terminal,
} from "lucide-react";
import { AppSettings } from "@/lib/db/queries";

export interface OllamaStatusHeader {
  running: boolean;
  models: string[];
  hasTargetModel: boolean;
  command: string;
  error?: string;
}

interface HeaderProps {
  activeTab: "rewrite" | "corpus" | "dna" | "training" | "rules" | "history";
  setActiveTab: (tab: "rewrite" | "corpus" | "dna" | "training" | "rules" | "history") => void;
  settings: AppSettings | null;
  ollamaStatus?: OllamaStatusHeader | null;
  onOpenSettings: () => void;
  documentCount: number;
  corpusCount?: number;
  rulesCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  settings,
  ollamaStatus,
  onOpenSettings,
  documentCount,
  corpusCount = 0,
  rulesCount,
}) => {
  const isOllamaRunning = ollamaStatus?.running ?? false;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-emerald-500 p-[1px] shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                <Dna className="w-5 h-5 text-indigo-400 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                  VoiceDNA
                </span>
                <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Academic Assistant
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Personal Style Learning & Rewriter</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800/80">
            <button
              onClick={() => setActiveTab("rewrite")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "rewrite"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Rewrite Studio</span>
            </button>

            <button
              onClick={() => setActiveTab("corpus")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "corpus"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <FolderArchive className="w-3.5 h-3.5" />
              <span>Corpus Manager</span>
              {corpusCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
                  {corpusCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("dna")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "dna"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Dna className="w-3.5 h-3.5" />
              <span>Voice DNA Matrix</span>
            </button>

            <button
              onClick={() => setActiveTab("training")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "training"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Training Papers</span>
              {documentCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-indigo-300 font-mono">
                  {documentCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("rules")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "rules"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              <span>Learned Rules</span>
              {rulesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-800/50 font-mono">
                  {rulesCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "history"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>History</span>
            </button>
          </nav>

          {/* Right Action: Connectivity Status Pill & Settings */}
          <div className="flex items-center gap-2.5">
            {/* Reachability Status */}
            {isOllamaRunning ? (
              <button
                onClick={onOpenSettings}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 transition shadow-sm"
                title="Local Ollama is running at http://localhost:11434"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-xs font-semibold">Connected to Ollama</span>
              </button>
            ) : (
              <button
                onClick={onOpenSettings}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/40 hover:bg-amber-500/20 text-amber-300 transition shadow-sm animate-pulse"
                title="Click to view Ollama launch command: ollama run qwen3:8b"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="text-xs font-semibold">Start Ollama</span>
              </button>
            )}

            {/* Optional OpenAI Indicator if explicitly activated */}
            {settings?.provider === "openai" && (
              <div className="hidden lg:flex items-center px-2 py-1 rounded-lg text-[10px] font-mono bg-indigo-950/80 text-indigo-300 border border-indigo-800">
                OpenAI (Optional)
              </div>
            )}

            <button
              onClick={onOpenSettings}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition shadow-sm"
              title="Click to configure Model and AI Provider"
            >
              <SettingsIcon className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

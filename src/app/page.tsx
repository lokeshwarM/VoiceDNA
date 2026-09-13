"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { RewriteStudio } from "@/components/RewriteStudio";
import { VoiceMatrix } from "@/components/VoiceMatrix";
import { TrainingPapers } from "@/components/TrainingPapers";
import { LearnedRules } from "@/components/LearnedRules";
import { HistoryViewer } from "@/components/HistoryViewer";
import { SettingsModal } from "@/components/SettingsModal";
import { AppSettings, VoiceProfile, TrainingDocument, LearnedRule } from "@/lib/db/queries";
import { Sparkles, Dna, ShieldCheck, Database, Terminal } from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"rewrite" | "dna" | "training" | "rules" | "history">("rewrite");
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // App Data State
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [documents, setDocuments] = useState<TrainingDocument[]>([]);
  const [learnedRules, setLearnedRules] = useState<LearnedRule[]>([]);
  const [stats, setStats] = useState({
    documentCount: 0,
    totalWordsAnalyzed: 0,
    activeRulesCount: 0,
  });

  // Loaded draft from history
  const [loadedFromHistory, setLoadedFromHistory] = useState<{
    draft: string;
    output: string;
    sectionType: string;
    id: string;
  } | null>(null);

  // Initial fetch on mount
  useEffect(() => {
    refreshAllData();
  }, []);

  const refreshAllData = async () => {
    await Promise.all([
      fetchSettings(),
      fetchVoiceDna(),
      fetchDocuments(),
      fetchLearnedRules(),
    ]);
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(data.settings);
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  };

  const fetchVoiceDna = async () => {
    try {
      const res = await fetch("/api/voice/dna");
      const data = await res.json();
      if (data.success) {
        if (data.profile) setVoiceProfile(data.profile);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error("Error loading voice DNA:", err);
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (data.success && data.documents) {
        setDocuments(data.documents);
      }
    } catch (err) {
      console.error("Error loading documents:", err);
    }
  };

  const fetchLearnedRules = async () => {
    try {
      const res = await fetch("/api/voice/rules");
      const data = await res.json();
      if (data.success && data.rules) {
        setLearnedRules(data.rules);
      }
    } catch (err) {
      console.error("Error loading rules:", err);
    }
  };

  const handleRuleToggled = async (id: string, is_active: boolean) => {
    try {
      await fetch(`/api/voice/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active }),
      });
      fetchLearnedRules();
      fetchVoiceDna();
    } catch (err) {
      console.error("Error toggling rule:", err);
    }
  };

  const handleRuleDeleted = async (id: string) => {
    try {
      await fetch(`/api/voice/rules/${id}`, { method: "DELETE" });
      fetchLearnedRules();
      fetchVoiceDna();
    } catch (err) {
      console.error("Error deleting rule:", err);
    }
  };

  const handleRebuildVoiceProfile = async () => {
    const res = await fetch("/api/voice/rebuild", { method: "POST" });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "Failed to rebuild Voice profile.");
    }
    await fetchVoiceDna();
  };

  const handleLoadIntoStudio = (draft: string, output: string, sectionType: string, id: string) => {
    setLoadedFromHistory({ draft, output, sectionType, id });
    setActiveTab("rewrite");
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white font-sans antialiased">
      {/* Top Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        settings={settings}
        onOpenSettings={() => setSettingsModalOpen(true)}
        documentCount={documents.length}
        rulesCount={stats.activeRulesCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "rewrite" && (
          <RewriteStudio
            initialDraft={loadedFromHistory?.draft || ""}
            initialOutput={loadedFromHistory?.output || ""}
            initialSection={loadedFromHistory?.sectionType || "Methodology & Experimental Design"}
            initialId={loadedFromHistory?.id || ""}
            onRuleLearned={() => {
              fetchLearnedRules();
              fetchVoiceDna();
            }}
            activeRulesCount={stats.activeRulesCount}
          />
        )}

        {activeTab === "dna" && (
          <VoiceMatrix
            profile={voiceProfile}
            stats={stats}
            onRebuildProfile={handleRebuildVoiceProfile}
          />
        )}

        {activeTab === "training" && (
          <TrainingPapers
            documents={documents}
            onDocumentAdded={() => {
              fetchDocuments();
              fetchVoiceDna();
            }}
            onDocumentDeleted={() => {
              fetchDocuments();
              fetchVoiceDna();
            }}
          />
        )}

        {activeTab === "rules" && (
          <LearnedRules
            rules={learnedRules}
            onRuleToggled={handleRuleToggled}
            onRuleDeleted={handleRuleDeleted}
            onRuleAdded={() => {
              fetchLearnedRules();
              fetchVoiceDna();
            }}
          />
        )}

        {activeTab === "history" && (
          <HistoryViewer onLoadIntoStudio={handleLoadIntoStudio} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-6 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 font-semibold text-slate-300">
              <Dna className="w-3.5 h-3.5 text-indigo-400" />
              <span>VoiceDNA</span>
            </span>
            <span>•</span>
            <span>Academic Personal Workbench</span>
            <span>•</span>
            <span className="text-emerald-400 font-mono">Zero Verbatim Copying Guaranteed</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1 font-mono">
              <Database className="w-3 h-3 text-slate-400" />
              <span>SQLite (voicedna.db)</span>
            </span>
            <button
              onClick={() => setSettingsModalOpen(true)}
              className="text-indigo-400 hover:text-indigo-300 transition underline underline-offset-2"
            >
              Engine Settings
            </button>
          </div>
        </div>
      </footer>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        onSettingsUpdated={fetchSettings}
      />
    </div>
  );
}

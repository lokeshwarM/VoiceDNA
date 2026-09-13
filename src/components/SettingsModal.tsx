"use client";

import React, { useState, useEffect } from "react";
import { X, Cpu, Key, Globe, Check, AlertCircle, RefreshCw, Terminal, Copy } from "lucide-react";
import { AppSettings } from "@/lib/db/queries";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsUpdated?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSettingsUpdated }) => {
  const [settings, setSettings] = useState<AppSettings>({
    provider: "ollama",
    openai_api_key: "",
    openai_model: "gpt-4o",
    ollama_base_url: "http://localhost:11434",
    ollama_model: "qwen3:8b",
  });
  const [ollamaStatus, setOllamaStatus] = useState<{
    running: boolean;
    models: string[];
    hasTargetModel: boolean;
    command: string;
    error?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; command?: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(data.settings);
      }
      if (data.ollamaStatus) {
        setOllamaStatus(data.ollamaStatus);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setSaveMessage(null);
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMessage("Settings saved. VoiceDNA is configured.");
        if (data.ollamaStatus) setOllamaStatus(data.ollamaStatus);
        if (onSettingsUpdated) onSettingsUpdated();
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch (err: any) {
      setSaveMessage(`Error saving settings: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, test: true }),
      });
      const data = await res.json();
      if (data.testResult) {
        setTestResult(data.testResult);
      } else if (data.error) {
        setTestResult({ success: false, message: data.error });
      }
      if (data.ollamaStatus) {
        setOllamaStatus(data.ollamaStatus);
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const currentRunCommand = `ollama run ${settings.ollama_model || "qwen3:8b"}`;

  const handleCopyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-200 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Local Model Settings</h2>
              <p className="text-xs text-slate-400">100% offline personal writing assistant via Ollama</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-5 space-y-5">
          {/* Provider Selection (Ollama is the primary default) */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Selected Engine</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setSettings({ ...settings, provider: "ollama" })}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition ${
                  settings.provider === "ollama"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>Ollama (Default)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 font-normal">Local / Offline</span>
              </button>

              <button
                type="button"
                onClick={() => setSettings({ ...settings, provider: "openai" })}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition ${
                  settings.provider === "openai"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>OpenAI</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 font-normal">Cloud Optional</span>
              </button>
            </div>
          </div>

          {/* Primary Ollama Local Configuration */}
          {settings.provider === "ollama" && (
            <div className="space-y-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800/80">
              {/* Ollama Status Alert Banner if offline */}
              {ollamaStatus && !ollamaStatus.running && (
                <div className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-800/60 text-amber-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-amber-300">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Ollama is not running locally</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Run this command in your PowerShell / Terminal to download and launch the model offline:
                  </p>
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/60 border border-amber-800/50 font-mono text-emerald-300 text-xs">
                    <span className="flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-amber-400" />
                      <span>{currentRunCommand}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyCommand(currentRunCommand)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[10px] flex items-center gap-1 transition"
                    >
                      {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCmd ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Ollama Running Status */}
              {ollamaStatus && ollamaStatus.running && (
                <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="font-semibold">Ollama is running locally</span>
                  <span className="text-slate-400 font-mono">({ollamaStatus.models.length} local models found)</span>
                </div>
              )}

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300 mb-1.5">
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Ollama Local Base URL</span>
                </label>
                <input
                  type="text"
                  placeholder="http://localhost:11434"
                  value={settings.ollama_base_url}
                  onChange={(e) => setSettings({ ...settings, ollama_base_url: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Ollama Model</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="qwen3:8b"
                    value={settings.ollama_model}
                    onChange={(e) => setSettings({ ...settings, ollama_model: e.target.value })}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  <select
                    onChange={(e) => {
                      if (e.target.value) setSettings({ ...settings, ollama_model: e.target.value });
                    }}
                    value=""
                    className="px-2 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300"
                  >
                    <option value="">Presets...</option>
                    <option value="qwen3:8b">qwen3:8b (Default)</option>
                    <option value="qwen2.5:7b">qwen2.5:7b</option>
                    <option value="qwen2.5:14b">qwen2.5:14b</option>
                    <option value="qwen2.5:32b">qwen2.5:32b</option>
                    <option value="qwen2.5-coder:7b">qwen2.5-coder:7b</option>
                  </select>
                </div>
              </div>

              {/* Exact terminal launch button/card */}
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-[11px] text-slate-400 block mb-1.5">To launch or download this model offline:</span>
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/70 border border-slate-800 font-mono text-emerald-300 text-xs">
                  <span className="flex items-center gap-1.5 truncate">
                    <Terminal className="w-3.5 h-3.5 text-slate-400" />
                    <span>{currentRunCommand}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyCommand(currentRunCommand)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[10px] flex items-center gap-1 shrink-0 transition"
                  >
                    {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCmd ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Optional OpenAI Configuration */}
          {settings.provider === "openai" && (
            <div className="space-y-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300 mb-1.5">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  <span>OpenAI API Key (Optional)</span>
                </label>
                <input
                  type="password"
                  placeholder="sk-proj-..."
                  value={settings.openai_api_key}
                  onChange={(e) => setSettings({ ...settings, openai_api_key: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">OpenAI Model</label>
                <select
                  value={settings.openai_model}
                  onChange={(e) => setSettings({ ...settings, openai_model: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4.5-preview">gpt-4.5-preview</option>
                  <option value="gpt-5-preview">gpt-5-preview</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                </select>
              </div>
            </div>
          )}

          {/* Test Connection Result */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                testResult.success
                  ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/50"
                  : "bg-rose-950/40 text-rose-300 border-rose-800/50"
              }`}
            >
              <div className="flex items-start gap-2">
                {testResult.success ? (
                  <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                )}
                <span className="break-words font-medium">{testResult.message}</span>
              </div>

              {/* If test failed, show exact command button */}
              {!testResult.success && testResult.command && (
                <div className="mt-2 pt-2 border-t border-rose-800/40 flex items-center justify-between gap-2 p-2 rounded-lg bg-black/60 font-mono text-emerald-300 text-[11px]">
                  <span>{testResult.command}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyCommand(testResult.command!)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white text-[10px] flex items-center gap-1 transition"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy Command</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {saveMessage && (
            <p className="text-xs text-center font-medium text-emerald-400">{saveMessage}</p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? "animate-spin" : ""}`} />
            <span>{testing ? "Testing..." : "Test Local Connection"}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/30 transition disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "voicedna.db");

// Ensure directory exists if custom path
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(dbPath);
    dbInstance.pragma("journal_mode = WAL");
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS training_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      file_type TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      word_count INTEGER NOT NULL,
      local_path TEXT,
      metrics TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voice_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      tone_descriptors TEXT,
      sentence_cadence TEXT,
      preferred_transitions TEXT,
      rhetorical_habits TEXT,
      synthesized_guidelines TEXT,
      profile_json TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rewrite_history (
      id TEXT PRIMARY KEY,
      title TEXT,
      section_type TEXT NOT NULL,
      draft_input TEXT NOT NULL,
      rewritten_output TEXT NOT NULL,
      user_final_text TEXT,
      fidelity_data TEXT,
      verbatim_check TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS learned_rules (
      id TEXT PRIMARY KEY,
      rewrite_id TEXT,
      rule_text TEXT NOT NULL,
      category TEXT NOT NULL,
      before_snippet TEXT,
      after_snippet TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  try {
    db.exec(`ALTER TABLE training_documents ADD COLUMN local_path TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE voice_profiles ADD COLUMN profile_json TEXT;`);
  } catch {}

  // Initialize default settings (Ollama as primary local engine)
  const defaultSettings: Record<string, string> = {
    provider: "ollama", // default provider = "ollama"
    openai_api_key: process.env.OPENAI_API_KEY || "",
    openai_model: "gpt-4o",
    ollama_base_url: "http://localhost:11434",
    ollama_model: "qwen3:8b", // default model = "qwen3:8b"
  };

  const getStmt = db.prepare("SELECT value FROM app_settings WHERE key = ?");
  const setStmt = db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)");
  const updateStmt = db.prepare("UPDATE app_settings SET value = ? WHERE key = ?");

  for (const [key, value] of Object.entries(defaultSettings)) {
    const row = getStmt.get(key);
    if (!row) {
      setStmt.run(key, value);
    }
  }

  // Ensure default is switched to Ollama qwen3:8b
  const currentProvider = getStmt.get("provider") as { value: string } | undefined;
  const currentKey = getStmt.get("openai_api_key") as { value: string } | undefined;
  if (!currentProvider || (currentProvider.value === "openai" && (!currentKey || !currentKey.value))) {
    updateStmt.run("ollama", "provider");
  }
  const currentOllamaModel = getStmt.get("ollama_model") as { value: string } | undefined;
  if (!currentOllamaModel || currentOllamaModel.value === "qwen2.5:7b") {
    updateStmt.run("qwen3:8b", "ollama_model");
  }

  // Initialize default Voice DNA profile if none exists
  const profileRow = db.prepare("SELECT id FROM voice_profiles WHERE is_active = 1").get();
  if (!profileRow) {
    db.prepare(`
      INSERT INTO voice_profiles (
        id, name, is_active, tone_descriptors, sentence_cadence,
        preferred_transitions, rhetorical_habits, synthesized_guidelines, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "default-profile",
      "Initial Academic Voice",
      1,
      JSON.stringify(["Analytical", "Precision-Oriented", "Measured Hedging", "Objective"]),
      JSON.stringify({
        avgSentenceLength: 22.4,
        variance: "moderate-high",
        compoundComplexRatio: 0.65,
      }),
      JSON.stringify(["consequently", "furthermore", "notably", "in contrast", "fundamentally"]),
      JSON.stringify([
        "Frames context before introducing empirical evidence",
        "Employs disciplined epistemic hedging (e.g., 'suggests', 'indicates') rather than absolute assertions",
        "Uses active voice for author methodology ('we construct', 'we analyze') and passive voice for experimental conditions",
      ]),
      `# Default Academic Voice Guidelines
- Maintain rigorous scholarly tone with deliberate syntactic rhythm.
- Vary sentence length: use compact declarative sentences (12-16 words) for core findings, followed by compound-complex explanatory sentences (24-32 words) for theoretical implications.
- Favor precise transitional signposting (e.g., 'notably', 'consequently', 'conversely').
- Strictly preserve all mathematical formulations, technical figures, statistical metrics, and bibliographic citations.
- Never use colloquialisms or generic conversational filler.`,
      new Date().toISOString()
    );
  }
}

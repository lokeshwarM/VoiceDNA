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
      is_active INTEGER DEFAULT 0,
      observed_count INTEGER DEFAULT 1,
      accepted_count INTEGER DEFAULT 1,
      rejected_count INTEGER DEFAULT 0,
      confidence_pct REAL DEFAULT 100.0,
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
  try {
    db.exec(`ALTER TABLE learned_rules ADD COLUMN observed_count INTEGER DEFAULT 1;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE learned_rules ADD COLUMN accepted_count INTEGER DEFAULT 1;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE learned_rules ADD COLUMN rejected_count INTEGER DEFAULT 0;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE learned_rules ADD COLUMN confidence_pct REAL DEFAULT 100.0;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE training_documents ADD COLUMN is_personal INTEGER DEFAULT 1;`);
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

  // Clean up any legacy demo / sample documents
  try {
    db.prepare("DELETE FROM training_documents WHERE file_type = 'sample' OR title LIKE '%(Sample)%'").run();
  } catch {}
}


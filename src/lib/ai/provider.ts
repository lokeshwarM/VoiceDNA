import { getAppSettings, AppSettings } from "../db/queries";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequestOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  overrideSettings?: Partial<AppSettings>;
}

export interface OllamaStatus {
  running: boolean;
  models: string[];
  hasTargetModel: boolean;
  command: string;
  error?: string;
}

export async function checkOllamaStatus(
  baseUrl: string = "http://localhost:11434",
  targetModel: string = "qwen3:8b"
): Promise<OllamaStatus> {
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  const defaultCommand = `ollama run ${targetModel}`;

  try {
    const res = await fetch(`${cleanUrl}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) {
      return {
        running: false,
        models: [],
        hasTargetModel: false,
        command: defaultCommand,
        error: `Ollama returned HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const models: string[] = (data.models || []).map((m: any) => m.name);
    const hasTargetModel = models.some(
      (name) => name === targetModel || name.startsWith(`${targetModel}:`) || name.startsWith(targetModel)
    );

    return {
      running: true,
      models,
      hasTargetModel,
      command: defaultCommand,
    };
  } catch (err: any) {
    return {
      running: false,
      models: [],
      hasTargetModel: false,
      command: defaultCommand,
      error: err.message,
    };
  }
}

export async function callLLM(options: LLMRequestOptions): Promise<string> {
  const currentSettings = getAppSettings();
  const settings: AppSettings = {
    ...currentSettings,
    ...(options.overrideSettings || {}),
  };

  const temperature = options.temperature ?? 0.3;

  // Ollama is the default primary offline local provider
  if (settings.provider === "ollama") {
    const baseUrl = (settings.ollama_base_url || "http://localhost:11434").replace(/\/+$/, "");
    const model = settings.ollama_model || "qwen3:8b";
    const launchCommand = `ollama run ${model}`;

    const payload: any = {
      model,
      messages: options.messages,
      stream: false,
      options: {
        temperature,
      },
    };

    if (options.jsonMode) {
      payload.format = "json";
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120000),
      });
    } catch (err: any) {
      throw new Error(
        `Ollama is not running at ${baseUrl}. Please start Ollama by running:\n\n${launchCommand}`
      );
    }

    if (!response.ok) {
      const errBody = await response.text();
      if (response.status === 404 || errBody.toLowerCase().includes("not found")) {
        throw new Error(
          `Model '${model}' is not installed in your local Ollama. Please download and start it by running:\n\n${launchCommand}`
        );
      }
      throw new Error(`Ollama API error (${response.status}): ${errBody}\nRun command: ${launchCommand}`);
    }

    const data = await response.json();
    const content = data.message?.content;
    if (!content) {
      throw new Error(`Ollama returned an empty response for model '${model}'.`);
    }
    return content;
  } else {
    // Optional fallback provider (OpenAI) if user explicitly switched
    const apiKey = settings.openai_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OpenAI API key is not configured. Please enter your API key in Settings or switch to Ollama (recommended local offline mode)."
      );
    }

    const payload: any = {
      model: settings.openai_model || "gpt-4o",
      messages: options.messages,
      temperature,
    };

    if (options.maxTokens) {
      payload.max_tokens = options.maxTokens;
    }

    if (options.jsonMode) {
      payload.response_format = { type: "json_object" };
    }

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      throw new Error(`Failed to contact OpenAI API: ${err.message}`);
    }

    if (!response.ok) {
      const errBody = await response.text();
      let parsedMessage = errBody;
      try {
        const json = JSON.parse(errBody);
        if (json.error?.message) parsedMessage = json.error.message;
      } catch {}
      throw new Error(`OpenAI API error (${response.status}): ${parsedMessage}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty response.");
    }
    return content;
  }
}

export async function testProviderConnection(settings: AppSettings): Promise<{
  success: boolean;
  message: string;
  command?: string;
}> {
  try {
    const testMsg: ChatMessage[] = [
      { role: "system", content: "You are a concise academic assistant." },
      { role: "user", content: "Reply with the single word 'OK'." },
    ];
    const reply = await callLLM({
      messages: testMsg,
      temperature: 0.1,
      maxTokens: 10,
      overrideSettings: settings,
    });
    return {
      success: true,
      message: `Connection successful! Local model '${settings.ollama_model || "qwen3:8b"}' responded: "${reply.trim().slice(0, 50)}"`,
    };
  } catch (err: any) {
    const model = settings.ollama_model || "qwen3:8b";
    return {
      success: false,
      message: err.message,
      command: settings.provider === "ollama" ? `ollama run ${model}` : undefined,
    };
  }
}

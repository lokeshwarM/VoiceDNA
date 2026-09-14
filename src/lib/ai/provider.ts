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

export interface LLMStreamTiming {
  requestStart: number;
  timeToFirstTokenMs: number;
  totalGenerationMs: number;
}

export interface LLMStreamOptions extends LLMRequestOptions {
  onToken?: (token: string) => void;
  firstTokenTimeoutMs?: number; // default 20000 (20s safeguard)
}

export interface LLMStreamResult {
  content: string;
  timing: LLMStreamTiming;
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

/**
 * Executes a streaming LLM call.
 * For Ollama /api/chat:
 * - Uses stream: true
 * - Adds top-level think: false (suppressing Qwen3 / DeepSeek reasoning overhead)
 * - Adds keep_alive: "10m"
 * - Dispatches tokens progressively via onToken
 * - Ignores message.thinking tokens
 * - Enforces a 20-second first-token watchdog
 * - Measures requestStart, timeToFirstTokenMs, and totalGenerationMs
 */
export async function callLLMStream(options: LLMStreamOptions): Promise<LLMStreamResult> {
  const currentSettings = getAppSettings();
  const settings: AppSettings = {
    ...currentSettings,
    ...(options.overrideSettings || {}),
  };

  const temperature = options.temperature ?? 0.2;
  const requestStart = Date.now();
  let timeToFirstTokenMs = 0;
  let receivedFirstToken = false;
  let accumulatedContent = "";

  const abortController = new AbortController();
  const firstTokenTimeoutMs = options.firstTokenTimeoutMs ?? 20000;

  // 20-second first-token watchdog
  const watchdogTimer = setTimeout(() => {
    if (!receivedFirstToken) {
      abortController.abort(new Error("FIRST_TOKEN_TIMEOUT"));
    }
  }, firstTokenTimeoutMs);

  if (settings.provider === "ollama") {
    const baseUrl = (settings.ollama_base_url || "http://localhost:11434").replace(/\/+$/, "");
    const model = settings.ollama_model || "qwen3:8b";
    const launchCommand = `ollama run ${model}`;

    const payload: any = {
      model,
      messages: options.messages,
      stream: true,
      think: false, // Disables Qwen3 internal reasoning/thinking overhead
      keep_alive: "10m",
      options: {
        temperature,
        num_predict: options.maxTokens || 1024,
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
        signal: abortController.signal,
      });
    } catch (err: any) {
      clearTimeout(watchdogTimer);
      if (
        abortController.signal.aborted &&
        (err?.name === "AbortError" || abortController.signal.reason?.message === "FIRST_TOKEN_TIMEOUT")
      ) {
        throw new Error(
          `Ollama did not produce any tokens within 20 seconds. Please check that Ollama is running and responsive:\n\n${launchCommand}`
        );
      }
      if (err.name === "TimeoutError" || err.message?.toLowerCase().includes("timeout")) {
        throw new Error(
          `Ollama request timed out while generating with '${model}'. The model is computing on CPU/GPU. Try running '${launchCommand}' in terminal.`
        );
      }
      throw new Error(
        `Ollama is not running at ${baseUrl}. Please start Ollama by running:\n\n${launchCommand}`
      );
    }

    if (!response.ok) {
      clearTimeout(watchdogTimer);
      const errBody = await response.text();
      if (response.status === 404 || errBody.toLowerCase().includes("not found")) {
        throw new Error(
          `Model '${model}' is not installed in your local Ollama. Please download and start it by running:\n\n${launchCommand}`
        );
      }
      throw new Error(`Ollama API error (${response.status}): ${errBody}\nRun command: ${launchCommand}`);
    }

    if (!response.body) {
      clearTimeout(watchdogTimer);
      throw new Error("Ollama returned an empty response body stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let chunk: any;
          try {
            chunk = JSON.parse(line);
          } catch {
            continue;
          }

          // Ignore thinking chunks from reasoning models - never expose internal reasoning
          if (chunk.message?.thinking) {
            continue;
          }

          let token = chunk.message?.content || "";
          if (!token && chunk.response) {
            token = chunk.response;
          }

          if (token) {
            // Strip any <think> tags defensively if emitted into content
            token = token.replace(/<think>[\s\S]*?<\/think>/gi, "");
            token = token.replace(/<\/?think>/gi, "");

            if (token) {
              if (!receivedFirstToken) {
                receivedFirstToken = true;
                clearTimeout(watchdogTimer);
                timeToFirstTokenMs = Date.now() - requestStart;
              }
              accumulatedContent += token;
              options.onToken?.(token);
            }
          }
        }
      }
    } catch (err: any) {
      clearTimeout(watchdogTimer);
      if (
        abortController.signal.aborted &&
        (err?.name === "AbortError" || abortController.signal.reason?.message === "FIRST_TOKEN_TIMEOUT")
      ) {
        throw new Error(
          `Ollama did not produce any tokens within 20 seconds. Please check that Ollama is running and responsive:\n\n${launchCommand}`
        );
      }
      throw err;
    } finally {
      clearTimeout(watchdogTimer);
    }

    const totalGenerationMs = Date.now() - requestStart;
    const cleanContent = accumulatedContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    return {
      content: cleanContent,
      timing: {
        requestStart,
        timeToFirstTokenMs: timeToFirstTokenMs || totalGenerationMs,
        totalGenerationMs,
      },
    };
  } else {
    // Optional fallback provider (OpenAI)
    const apiKey = settings.openai_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      clearTimeout(watchdogTimer);
      throw new Error(
        "OpenAI API key is not configured. Please enter your API key in Settings or switch to Ollama (recommended local offline mode)."
      );
    }

    const payload: any = {
      model: settings.openai_model || "gpt-4o",
      messages: options.messages,
      temperature,
      stream: true,
    };

    if (options.maxTokens) {
      payload.max_tokens = options.maxTokens;
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
        signal: abortController.signal,
      });
    } catch (err: any) {
      clearTimeout(watchdogTimer);
      if (
        abortController.signal.aborted &&
        (err?.name === "AbortError" || abortController.signal.reason?.message === "FIRST_TOKEN_TIMEOUT")
      ) {
        throw new Error("OpenAI did not produce any tokens within 20 seconds.");
      }
      throw new Error(`Failed to contact OpenAI API: ${err.message}`);
    }

    if (!response.ok) {
      clearTimeout(watchdogTimer);
      const errBody = await response.text();
      let parsedMessage = errBody;
      try {
        const json = JSON.parse(errBody);
        if (json.error?.message) parsedMessage = json.error.message;
      } catch {}
      throw new Error(`OpenAI API error (${response.status}): ${parsedMessage}`);
    }

    if (!response.body) {
      clearTimeout(watchdogTimer);
      throw new Error("OpenAI returned an empty response stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === "[DONE]") break;

          try {
            const data = JSON.parse(dataStr);
            const token = data.choices?.[0]?.delta?.content || "";
            if (token) {
              if (!receivedFirstToken) {
                receivedFirstToken = true;
                clearTimeout(watchdogTimer);
                timeToFirstTokenMs = Date.now() - requestStart;
              }
              accumulatedContent += token;
              options.onToken?.(token);
            }
          } catch {}
        }
      }
    } finally {
      clearTimeout(watchdogTimer);
    }

    const totalGenerationMs = Date.now() - requestStart;

    return {
      content: accumulatedContent.trim(),
      timing: {
        requestStart,
        timeToFirstTokenMs: timeToFirstTokenMs || totalGenerationMs,
        totalGenerationMs,
      },
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
      think: false, // Disables Qwen3 internal reasoning/thinking overhead
      keep_alive: "10m",
      options: {
        temperature,
        num_predict: options.maxTokens || 1024,
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
        signal: AbortSignal.timeout(300000),
      });
    } catch (err: any) {
      if (err.name === "TimeoutError" || err.message?.toLowerCase().includes("timeout")) {
        throw new Error(
          `Ollama request timed out while generating with '${model}'. The model is computing on CPU/GPU. Try running '${launchCommand}' in terminal.`
        );
      }
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
    let content = (data.message?.content || "").trim();
    if (!content && data.message?.thinking) {
      content = data.message.thinking.trim();
    }
    if (!content && data.response) {
      content = data.response.trim();
    }
    if (!content) {
      throw new Error(`Ollama returned an empty response for model '${model}'.`);
    }
    // Strip <think> tags if model embedded them directly into content
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
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
      maxTokens: 120,
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

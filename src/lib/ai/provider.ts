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

export async function callLLM(options: LLMRequestOptions): Promise<string> {
  const currentSettings = getAppSettings();
  const settings: AppSettings = {
    ...currentSettings,
    ...(options.overrideSettings || {}),
  };

  const temperature = options.temperature ?? 0.3;

  if (settings.provider === "openai") {
    const apiKey = settings.openai_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OpenAI API key is not configured. Please enter your API key in Model Settings (top right gear icon) or set OPENAI_API_KEY in .env.local."
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
  } else {
    // Ollama Provider
    const baseUrl = (settings.ollama_base_url || "http://localhost:11434").replace(/\/+$/, "");
    const model = settings.ollama_model || "qwen2.5:7b";

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
      });
    } catch (err: any) {
      throw new Error(
        `Failed to reach Ollama at ${baseUrl}. Ensure Ollama is running (e.g. 'ollama serve') and accessible: ${err.message}`
      );
    }

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    const content = data.message?.content;
    if (!content) {
      throw new Error(`Ollama returned an empty response for model '${model}'.`);
    }
    return content;
  }
}

export async function testProviderConnection(settings: AppSettings): Promise<{ success: boolean; message: string }> {
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
      message: `Connection successful! Response: "${reply.trim().slice(0, 50)}"`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message,
    };
  }
}

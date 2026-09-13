import { NextRequest, NextResponse } from "next/server";
import { getAppSettings, updateAppSettings } from "@/lib/db/queries";
import { testProviderConnection, checkOllamaStatus } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = getAppSettings();
    const ollamaStatus = await checkOllamaStatus(settings.ollama_base_url, settings.ollama_model);

    return NextResponse.json({
      success: true,
      settings,
      ollamaStatus,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, openai_api_key, openai_model, ollama_base_url, ollama_model, test } = body;

    const newSettings: any = {};
    if (provider !== undefined) newSettings.provider = provider;
    if (openai_api_key !== undefined) newSettings.openai_api_key = openai_api_key;
    if (openai_model !== undefined) newSettings.openai_model = openai_model;
    if (ollama_base_url !== undefined) newSettings.ollama_base_url = ollama_base_url;
    if (ollama_model !== undefined) newSettings.ollama_model = ollama_model;

    updateAppSettings(newSettings);
    const current = getAppSettings();
    const ollamaStatus = await checkOllamaStatus(current.ollama_base_url, current.ollama_model);

    if (test) {
      const testResult = await testProviderConnection(current);
      return NextResponse.json({
        success: true,
        settings: current,
        testResult,
        ollamaStatus,
      });
    }

    return NextResponse.json({
      success: true,
      settings: current,
      ollamaStatus,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

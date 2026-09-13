import { NextRequest, NextResponse } from "next/server";
import { getAllLearnedRules, addLearnedRule } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rules = getAllLearnedRules();
    return NextResponse.json({ success: true, rules });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rule_text, category, before_snippet, after_snippet } = body;

    if (!rule_text || !rule_text.trim()) {
      return NextResponse.json({ success: false, error: "Rule text is required." }, { status: 400 });
    }

    const newRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      rewrite_id: null,
      rule_text: rule_text.trim(),
      category: (category as any) || "style",
      before_snippet: before_snippet || null,
      after_snippet: after_snippet || null,
      is_active: 1,
      created_at: new Date().toISOString(),
    };

    addLearnedRule(newRule);
    return NextResponse.json({ success: true, rule: newRule });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { listAgents } from "@/lib/ai/agents";
import { generateAiPromptsMarkdown } from "@/lib/ai/prompt-export";

function buildFilename(date: Date): string {
  const iso = date.toISOString().replace(/[:]/g, "-");
  return `ai-prompts-${iso}.md`;
}

export async function GET() {
  try {
    const supabase = getAdminSupabaseClient();
    const agents = await listAgents(supabase, { includeModels: true });

    const generatedAt = new Date();
    const markdown = generateAiPromptsMarkdown(agents, { generatedAt });

    return new NextResponse(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildFilename(generatedAt)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Unable to export AI prompts", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erreur inattendue lors de l'export des prompts",
      },
      { status: 500 },
    );
  }
}





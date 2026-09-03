import { NextRequest, NextResponse } from "next/server";
import { questionnaireRepo } from "@/lib/db";
import {
  findMatchingQuestionAnswer,
  saveQuestionAnswer,
  autoFillApplicationQuestions,
} from "@/lib/agents/questionnaireVault";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("query");

    if (query) {
      const match = findMatchingQuestionAnswer(query);
      return NextResponse.json({ success: true, match });
    }

    const items = questionnaireRepo.list();
    return NextResponse.json({ success: true, items });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load questionnaire" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      question?: string;
      answer?: string;
      category?: string;
      batchQuestions?: string[];
    };

    if (Array.isArray(body.batchQuestions) && body.batchQuestions.length > 0) {
      const results = autoFillApplicationQuestions(body.batchQuestions);
      return NextResponse.json({ success: true, results });
    }

    if (!body.question || !body.answer) {
      return NextResponse.json(
        { success: false, error: "Missing required question and answer fields" },
        { status: 400 }
      );
    }

    const entry = saveQuestionAnswer(
      body.question,
      body.answer,
      body.category as unknown as Parameters<typeof saveQuestionAnswer>[2]
    );

    return NextResponse.json({ success: true, entry });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to save question answer" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id parameter" }, { status: 400 });
    }
    questionnaireRepo.remove(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to delete question answer" },
      { status: 500 }
    );
  }
}

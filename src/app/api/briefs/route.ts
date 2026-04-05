import { NextResponse } from "next/server";
import { getAllBriefs } from "@/lib/store";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    await requireAuth();
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const briefs = await getAllBriefs();
  return NextResponse.json({ briefs });
}

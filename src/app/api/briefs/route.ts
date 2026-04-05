import { NextResponse } from "next/server";
import { getAllBriefs } from "@/lib/store";

export async function GET() {
  const briefs = await getAllBriefs();
  return NextResponse.json({ briefs });
}

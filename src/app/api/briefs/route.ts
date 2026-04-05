import { NextResponse } from "next/server";
import { getAllBriefs } from "@/lib/store";

export async function GET() {
  const briefs = getAllBriefs();
  return NextResponse.json({ briefs });
}

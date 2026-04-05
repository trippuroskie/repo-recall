import { NextRequest, NextResponse } from "next/server";
import { getBrief, deleteBrief } from "@/lib/store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const brief = await getBrief(id);
  if (!brief) {
    return NextResponse.json({ error: "Brief not found" }, { status: 404 });
  }
  return NextResponse.json({ brief });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = await deleteBrief(id);
  if (!deleted) {
    return NextResponse.json({ error: "Brief not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

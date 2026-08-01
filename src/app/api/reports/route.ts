import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "This endpoint is deprecated. Please use /api/incidents instead." },
    { status: 410 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "This endpoint is deprecated. Please use /api/incidents instead." },
    { status: 410 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "This endpoint is deprecated. Please use /api/incidents instead." },
    { status: 410 }
  );
}

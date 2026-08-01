import { NextResponse } from "next/server";
import { createFloodReport, type NewFloodReportInput } from "@/lib/floodReports";
import {
  deleteReportFromSupabase,
  fetchReportsFromSupabase,
  insertReportToSupabase
} from "@/lib/supabase";
import type { FloodReport } from "@/lib/types";

export async function GET() {
  const reports = (await fetchReportsFromSupabase()) || [];
  return NextResponse.json({ reports });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NewFloodReportInput;
    const report = createFloodReport(body);

    const inserted = await insertReportToSupabase(report);
    return NextResponse.json({ report, success: inserted }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Report ID required" }, { status: 400 });
    }

    const deleted = await deleteReportFromSupabase(id);
    return NextResponse.json({ success: deleted });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete report" }, { status: 500 });
  }
}

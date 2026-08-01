import { NextResponse } from "next/server";
import { demoFloodReports } from "@/lib/demo-data";
import { createFloodReport, type NewFloodReportInput } from "@/lib/floodReports";
import type { FloodReport } from "@/lib/types";

let reports: FloodReport[] = [...demoFloodReports];

export async function GET() {
  return NextResponse.json({ reports });
}

export async function POST(request: Request) {
  const body = (await request.json()) as NewFloodReportInput;
  const report = createFloodReport(body);
  reports = [report, ...reports];

  return NextResponse.json({ report }, { status: 201 });
}

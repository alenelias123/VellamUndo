import { NextResponse } from "next/server";
import { buildAnalyticsSnapshot } from "@/lib/analytics";
import { demoFloodReports, demoHelpRequests, demoReliefCenters } from "@/lib/demo-data";

export async function GET() {
  return NextResponse.json({
    analytics: buildAnalyticsSnapshot(demoFloodReports, demoHelpRequests, demoReliefCenters)
  });
}

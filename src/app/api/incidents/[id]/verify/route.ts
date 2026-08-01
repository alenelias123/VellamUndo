import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { calculateIncidentConfidence } from "../../route";
import type { SeverityLevel } from "@/lib/types";

export async function POST(request: Request, context: any) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase client is not initialized" }, { status: 503 });
  }

  try {
    const id = context.params?.id;
    if (!id) {
      return NextResponse.json({ error: "Incident ID is required" }, { status: 400 });
    }

    const body = await request.json();
    const { vote, reporter } = body;

    if (!vote || !reporter) {
      return NextResponse.json({ error: "Vote and reporter name are required" }, { status: 400 });
    }

    // 1. Prevent duplicate identical votes by same reporter
    const { data: existingVotes } = await supabase
      .from("incident_verifications")
      .select("*")
      .eq("incident_id", id)
      .eq("reporter", reporter.trim())
      .eq("vote", vote);

    if (existingVotes && existingVotes.length > 0) {
      return NextResponse.json({ error: "You have already cast this verification vote" }, { status: 400 });
    }

    // 2. Insert new verification vote
    const { error: errInsert } = await supabase
      .from("incident_verifications")
      .insert([{
        incident_id: id,
        reporter: reporter.trim(),
        vote: vote
      }]);

    if (errInsert) {
      return NextResponse.json({ error: errInsert.message }, { status: 500 });
    }

    // 3. Fetch all reports and verifications to recalculate parent
    const { data: allReports } = await supabase
      .from("incident_reports")
      .select("*, incident_images(*)")
      .eq("incident_id", id);

    const { data: allVerifications } = await supabase
      .from("incident_verifications")
      .select("*")
      .eq("incident_id", id);

    const { data: parentIncident } = await supabase
      .from("incidents")
      .select("*")
      .eq("id", id)
      .single();

    if (!parentIncident) {
      return NextResponse.json({ error: "Parent incident not found" }, { status: 404 });
    }

    const reportArray = (allReports || []).map((r: any) => ({
      reporter: r.reporter,
      photos: (r.incident_images || []).map((img: any) => img.image_url)
    }));

    const verifArray = (allVerifications || []).map((v: any) => ({
      vote: v.vote,
      reporter: v.reporter
    }));

    // Recalculate confidence
    const newConfidence = calculateIncidentConfidence(reportArray, verifArray, parentIncident.created_at);

    // 4. Update status and severity based on vote consensus
    let newStatus = parentIncident.status;
    let newSeverity = parentIncident.severity;
    let resolvedAt = parentIncident.resolved_at;

    const roadClearedVotes = verifArray.filter((v) => v.vote === "road-cleared");
    const falseReportVotes = verifArray.filter((v) => v.vote === "false-report");
    const stillFloodedVotes = verifArray.filter((v) => v.vote === "still-flooded" || v.vote === "water-rising");

    const isVolunteerClear = roadClearedVotes.some(v => v.reporter.toLowerCase().includes("volunteer") || v.reporter.toLowerCase().includes("admin"));
    const isVolunteerFalse = falseReportVotes.some(v => v.reporter.toLowerCase().includes("volunteer") || v.reporter.toLowerCase().includes("admin"));

    if (isVolunteerFalse || falseReportVotes.length >= 3) {
      newStatus = "archived";
    } else if (isVolunteerClear || roadClearedVotes.length >= 3) {
      newStatus = "resolved";
      newSeverity = "SAFE";
      resolvedAt = new Date().toISOString();
    } else if (stillFloodedVotes.length > 0 && newStatus === "resolved") {
      // Re-activate if marked still flooded
      newStatus = "active";
      resolvedAt = null;
      // Get worst severity from reports
      const severities = (allReports || []).map((r: any) => r.severity as SeverityLevel);
      if (severities.length > 0) {
        let maxSev: SeverityLevel = "SAFE";
        const severityRank: Record<SeverityLevel, number> = {
          SAFE: 0,
          WATERLOGGED: 1,
          KNEE_DEEP: 2,
          WAIST_DEEP: 3,
          NOT_PASSABLE: 4
        };
        for (const s of severities) {
          if (severityRank[s] > severityRank[maxSev]) maxSev = s;
        }
        newSeverity = maxSev;
      }
    }

    // 5. Update the parent incident
    const { error: errUpdate } = await supabase
      .from("incidents")
      .update({
        status: newStatus,
        severity: newSeverity,
        confidence: newConfidence,
        resolved_at: resolvedAt,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (errUpdate) {
      return NextResponse.json({ error: errUpdate.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      confidence: newConfidence,
      status: newStatus,
      severity: newSeverity
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to submit verification" }, { status: 500 });
  }
}

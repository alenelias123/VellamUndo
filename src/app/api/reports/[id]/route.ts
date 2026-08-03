import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { createClient as createServerSupabase } from "@/utils/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SeverityLevel } from "@/lib/types";

type RouteParams = {
  params: Promise<{ id: string }>;
};

function createRequestScopedSupabase(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authHeader = request.headers.get("authorization");

  if (!supabaseUrl || !supabaseKey || !authHeader) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });
}

// Helper to determine roles
function getUserRole(email: string, metadata: any): "admin" | "moderator" | "user" {
  if (metadata?.role === "admin" || email === "admin@vellamundo.org") return "admin";
  if (
    metadata?.role === "moderator" ||
    email.includes("moderator") ||
    email.endsWith("@volunteer.vellamundo.org")
  ) {
    return "moderator";
  }
  return "user";
}

// Severity ranking
const severityRank: Record<SeverityLevel, number> = {
  SAFE: 0,
  WATERLOGGED: 1,
  KNEE_DEEP: 2,
  WAIST_DEEP: 3,
  NOT_PASSABLE: 4
};

function getHighestSeverity(severities: SeverityLevel[]): SeverityLevel {
  let highest: SeverityLevel = "SAFE";
  for (const s of severities) {
    if (severityRank[s] > severityRank[highest]) {
      highest = s;
    }
  }
  return highest;
}

// Calculate confidence
function calculateIncidentConfidence(
  reports: { reporter: string; photos?: string[] }[],
  verifications: { vote: string; reporter: string }[],
  createdAtStr: string
): number {
  let score = 30; // base score
  score += reports.length * 10;
  const uniqueReporters = new Set(reports.map((r) => r.reporter.toLowerCase().trim()));
  score += uniqueReporters.size * 5;
  const totalPhotos = reports.reduce((sum, r) => sum + (r.photos?.length || 0), 0);
  if (totalPhotos > 0) score += 15;

  for (const v of verifications) {
    if (v.vote === "still-flooded" || v.vote === "water-rising") score += 10;
    else if (v.vote === "water-receding") score += 5;
    else if (v.vote === "road-cleared") score -= 15;
    else if (v.vote === "false-report") score -= 25;
  }

  const hasVolunteer =
    reports.some((r) => r.reporter.toLowerCase().includes("volunteer") || r.reporter.toLowerCase().includes("admin")) ||
    verifications.some((v) => v.reporter.toLowerCase().includes("volunteer") || v.reporter.toLowerCase().includes("admin"));
  if (hasVolunteer) score += 20;

  const elapsedMs = Date.now() - new Date(createdAtStr).getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  if (elapsedHours > 12) {
    const decay = Math.floor((elapsedHours - 12) * 2);
    score -= decay;
  }
  return Math.max(5, Math.min(98, score));
}

// PUT to edit a report
export async function PUT(request: Request, { params }: RouteParams) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase client is not initialized" }, { status: 503 });
  }

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Report ID is required" }, { status: 400 });
    }

    const body = await request.json();
    const { notes, severity, ownershipToken } = body;

    // Fetch original report
    const { data: report, error: errReport } = await supabase
      .from("incident_reports")
      .select("*")
      .eq("id", id)
      .single();

    if (errReport || !report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Auth check
    const requestScopedSupabase = createRequestScopedSupabase(request);
    const { data: authData, error: authError } = requestScopedSupabase
      ? await requestScopedSupabase.auth.getUser()
      : { data: { user: null }, error: null };
    const user = authError ? null : authData?.user ?? null;

    let authorized = false;
    let userIdString = "Guest";

    if (user) {
      userIdString = user.email || user.id;
      const role = getUserRole(user.email ?? "", user.user_metadata);
      if (role === "admin" || role === "moderator" || report.reporter_id === user.id) {
        authorized = true;
      }
    } else {
      // Guest verification
      if (report.is_guest_report && report.ownership_token === ownershipToken) {
        // Check 5 minutes limit
        const elapsedMinutes = (Date.now() - new Date(report.created_at).getTime()) / (1000 * 60);
        if (elapsedMinutes <= 5) {
          authorized = true;
        } else {
          return NextResponse.json(
            { error: "This report is locked. Sign in to request changes." },
            { status: 403 }
          );
        }
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized to edit this report" }, { status: 403 });
    }

    // Update the report
    const actor = requestScopedSupabase ?? supabase;

    const { error: errUpdate } = await actor
      .from("incident_reports")
      .update({
        notes: notes ?? report.notes,
        severity: severity ?? report.severity,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (errUpdate) {
      return NextResponse.json({ error: errUpdate.message }, { status: 500 });
    }

    // Insert audit log
    await supabase
      .from("audit_logs")
      .insert([{
        incident_id: report.incident_id,
        user_id: userIdString,
        action: "Update",
        target_table: "incident_reports",
        target_id: id,
        previous_value: { notes: report.notes, severity: report.severity },
        new_value: { notes, severity }
      }]);

    // Recalculate parent incident
    await recalculateIncident(report.incident_id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to edit report" }, { status: 500 });
  }
}

// DELETE to soft-delete a report
export async function DELETE(request: Request, { params }: RouteParams) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase client is not initialized" }, { status: 503 });
  }

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Report ID is required" }, { status: 400 });
    }

    // Guest token can be passed in query param or headers
    const { searchParams } = new URL(request.url);
    const ownershipToken = searchParams.get("token");

    // Fetch original report
    const { data: report, error: errReport } = await supabase
      .from("incident_reports")
      .select("*")
      .eq("id", id)
      .single();

    if (errReport || !report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Auth check
    const requestScopedSupabase = createRequestScopedSupabase(request);
    const { data: authData, error: authError } = requestScopedSupabase
      ? await requestScopedSupabase.auth.getUser()
      : { data: { user: null }, error: null };
    const user = authError ? null : authData?.user ?? null;

    let authorized = false;
    let userIdString = "Guest";

    if (user) {
      userIdString = user.email || user.id;
      const role = getUserRole(user.email ?? "", user.user_metadata);
      if (role === "admin" || report.reporter_id === user.id) {
        authorized = true;
      }
    } else {
      // Guest verification
      if (report.is_guest_report && report.ownership_token === ownershipToken) {
        // Check 5 minutes limit
        const elapsedMinutes = (Date.now() - new Date(report.created_at).getTime()) / (1000 * 60);
        if (elapsedMinutes <= 5) {
          authorized = true;
        } else {
          return NextResponse.json(
            { error: "This report is locked. Sign in to request changes." },
            { status: 403 }
          );
        }
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized to delete this report" }, { status: 403 });
    }

    // Soft delete report
    const actor = requestScopedSupabase ?? supabase;

    const { error: errSoftDelete } = await actor
      .from("incident_reports")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (errSoftDelete) {
      return NextResponse.json({ error: errSoftDelete.message }, { status: 500 });
    }

    // Insert audit log
    await supabase
      .from("audit_logs")
      .insert([{
        incident_id: report.incident_id,
        user_id: userIdString,
        action: "Delete",
        target_table: "incident_reports",
        target_id: id,
        previous_value: { deleted: false },
        new_value: { deleted: true }
      }]);

    // Recalculate parent incident
    await recalculateIncident(report.incident_id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete report" }, { status: 500 });
  }
}

// Core helper to keep parent incident updated
async function recalculateIncident(incidentId: string) {
  if (!supabase) return;
  const { data: allReports } = await supabase
    .from("incident_reports")
    .select("*, incident_images(*)")
    .eq("incident_id", incidentId)
    .is("deleted_at", null);

  const { data: allVerifications } = await supabase
    .from("incident_verifications")
    .select("*")
    .eq("incident_id", incidentId);

  const { data: parentIncident } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", incidentId)
    .single();

  if (!parentIncident) return;

  const reportArray = (allReports || []).map((r: any) => ({
    reporter: r.reporter,
    photos: (r.incident_images || []).map((img: any) => img.image_url)
  }));

  const verifArray = (allVerifications || []).map((v: any) => ({
    vote: v.vote,
    reporter: v.reporter
  }));

  if (reportArray.length === 0) {
    // If no reports left, archive the incident
    await supabase
      .from("incidents")
      .update({
        status: "archived",
        severity: "SAFE",
        confidence: 0,
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", incidentId);

    // Log archive action
    await supabase
      .from("audit_logs")
      .insert([{
        incident_id: incidentId,
        user_id: "System (Auto-Archive)",
        action: "Archive",
        target_table: "incidents",
        target_id: incidentId,
        previous_value: { status: parentIncident.status },
        new_value: { status: "archived" }
      }]);
    return;
  }

  const newConfidence = calculateIncidentConfidence(reportArray, verifArray, parentIncident.created_at);
  const severities = (allReports || []).map((r: any) => r.severity as SeverityLevel);
  const highestSeverity = getHighestSeverity(severities);

  await supabase
    .from("incidents")
    .update({
      severity: highestSeverity,
      confidence: newConfidence,
      updated_at: new Date().toISOString()
    })
    .eq("id", incidentId);
}

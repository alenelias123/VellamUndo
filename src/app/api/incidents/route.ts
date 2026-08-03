import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Coordinates, Incident, IncidentReport, IncidentVerification, SeverityLevel } from "@/lib/types";
import { createClient as createServerSupabase } from "@/utils/supabase/server";
import { cookies } from "next/headers";

// ── Flood stretch path serialisation ─────────────────────────────────────────
// Stored as a jsonb array of { lat, lng } in the `flood_path` column. When the
// cloud database has not been migrated yet we fall back to encoding the path
// inside the landmark text as "[PATH:lat,lng;lat,lng;...]".
function normalizeStretchPath(value: any): Coordinates[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const points = value
    .map((p: any) => {
      const lat = Number(p?.lat ?? p?.[0]);
      const lng = Number(p?.lng ?? p?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng } as Coordinates;
    })
    .filter((p: Coordinates | null): p is Coordinates => p !== null);
  return points.length > 1 ? points : undefined;
}

function encodeStretchPath(path: Coordinates[]): string {
  return path.map((c) => `${c.lat},${c.lng}`).join(";");
}

function decodeStretchPath(encoded: string): Coordinates[] | undefined {
  const points = encoded
    .split(";")
    .map((pair) => {
      const [lat, lng] = pair.split(",").map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng } as Coordinates;
    })
    .filter((p: Coordinates | null): p is Coordinates => p !== null);
  return points.length > 1 ? points : undefined;
}

// Helper for Haversine distance
function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Severity ranks to determine highest severity
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

// Calculate Incident Confidence Score
export function calculateIncidentConfidence(
  reports: { reporter: string; photos?: string[] }[],
  verifications: { vote: string; reporter: string }[],
  createdAtStr: string
): number {
  let score = 30; // base score

  // 1. Number of reports contribution (+10 per report)
  score += reports.length * 10;

  // 2. Independent reporters (+5 per distinct reporter)
  const uniqueReporters = new Set(reports.map((r) => r.reporter.toLowerCase().trim()));
  score += uniqueReporters.size * 5;

  // 3. Photos attached (+15 bonus)
  const totalPhotos = reports.reduce((sum, r) => sum + (r.photos?.length || 0), 0);
  if (totalPhotos > 0) {
    score += 15;
  }

  // 4. Verification votes impact
  for (const v of verifications) {
    if (v.vote === "still-flooded" || v.vote === "water-rising") {
      score += 10;
    } else if (v.vote === "water-receding") {
      score += 5;
    } else if (v.vote === "road-cleared") {
      score -= 15;
    } else if (v.vote === "false-report") {
      score -= 25;
    }
  }

  // 5. Volunteer verification boost (+20)
  const hasVolunteer =
    reports.some((r) => r.reporter.toLowerCase().includes("volunteer") || r.reporter.toLowerCase().includes("admin")) ||
    verifications.some((v) => v.reporter.toLowerCase().includes("volunteer") || v.reporter.toLowerCase().includes("admin"));
  if (hasVolunteer) {
    score += 20;
  }

  // 6. Time decay (-2 per hour after 12h)
  const elapsedMs = Date.now() - new Date(createdAtStr).getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  if (elapsedHours > 12) {
    const decay = Math.floor((elapsedHours - 12) * 2);
    score -= decay;
  }

  return Math.max(5, Math.min(98, score));
}

// GET all incidents joined with child reports, images, verifications, and audit logs
// Optional `?q=` filters the result set across road names, landmarks, districts,
// incident types, severities, report notes and reporters.
export async function GET(request: Request) {
  if (!supabase) {
    return NextResponse.json({ incidents: [] });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase();

  try {
    // 1. Run Auto-Archive self-healing check
    const { data: activeIncidents } = await supabase
      .from("incidents")
      .select("id, status, created_at, updated_at, last_report_at, last_verified_at, needs_verification")
      .neq("status", "archived");

    const now = new Date();
    if (activeIncidents && activeIncidents.length > 0) {
      const toArchiveIds: string[] = [];
      const toVerifyIds: string[] = [];
      const auditLogsToInsert: any[] = [];

      for (const inc of activeIncidents) {
        const dates = [
          new Date(inc.created_at),
          new Date(inc.updated_at),
          inc.last_report_at ? new Date(inc.last_report_at) : null,
          inc.last_verified_at ? new Date(inc.last_verified_at) : null
        ].filter(Boolean) as Date[];
        const lastActivity = new Date(Math.max(...dates.map(d => d.getTime())));
        const elapsedHours = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);

        if (elapsedHours >= 48) {
          toArchiveIds.push(inc.id);
          auditLogsToInsert.push({
            incident_id: inc.id,
            user_id: "System (Auto-Archive)",
            action: "Archive",
            target_table: "incidents",
            target_id: inc.id,
            previous_value: { status: inc.status },
            new_value: { status: "archived" }
          });
        } else if (elapsedHours >= 24 && !inc.needs_verification) {
          toVerifyIds.push(inc.id);
          auditLogsToInsert.push({
            incident_id: inc.id,
            user_id: "System (Auto-Archive)",
            action: "Update",
            target_table: "incidents",
            target_id: inc.id,
            previous_value: { needs_verification: false },
            new_value: { needs_verification: true }
          });
        }
      }

      // Execute batch updates & inserts in parallel
      const dbPromises: any[] = [];

      if (toArchiveIds.length > 0) {
        dbPromises.push(
          supabase
            .from("incidents")
            .update({ status: "archived", archived_at: now.toISOString(), needs_verification: false })
            .in("id", toArchiveIds)
        );
      }

      if (toVerifyIds.length > 0) {
        dbPromises.push(
          supabase
            .from("incidents")
            .update({ needs_verification: true })
            .in("id", toVerifyIds)
        );
      }

      if (auditLogsToInsert.length > 0) {
        dbPromises.push(
          supabase
            .from("audit_logs")
            .insert(auditLogsToInsert)
        );
      }

      if (dbPromises.length > 0) {
        await Promise.all(dbPromises);
      }
    }

    // 2. Fetch all incidents
    const { data: dbIncidents, error: errIncidents } = await supabase
      .from("incidents")
      .select(`
        *,
        incident_reports (
          *,
          incident_images (*)
        ),
        incident_verifications (*),
        audit_logs (*)
      `)
      .order("created_at", { ascending: false });

    if (errIncidents) {
      return NextResponse.json({ error: errIncidents.message }, { status: 500 });
    }

    const mappedIncidents: Incident[] = (dbIncidents || []).map((db: any) => {
      // Exclude soft-deleted reports
      const reports: IncidentReport[] = (db.incident_reports || [])
        .filter((r: any) => !r.deleted_at)
        .map((r: any) => ({
          id: r.id,
          incidentId: r.incident_id,
          severity: r.severity as SeverityLevel,
          notes: r.notes || "",
          reporter: r.reporter || "Anonymous",
          createdAt: r.created_at,
          photos: (r.incident_images || []).map((img: any) => img.image_url),
          ownershipToken: r.ownership_token,
          isGuestReport: r.is_guest_report,
          reporterId: r.reporter_id,
          updatedAt: r.updated_at,
          deletedAt: r.deleted_at
        }));

      const verifications: IncidentVerification[] = (db.incident_verifications || []).map((v: any) => ({
        id: v.id,
        incidentId: v.incident_id,
        reporter: v.reporter,
        vote: v.vote,
        createdAt: v.created_at
      }));

      const auditLogs = (db.audit_logs || [])
        .map((a: any) => ({
          id: a.id,
          incidentId: a.incident_id,
          userId: a.user_id,
          action: a.action,
          targetTable: a.target_table,
          targetId: a.target_id,
          previousValue: a.previous_value,
          newValue: a.new_value,
          createdAt: a.created_at
        }))
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const confidence = calculateIncidentConfidence(reports, verifications, db.created_at);
      let floodStartLat = db.flood_start_lat;
      let floodStartLng = db.flood_start_lng;
      let floodEndLat = db.flood_end_lat;
      let floodEndLng = db.flood_end_lng;
      let landmarkText = db.landmark || "";
      let elevationMeters = db.elevation_meters ?? undefined;
      let floodStretchPath = normalizeStretchPath(db.flood_path);

      if (!floodStartLat && db.landmark) {
        const match = db.landmark.match(/\[STRETCH:([\d.-]+),([\d.-]+);([\d.-]+),([\d.-]+)\]/);
        if (match) {
          floodStartLat = Number(match[1]);
          floodStartLng = Number(match[2]);
          floodEndLat = Number(match[3]);
          floodEndLng = Number(match[4]);
          landmarkText = db.landmark.replace(/\[STRETCH:[\d.-]+,[\d.-]+;[\d.-]+,[\d.-]+\]/, "").trim();
        }
      }

      if (!floodStretchPath && db.landmark) {
        const pathMatch = db.landmark.match(/\[PATH:([^\][\s]+)\]/);
        if (pathMatch) {
          floodStretchPath = decodeStretchPath(pathMatch[1]);
          landmarkText = landmarkText.replace(/\[PATH:[^\][\s]+\]/, "").trim();
        }
      }

      if (elevationMeters === undefined && db.landmark) {
        const elevMatch = db.landmark.match(/\[ELEV:([\d.-]+)\]/);
        if (elevMatch) {
          elevationMeters = Number(elevMatch[1]);
          landmarkText = landmarkText.replace(/\[ELEV:[\d.-]+\]/, "").trim();
        }
      }

      return {
        id: db.id,
        type: db.type,
        status: db.status,
        severity: db.severity as SeverityLevel,
        roadName: db.road_name,
        landmark: landmarkText,
        district: db.district,
        coordinates: {
          lat: db.latitude,
          lng: db.longitude
        },
        confidence,
        createdAt: db.created_at,
        updatedAt: db.updated_at,
        resolvedAt: db.resolved_at || undefined,
        elevationMeters,
        reports,
        verifications,
        floodStartLat: floodStartLat || undefined,
        floodStartLng: floodStartLng || undefined,
        floodEndLat: floodEndLat || undefined,
        floodEndLng: floodEndLng || undefined,
        lastVerifiedAt: db.last_verified_at || undefined,
        lastReportAt: db.last_report_at || undefined,
        archivedAt: db.archived_at || undefined,
        needsVerification: db.needs_verification || false,
        auditLogs,
        floodStretchPath
      };
    });

    const results = q
      ? mappedIncidents.filter((inc) => {
          const haystack = [
            inc.roadName,
            inc.landmark,
            inc.district,
            inc.type,
            inc.severity,
            inc.status,
            ...(inc.reports ?? []).map((r) => r.notes),
            ...(inc.reports ?? []).map((r) => r.reporter)
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
      : mappedIncidents;

    return NextResponse.json({ incidents: results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch incidents" }, { status: 500 });
  }
}

// POST to create a report (handles nearby duplicate clustering within 500m)
export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase client is not initialized" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const {
      latitude,
      longitude,
      severity,
      notes,
      reporter,
      type,
      roadName,
      landmark,
      district,
      elevationMeters,
      floodStartLat,
      floodStartLng,
      floodEndLat,
      floodEndLng,
      floodStretchPath
    } = body;

    if (!latitude || !longitude || !severity || !type || !roadName || !landmark || !district) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Server-side auth check
    const cookieStore = await cookies();
    const supabaseServer = createServerSupabase(cookieStore);
    const { data: { user } } = await supabaseServer.auth.getUser();

    const isGuest = !user;
    const userId = user ? user.id : null;
    const finalReporter = user
      ? (user.user_metadata?.full_name || user.email || reporter || "Authenticated user")
      : (reporter || "Community reporter");
    const ownershipToken = isGuest ? crypto.randomUUID() : null;

    // 1. Check for nearby active incidents within ~500m
    const latDelta = 0.0045; // ~500m lat variance
    const lngDelta = 0.0045; // ~500m lng variance
    const { data: nearbyIncidents } = await supabase
      .from("incidents")
      .select("*")
      .eq("type", type)
      .in("status", ["active", "receding"])
      .gte("latitude", latitude - latDelta)
      .lte("latitude", latitude + latDelta)
      .gte("longitude", longitude - lngDelta)
      .lte("longitude", longitude + lngDelta);

    let targetIncident: any = null;

    if (nearbyIncidents && nearbyIncidents.length > 0) {
      let minDistance = 0.5; // 500m limit
      for (const inc of nearbyIncidents) {
        const dist = haversineDistanceKm(latitude, longitude, inc.latitude, inc.longitude);
        if (dist <= minDistance) {
          minDistance = dist;
          targetIncident = inc;
        }
      }
    }

    let incidentId: string;
    let isNewIncident = false;

    if (targetIncident) {
      incidentId = targetIncident.id;
    } else {
      isNewIncident = true;
      // Insert new Incident
      const insertRow: Record<string, any> = {
        type,
        status: "active",
        severity,
        road_name: roadName,
        landmark,
        district,
        latitude,
        longitude,
        confidence: 45 // base starting confidence
      };
      if (elevationMeters !== undefined) insertRow.elevation_meters = elevationMeters;
      if (floodStartLat !== undefined) insertRow.flood_start_lat = floodStartLat;
      if (floodStartLng !== undefined) insertRow.flood_start_lng = floodStartLng;
      if (floodEndLat !== undefined) insertRow.flood_end_lat = floodEndLat;
      if (floodEndLng !== undefined) insertRow.flood_end_lng = floodEndLng;
      if (floodStretchPath !== undefined) insertRow.flood_path = floodStretchPath;

      let { data: newInc, error: errNewInc } = await supabase
        .from("incidents")
        .insert([insertRow])
        .select()
        .single();

      if (errNewInc && errNewInc.code === "42703") {
        const fallbackRow = { ...insertRow };
        delete fallbackRow.elevation_meters;
        delete fallbackRow.flood_start_lat;
        delete fallbackRow.flood_start_lng;
        delete fallbackRow.flood_end_lat;
        delete fallbackRow.flood_end_lng;
        delete fallbackRow.flood_path;
        if (elevationMeters !== undefined) fallbackRow.landmark = `${fallbackRow.landmark || ""} [ELEV:${elevationMeters}]`;
        if (floodStartLat && floodStartLng && floodEndLat && floodEndLng) {
          fallbackRow.landmark = `${fallbackRow.landmark || ""} [STRETCH:${floodStartLat},${floodStartLng};${floodEndLat},${floodEndLng}]`;
        }
        if (Array.isArray(floodStretchPath) && floodStretchPath.length > 1) {
          fallbackRow.landmark = `${fallbackRow.landmark || ""} [PATH:${encodeStretchPath(floodStretchPath)}]`;
        }
        const { data: fbInc, error: fbErr } = await supabase
          .from("incidents")
          .insert([fallbackRow])
          .select()
          .single();
        newInc = fbInc;
        errNewInc = fbErr;
      }

      if (errNewInc || !newInc) {
        return NextResponse.json({ error: errNewInc?.message || "Failed to create incident" }, { status: 500 });
      }
      incidentId = newInc.id;

      // Log incident creation
      await supabase
        .from("audit_logs")
        .insert([{
          incident_id: incidentId,
          user_id: finalReporter,
          action: "Create",
          target_table: "incidents",
          target_id: incidentId,
          new_value: { type, severity, road_name: roadName }
        }]);
    }

    // 2. Insert the child Report
    const { data: newRep, error: errNewRep } = await supabase
      .from("incident_reports")
      .insert([{
        incident_id: incidentId,
        severity,
        notes,
        reporter: finalReporter,
        is_guest_report: isGuest,
        ownership_token: ownershipToken,
        reporter_id: userId
      }])
      .select()
      .single();

    if (errNewRep || !newRep) {
      return NextResponse.json({ error: errNewRep?.message || "Failed to create report" }, { status: 500 });
    }

    // Log report creation audit
    await supabase
      .from("audit_logs")
      .insert([{
        incident_id: incidentId,
        user_id: finalReporter,
        action: "Create",
        target_table: "incident_reports",
        target_id: newRep.id,
        new_value: { severity, notes, reporter: finalReporter }
      }]);

    // 3. Recalculate Incident Severity and Confidence
    const { data: allReports } = await supabase
      .from("incident_reports")
      .select("*, incident_images(*)")
      .eq("incident_id", incidentId)
      .is("deleted_at", null);

    const { data: allVerifications } = await supabase
      .from("incident_verifications")
      .select("*")
      .eq("incident_id", incidentId);

    const reportArray = (allReports || []).map((r: any) => ({
      reporter: r.reporter,
      photos: (r.incident_images || []).map((img: any) => img.image_url)
    }));

    const verifArray = (allVerifications || []).map((v: any) => ({
      vote: v.vote,
      reporter: v.reporter
    }));

    const currentIncidentCreatedAt = targetIncident ? targetIncident.created_at : new Date().toISOString();
    const newConfidence = calculateIncidentConfidence(reportArray, verifArray, currentIncidentCreatedAt);

    const severities = (allReports || []).map((r: any) => r.severity as SeverityLevel);
    const highestSeverity = getHighestSeverity(severities);

    // Update parent Incident
    const { error: errIncUpdate } = await supabase
      .from("incidents")
      .update({
        severity: highestSeverity,
        confidence: newConfidence,
        updated_at: new Date().toISOString(),
        last_report_at: new Date().toISOString(),
        needs_verification: false
      })
      .eq("id", incidentId);

    if (errIncUpdate) {
      console.error("Failed to update parent incident severity/confidence:", errIncUpdate.message);
    }

    return NextResponse.json({
      success: true,
      incidentId,
      isNewIncident,
      ownershipToken,
      reportId: newRep.id
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to submit report" }, { status: 500 });
  }
}

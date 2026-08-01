import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Incident, IncidentReport, IncidentVerification, SeverityLevel } from "@/lib/types";

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

// GET all incidents joined with child reports, images, and verifications
export async function GET() {
  if (!supabase) {
    return NextResponse.json({ incidents: [] });
  }

  try {
    const { data: dbIncidents, error: errIncidents } = await supabase
      .from("incidents")
      .select(`
        *,
        incident_reports (
          *,
          incident_images (*)
        ),
        incident_verifications (*)
      `)
      .order("created_at", { ascending: false });

    if (errIncidents) {
      return NextResponse.json({ error: errIncidents.message }, { status: 500 });
    }

    const mappedIncidents: Incident[] = (dbIncidents || []).map((db: any) => {
      const reports: IncidentReport[] = (db.incident_reports || []).map((r: any) => ({
        id: r.id,
        incidentId: r.incident_id,
        severity: r.severity as SeverityLevel,
        notes: r.notes || "",
        reporter: r.reporter || "Anonymous",
        createdAt: r.created_at,
        photos: (r.incident_images || []).map((img: any) => img.image_url)
      }));

      const verifications: IncidentVerification[] = (db.incident_verifications || []).map((v: any) => ({
        id: v.id,
        incidentId: v.incident_id,
        reporter: v.reporter,
        vote: v.vote,
        createdAt: v.created_at
      }));

      // Calculate confidence dynamically to keep it up to date
      const confidence = calculateIncidentConfidence(reports, verifications, db.created_at);

      return {
        id: db.id,
        type: db.type,
        status: db.status,
        severity: db.severity as SeverityLevel,
        roadName: db.road_name,
        landmark: db.landmark,
        district: db.district,
        coordinates: {
          lat: db.latitude,
          lng: db.longitude
        },
        confidence,
        createdAt: db.created_at,
        updatedAt: db.updated_at,
        resolvedAt: db.resolved_at || undefined,
        reports,
        verifications
      };
    });

    return NextResponse.json({ incidents: mappedIncidents });
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
      photos = [],
      type,
      roadName,
      landmark,
      district
    } = body;

    if (!latitude || !longitude || !severity || !type || !roadName || !landmark || !district) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

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
      // Find the closest incident within 500 meters
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
      const { data: newInc, error: errNewInc } = await supabase
        .from("incidents")
        .insert([{
          type,
          status: "active",
          severity,
          road_name: roadName,
          landmark,
          district,
          latitude,
          longitude,
          confidence: 45 // base starting confidence
        }])
        .select()
        .single();

      if (errNewInc || !newInc) {
        return NextResponse.json({ error: errNewInc?.message || "Failed to create incident" }, { status: 500 });
      }
      incidentId = newInc.id;
    }

    // 2. Insert the child Report
    const { data: newRep, error: errNewRep } = await supabase
      .from("incident_reports")
      .insert([{
        incident_id: incidentId,
        severity,
        notes,
        reporter: reporter || "Community reporter"
      }])
      .select()
      .single();

    if (errNewRep || !newRep) {
      return NextResponse.json({ error: errNewRep?.message || "Failed to create report" }, { status: 500 });
    }

    // 3. Insert report images if provided
    if (photos.length > 0) {
      const imageRows = photos.map((url: string) => ({
        report_id: newRep.id,
        image_url: url
      }));
      const { error: errImg } = await supabase.from("incident_images").insert(imageRows);
      if (errImg) {
        console.error("Failed to insert report images:", errImg.message);
      }
    }

    // 4. Recalculate Incident Severity and Confidence
    const { data: allReports } = await supabase
      .from("incident_reports")
      .select("*, incident_images(*)")
      .eq("incident_id", incidentId);

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
        updated_at: new Date().toISOString()
      })
      .eq("id", incidentId);

    if (errIncUpdate) {
      console.error("Failed to update parent incident severity/confidence:", errIncUpdate.message);
    }

    return NextResponse.json({
      success: true,
      incidentId,
      isNewIncident
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to submit report" }, { status: 500 });
  }
}

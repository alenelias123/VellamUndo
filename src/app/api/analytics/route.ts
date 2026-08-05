import { NextResponse } from "next/server";
import { buildAnalyticsSnapshot } from "@/lib/analytics";
import { demoHelpRequests } from "@/lib/demo-data";
import { supabase } from "@/lib/supabase";
import type { Incident } from "@/lib/types";

export async function GET() {
  let incidents: Incident[] = [];

  if (supabase) {
    try {
      const { data } = await supabase
        .from("incidents")
        .select(`
          *,
          incident_reports (*)
        `);
      
      if (data) {
        incidents = data.map((d: any) => ({
          id: d.id,
          type: d.type,
          status: d.status,
          severity: d.severity,
          roadName: d.road_name,
          landmark: d.landmark,
          district: d.district,
          coordinates: { lat: d.latitude, lng: d.longitude },
          confidence: d.confidence,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          reports: (d.incident_reports || []).map((r: any) => ({
            id: r.id,
            incidentId: r.incident_id,
            severity: r.severity,
            createdAt: r.created_at
          }))
        })) as Incident[];
      }
    } catch (err) {
      console.warn("Failed to fetch live analytics data:", err);
    }
  }

  return NextResponse.json({
    analytics: buildAnalyticsSnapshot(incidents, demoHelpRequests)
  });
}

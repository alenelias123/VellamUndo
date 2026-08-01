import { NextResponse } from "next/server";
import { calculateRoadRoutes } from "@/lib/routing";
import { supabase } from "@/lib/supabase";
import type { Coordinates, Incident } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      origin?: Coordinates;
      destination?: Coordinates;
    };

    if (!body.origin || !body.destination) {
      return NextResponse.json({ error: "Missing origin or destination coordinates" }, { status: 400 });
    }

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
        console.warn("Failed to fetch incidents for routing plan:", err);
      }
    }

    const routes = await calculateRoadRoutes(body.origin, body.destination, incidents);

    return NextResponse.json({ routes });
  } catch (error) {
    return NextResponse.json({ error: "Route calculation failed" }, { status: 500 });
  }
}

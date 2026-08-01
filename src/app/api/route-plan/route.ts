import { NextResponse } from "next/server";
import { calculateRoadRoutes } from "@/lib/routing";
import { fetchReportsFromSupabase } from "@/lib/supabase";
import type { Coordinates } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      origin?: Coordinates;
      destination?: Coordinates;
    };

    if (!body.origin || !body.destination) {
      return NextResponse.json({ error: "Missing origin or destination coordinates" }, { status: 400 });
    }

    const reports = (await fetchReportsFromSupabase()) || [];
    const routes = await calculateRoadRoutes(body.origin, body.destination, reports);

    return NextResponse.json({ routes });
  } catch (error) {
    return NextResponse.json({ error: "Route calculation failed" }, { status: 500 });
  }
}

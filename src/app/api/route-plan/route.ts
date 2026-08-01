import { NextResponse } from "next/server";
import { demoFloodReports } from "@/lib/demo-data";
import { buildRouteOptions, routePlaces } from "@/lib/routing";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sourceId?: string;
    destinationId?: string;
  };
  const source = routePlaces.find((place) => place.id === body.sourceId);
  const destination = routePlaces.find((place) => place.id === body.destinationId);

  if (!source || !destination) {
    return NextResponse.json({ error: "Invalid source or destination" }, { status: 400 });
  }

  return NextResponse.json({
    routes: buildRouteOptions(source, destination, demoFloodReports)
  });
}

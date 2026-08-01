import { NextResponse } from "next/server";
import { demoReliefCenters } from "@/lib/demo-data";

export async function GET() {
  return NextResponse.json({ reliefCenters: demoReliefCenters });
}

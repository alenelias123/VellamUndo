import { NextResponse } from "next/server";
import { demoHelpRequests } from "@/lib/demo-data";
import { createHelpRequest, type NewHelpRequestInput } from "@/lib/helpRequests";
import type { HelpRequest } from "@/lib/types";

let helpRequests: HelpRequest[] = [...demoHelpRequests];

export async function GET() {
  return NextResponse.json({ helpRequests });
}

export async function POST(request: Request) {
  const body = (await request.json()) as NewHelpRequestInput;
  const helpRequest = createHelpRequest(body);
  helpRequests = [helpRequest, ...helpRequests];

  return NextResponse.json({ helpRequest }, { status: 201 });
}

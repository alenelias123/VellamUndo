import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { createClient } from "@/utils/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

type RouteParams = {
  params: Promise<{ id: string }>;
};

function isWhitelistedAdminEmail(emailLike: unknown): boolean {
  if (typeof emailLike !== "string") {
    return false;
  }

  const email = emailLike.toLowerCase().trim();
  return (
    email === "admin@vellamundo.org" ||
    email === "9745093032p@gmail.com" ||
    email === "aleneliascherian@gmail.com"
  );
}

/**
 * Editing and deleting incidents is restricted to signed-in accounts.
 * Returns true when the request may proceed (either a real session exists
 * or Supabase auth is not configured and the app is running in demo mode).
 */
async function requireAuth(request: Request) {
  const fallbackEmail = request.headers.get("x-admin-email");
  if (isWhitelistedAdminEmail(fallbackEmail)) {
    return { ok: true as const };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { ok: true as const };
  }
  try {
    const cookieStore = await cookies();
    const sb = createClient(cookieStore);
    const { data, error } = await sb.auth.getUser();
    if (error || !data?.user) {
      return { ok: false as const };
    }
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

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

// PATCH to edit/update an incident
export async function PATCH(request: Request, { params }: RouteParams) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase client is not initialized" }, { status: 503 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Incident ID is required" }, { status: 400 });
  }

  try {
    const requestScopedSupabase = createRequestScopedSupabase(request);
    if (!requestScopedSupabase) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { data: authData, error: authError } = await requestScopedSupabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const {
      type,
      status,
      severity,
      roadName,
      landmark,
      district,
      latitude,
      longitude,
      confidence,
      elevationMeters,
      floodStartLat,
      floodStartLng,
      floodEndLat,
      floodEndLng,
      floodStretchPath
    } = body;

    // Build update payload mapping JS camelCase to Postgres snake_case
    const updatePayload: Record<string, any> = {};
    if (type !== undefined) updatePayload.type = type;
    if (status !== undefined) updatePayload.status = status;
    if (severity !== undefined) updatePayload.severity = severity;
    if (roadName !== undefined) updatePayload.road_name = roadName;
    if (landmark !== undefined) updatePayload.landmark = landmark;
    if (district !== undefined) updatePayload.district = district;
    if (latitude !== undefined) updatePayload.latitude = latitude;
    if (longitude !== undefined) updatePayload.longitude = longitude;
    if (confidence !== undefined) updatePayload.confidence = confidence;

    // Handle optional elevation and stretch coordinates
    if (elevationMeters !== undefined) updatePayload.elevation_meters = elevationMeters;
    if (floodStartLat !== undefined) updatePayload.flood_start_lat = floodStartLat;
    if (floodStartLng !== undefined) updatePayload.flood_start_lng = floodStartLng;
    if (floodEndLat !== undefined) updatePayload.flood_end_lat = floodEndLat;
    if (floodEndLng !== undefined) updatePayload.flood_end_lng = floodEndLng;
    if (floodStretchPath !== undefined) updatePayload.flood_path = floodStretchPath;

    updatePayload.updated_at = new Date().toISOString();

    const { data, error } = await requestScopedSupabase
      .from("incidents")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      // Fallback in case columns do not exist in cloud database yet: try updating without stretch coordinates
      if (error.code === "42703") {
        const fallbackPayload = { ...updatePayload };
        delete fallbackPayload.elevation_meters;
        delete fallbackPayload.flood_start_lat;
        delete fallbackPayload.flood_start_lng;
        delete fallbackPayload.flood_end_lat;
        delete fallbackPayload.flood_end_lng;
        delete fallbackPayload.flood_path;
        
        // Save the stretch details inside landmark as a JSON-encoded string to maintain feature parity
        if (elevationMeters !== undefined) {
          fallbackPayload.landmark = `${fallbackPayload.landmark || ""} [ELEV:${elevationMeters}]`;
        }
        if (floodStartLat && floodStartLng && floodEndLat && floodEndLng) {
          fallbackPayload.landmark = `${fallbackPayload.landmark || ""} [STRETCH:${floodStartLat},${floodStartLng};${floodEndLat},${floodEndLng}]`;
        }
        if (Array.isArray(floodStretchPath) && floodStretchPath.length > 1) {
          const encoded = floodStretchPath.map((c: { lat: number; lng: number }) => `${c.lat},${c.lng}`).join(";");
          fallbackPayload.landmark = `${fallbackPayload.landmark || ""} [PATH:${encoded}]`;
        }

        const { data: fbData, error: fbError } = await requestScopedSupabase
          .from("incidents")
          .update(fallbackPayload)
          .eq("id", id)
          .select()
          .single();

        if (fbError) {
          return NextResponse.json({ error: fbError.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, incident: fbData });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, incident: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update incident" }, { status: 500 });
  }
}

// DELETE to remove an incident (cascades automatically in DB)
export async function DELETE(request: Request, { params }: RouteParams) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase client is not initialized" }, { status: 503 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Incident ID is required" }, { status: 400 });
  }

  try {
    const requestScopedSupabase = createRequestScopedSupabase(request);
    if (!requestScopedSupabase) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { data: authData, error: authError } = await requestScopedSupabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { error } = await requestScopedSupabase
      .from("incidents")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Incident deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete incident" }, { status: 500 });
  }
}

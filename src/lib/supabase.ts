import { createClient } from "@supabase/supabase-js";
import type { FloodReport, FloodSeverity } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export type SupabaseReportRow = {
  id: string;
  road_name: string;
  district: string;
  location_name: string;
  latitude: number;
  longitude: number;
  severity: FloodSeverity;
  water_level_cm: number;
  description: string;
  image_url?: string;
  created_by: string;
  created_at: string;
  confirmations: number;
  flags: number;
};

export function rowToFloodReport(row: SupabaseReportRow): FloodReport {
  return {
    id: row.id,
    roadName: row.road_name,
    district: row.district || "ernakulam",
    locationName: row.location_name,
    coordinates: {
      lat: Number(row.latitude),
      lng: Number(row.longitude)
    },
    severity: row.severity,
    waterLevelCm: Number(row.water_level_cm || 0),
    description: row.description || "",
    imageUrl: row.image_url || undefined,
    createdBy: row.created_by || "Anonymous User",
    createdAt: row.created_at || new Date().toISOString(),
    confirmations: Number(row.confirmations || 1),
    flags: Number(row.flags || 0)
  };
}

export function floodReportToRow(report: FloodReport): SupabaseReportRow {
  return {
    id: report.id,
    road_name: report.roadName,
    district: report.district,
    location_name: report.locationName,
    latitude: report.coordinates.lat,
    longitude: report.coordinates.lng,
    severity: report.severity,
    water_level_cm: report.waterLevelCm,
    description: report.description,
    image_url: report.imageUrl,
    created_by: report.createdBy,
    created_at: report.createdAt,
    confirmations: report.confirmations,
    flags: report.flags
  };
}

// Fetch all flood reports from Supabase
export async function fetchReportsFromSupabase(): Promise<FloodReport[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("flood_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Supabase fetch error:", error.message);
      return null;
    }

    return (data as SupabaseReportRow[]).map(rowToFloodReport);
  } catch (err) {
    console.warn("Supabase connection error:", err);
    return null;
  }
}

// Insert new report into Supabase
export async function insertReportToSupabase(report: FloodReport): Promise<boolean> {
  if (!supabase) return false;
  try {
    const row = floodReportToRow(report);
    const { error } = await supabase.from("flood_reports").insert([row]);
    if (error) {
      console.error("Failed to insert report into Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Supabase insert error:", err);
    return false;
  }
}

// Delete report from Supabase (Admin action)
export async function deleteReportFromSupabase(reportId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("flood_reports").delete().eq("id", reportId);
    if (error) {
      console.error("Failed to delete report from Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Supabase delete error:", err);
    return false;
  }
}

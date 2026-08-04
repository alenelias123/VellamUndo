import { NextResponse } from "next/server";
import { districts } from "@/lib/districts";

const KERALA_DISTRICT_SLUGS = districts.map((district) => district.slug);

const DISTRICT_ALIASES: Record<string, string> = {
  trivandrum: "thiruvananthapuram",
  cochin: "ernakulam",
  calicut: "kozhikode",
  quilon: "kollam",
  palghat: "palakkad",
};

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-(county|district|province)$/, "")
    .replace(/^-+|-+$/g, "");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");

    if (!lat || !lng) {
      return NextResponse.json({ error: "Missing latitude or longitude" }, { status: 400 });
    }

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "VellamUndo-MVP/1.0 (contact: support@vellamundo.emergency)",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to reverse geocode from Nominatim" }, { status: res.status });
    }

    const data = await res.json();
    const address = data.address || {};

    const roadName =
      address.road ||
      address.pedestrian ||
      address.highway ||
      address.suburb ||
      address.neighbourhood ||
      "Unnamed road";

    const landmark =
      address.village ||
      address.neighbourhood ||
      address.suburb ||
      address.town ||
      address.amenity ||
      address.shop ||
      address.county ||
      address.state ||
      address.country ||
      "Unknown area";

    // ── District resolution (Kerala districts AND anywhere else) ───────────
    const stateSlug = toSlug(address.state || "");
    const isKerala = stateSlug.includes("kerala");

    const districtCandidate =
      address.state_district ||
      address.county ||
      address.district ||
      address.municipality ||
      address.city ||
      address.town ||
      address.village ||
      address.region ||
      address.state ||
      address.country ||
      "";

    const candidateSlug = toSlug(districtCandidate);
    const keralaMatch =
      KERALA_DISTRICT_SLUGS.find((slug) => candidateSlug.includes(slug)) ||
      DISTRICT_ALIASES[candidateSlug];

    let districtSlug: string;
    if (keralaMatch) {
      districtSlug = keralaMatch;
    } else if (isKerala) {
      districtSlug = candidateSlug || stateSlug || "kerala";
    } else {
      districtSlug = candidateSlug || stateSlug || toSlug(address.country || "") || "unknown";
    }

    return NextResponse.json({
      roadName,
      landmark,
      district: districtSlug,
      displayName: data.display_name || "",
    });
  } catch (error: any) {
    console.error("Geocode error:", error);
    return NextResponse.json({ error: error.message || "Geocoding failure" }, { status: 500 });
  }
}

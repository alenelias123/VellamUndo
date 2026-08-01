import { NextResponse } from "next/server";

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
      "Kerala";

    // Attempt to match district slug
    const stateDistrict = address.state_district || address.county || address.city || "";
    let districtSlug = "ernakulam"; // default fallback

    const lowerDistrict = stateDistrict.toLowerCase();
    const matchedSlug = ["ernakulam", "alappuzha", "kottayam", "thrissur", "kozhikode", "wayanad", "idukki", "pathanamthitta", "kollam", "thiruvananthapuram", "palakkad", "malappuram", "kannur", "kasaragod"].find(
      (slug) => lowerDistrict.includes(slug)
    );
    if (matchedSlug) {
      districtSlug = matchedSlug;
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

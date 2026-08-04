import type { District } from "./types";

export const districts: District[] = [
  {
    slug: "thiruvananthapuram",
    name: "Thiruvananthapuram",
    center: { lat: 8.5241, lng: 76.9366 },
    bounds: [
      [8.17, 76.55],
      [8.88, 77.25]
    ]
  },
  {
    slug: "kollam",
    name: "Kollam",
    center: { lat: 8.8932, lng: 76.6141 },
    bounds: [
      [8.72, 76.35],
      [9.18, 77.2]
    ]
  },
  {
    slug: "pathanamthitta",
    name: "Pathanamthitta",
    center: { lat: 9.2648, lng: 76.787 },
    bounds: [
      [9.05, 76.45],
      [9.55, 77.35]
    ]
  },
  {
    slug: "alappuzha",
    name: "Alappuzha",
    center: { lat: 9.4981, lng: 76.3388 },
    bounds: [
      [9.2, 76.18],
      [9.8, 76.62]
    ]
  },
  {
    slug: "kottayam",
    name: "Kottayam",
    center: { lat: 9.5916, lng: 76.5222 },
    bounds: [
      [9.28, 76.25],
      [9.96, 77.08]
    ]
  },
  {
    slug: "idukki",
    name: "Idukki",
    center: { lat: 9.9189, lng: 77.1025 },
    bounds: [
      [9.45, 76.72],
      [10.35, 77.55]
    ]
  },
  {
    slug: "ernakulam",
    name: "Ernakulam",
    center: { lat: 10.0261, lng: 76.3125 },
    bounds: [
      [9.72, 76.12],
      [10.32, 76.72]
    ]
  },
  {
    slug: "thrissur",
    name: "Thrissur",
    center: { lat: 10.5276, lng: 76.2144 },
    bounds: [
      [10.18, 75.95],
      [10.85, 76.62]
    ]
  },
  {
    slug: "palakkad",
    name: "Palakkad",
    center: { lat: 10.7867, lng: 76.6548 },
    bounds: [
      [10.35, 76.15],
      [11.25, 77.25]
    ]
  },
  {
    slug: "malappuram",
    name: "Malappuram",
    center: { lat: 11.051, lng: 76.0711 },
    bounds: [
      [10.68, 75.78],
      [11.42, 76.45]
    ]
  },
  {
    slug: "kozhikode",
    name: "Kozhikode",
    center: { lat: 11.2588, lng: 75.7804 },
    bounds: [
      [10.95, 75.55],
      [11.68, 76.15]
    ]
  },
  {
    slug: "wayanad",
    name: "Wayanad",
    center: { lat: 11.6854, lng: 76.132 },
    bounds: [
      [11.42, 75.75],
      [12.02, 76.55]
    ]
  },
  {
    slug: "kannur",
    name: "Kannur",
    center: { lat: 11.8745, lng: 75.3704 },
    bounds: [
      [11.55, 75.05],
      [12.25, 75.9]
    ]
  },
  {
    slug: "kasaragod",
    name: "Kasaragod",
    center: { lat: 12.4996, lng: 74.9869 },
    bounds: [
      [12.15, 74.75],
      [12.85, 75.45]
    ]
  }
];

export const defaultDistrictSlug = "ernakulam";

export function getDistrictBySlug(slug: string): District {
  return districts.find((district) => district.slug === slug) ?? districts[6];
}

export function findDistrictForCoordinates(lat: number, lng: number): District | null {
  return (
    districts.find((district) => {
      const [[south, west], [north, east]] = district.bounds;
      return lat >= south && lat <= north && lng >= west && lng <= east;
    }) ?? null
  );
}

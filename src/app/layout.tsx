import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://vellamundo.in";
const siteName = "Vellam Undo";
const defaultTitle = "Vellam Undo | Kerala Flood Alerts, Safer Routes, and Community Reports";
const defaultDescription =
  "Live flood reporting, road condition updates, safer route planning for Kerala.";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: siteName,
      url: siteUrl,
      description: defaultDescription,
      inLanguage: "en-IN"
    },
    {
      "@type": "WebApplication",
      name: siteName,
      url: siteUrl,
      applicationCategory: "EmergencyService",
      operatingSystem: "Web",
      description: defaultDescription,
      areaServed: {
        "@type": "State",
        name: "Kerala"
      }
    }
  ]
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: defaultTitle,
    template: `%s | ${siteName}`
  },
  description: defaultDescription,
  applicationName: siteName,
  keywords: [
    "Kerala flood alerts",
    "flood reporting Kerala",
    "road flooding map",
    "safe route navigation",
    "waterlogging updates",
    "emergency help requests",
    "community flood reports"
  ],
  authors: [{ name: "Vellam Undo" }],
  creator: "Vellam Undo",
  publisher: "Vellam Undo",
  alternates: {
    canonical: "/"
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png"
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName,
    title: defaultTitle,
    description: defaultDescription,
    images: [
      {
        url: "/favicon.png",
        width: 1229,
        height: 1280,
        alt: "Vellam Undo"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: ["/favicon.png"]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  category: "emergency"
};

export const viewport: Viewport = {
  themeColor: "#0f3d3e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {children}
      </body>
    </html>
  );
}

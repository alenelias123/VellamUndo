import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vellam Undo",
  description: "Flood reporting and safer re-navigation for Kerala.",
  manifest: "/manifest.json"
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
      <body>{children}</body>
    </html>
  );
}

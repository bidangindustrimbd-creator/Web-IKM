import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peta IKM Maluku Barat Daya",
  description: "Peta interaktif dan rekap IKM kecil serta menengah per desa di Kabupaten Maluku Barat Daya.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

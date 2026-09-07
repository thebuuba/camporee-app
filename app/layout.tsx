import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./mobile-fixes.css";
import ZoomLock from "./zoom-lock";

export const metadata: Metadata = {
  title: "Camporee",
  description: "Organiza cada detalle antes, durante y después del camporee.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Camporee", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#F3F2EE",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><ZoomLock />{children}</body></html>;
}

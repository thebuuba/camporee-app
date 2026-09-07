import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./mobile-fixes.css";

export const metadata: Metadata = {
  title: "Camporee",
  description: "Organiza cada detalle antes, durante y después del camporee.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Camporee", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F3F2EE" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}

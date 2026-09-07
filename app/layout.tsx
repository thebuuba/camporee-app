import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./mobile-fixes.css";
import "./hero-card.css";
import "./nav.css";
import "./polish.css";
import "./budget.css";
import "./error.css";
import "./fun-panels.css";
import "./outdoor-style.css";
import PwaRegister from "./components/pwa-register";
import ConnectionStatus from "./components/connection-status";

export const metadata: Metadata = {
  title: "Camporee",
  description: "Organiza cada detalle antes, durante y después del camporee.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/camporee-icon-512.png", apple: "/camporee-icon-512.png" },
  appleWebApp: { capable: true, title: "Camporee", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F4E7C9",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><PwaRegister /><ConnectionStatus />{children}</body></html>;
}

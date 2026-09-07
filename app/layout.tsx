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
  manifest: "/manifest.webmanifest?v=5",
  icons: {
    icon: [{ url: "/camporee-home-icon-v2.png?v=5", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-touch-icon.png?v=5", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Camporee", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F4E7C9",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><head><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=5" /><link rel="icon" type="image/png" href="/camporee-home-icon-v2.png?v=5" /></head><body><PwaRegister /><ConnectionStatus />{children}</body></html>;
}

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
import "./logo-fixes.css";
import PwaRegister from "./components/pwa-register";
import ConnectionStatus from "./components/connection-status";
import AppSplash from "./components/app-splash";

export const metadata: Metadata = {
  title: "Camporee",
  description: "Organiza cada detalle antes, durante y después del camporee.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/camporee-home-icon-v2.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "512x512" }],
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
  return <html lang="es"><head><link rel="apple-touch-icon" sizes="512x512" href="/apple-touch-icon.png" /><link rel="icon" type="image/png" href="/camporee-home-icon-v2.png" /></head><body><AppSplash/><PwaRegister /><ConnectionStatus />{children}</body></html>;
}

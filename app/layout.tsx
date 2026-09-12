import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./mobile-fixes.css";
import "./hero-card.css";
import "./nav.css";
import "./polish.css";
import "./program-filter.css";
import "./budget.css";
import "./error.css";
import "./fun-panels.css";
import "./outdoor-style.css";
import "./logo-fixes.css";
import "./notifications.css";
import "./users.css";
import "./tasks.css";
import "./task-sheet.css";
import "./desktop.css";
import "./soft-glass-theme.css";
import "./neutral-glass-theme.css";
import "./interaction-fixes.css";
import "./reliable-navigation.css";
import PwaRegister from "./components/pwa-register";
import ConnectionStatus from "./components/connection-status";
import DataFreshness from "./components/data-freshness";
import AppSplash from "./components/app-splash";

const appBackground = "#F2EFE8";

export const metadata: Metadata = {
  title: "Camporee",
  description: "Organiza cada detalle antes, durante y después del camporee.",
  manifest: "/manifest.webmanifest?v=9",
  icons: {
    icon: [{ url: "/camporee-logo-v8.png?v=9", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-touch-icon.png?v=9", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Camporee", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: appBackground,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const launchStyle = { backgroundColor: appBackground, colorScheme: "light" as const };
  return <html lang="es" style={launchStyle}><head><meta name="theme-color" content={appBackground} /><meta name="color-scheme" content="light" /><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=9" /><link rel="apple-touch-icon-precomposed" href="/apple-touch-icon.png?v=9" /><link rel="icon" type="image/png" sizes="512x512" href="/camporee-logo-v8.png?v=9" /></head><body style={launchStyle}><AppSplash/><PwaRegister /><ConnectionStatus /><DataFreshness />{children}</body></html>;
}

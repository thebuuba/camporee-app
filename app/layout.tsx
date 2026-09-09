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
import PwaRegister from "./components/pwa-register";
import ConnectionStatus from "./components/connection-status";
import DataFreshness from "./components/data-freshness";
import AppSplash from "./components/app-splash";

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
  themeColor: "#F4E7C9",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Inline launch colors are intentional: iOS can paint the webview before the
  // external CSS bundle arrives. Giving html/body a color here prevents a black
  // frame between the native launch surface and the React splash screen.
  const launchStyle = { backgroundColor: "#F4E7C9", colorScheme: "light" as const };
  return <html lang="es" style={launchStyle}><head><meta name="theme-color" content="#F4E7C9" /><meta name="color-scheme" content="light" /><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=9" /><link rel="apple-touch-icon-precomposed" href="/apple-touch-icon.png?v=9" /><link rel="icon" type="image/png" sizes="512x512" href="/camporee-logo-v8.png?v=9" /></head><body style={launchStyle}><AppSplash/><PwaRegister /><ConnectionStatus /><DataFreshness />{children}</body></html>;
}

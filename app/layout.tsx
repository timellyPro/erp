import type { Metadata, Viewport } from "next";
import "./globals.css";
import localFont from "next/font/local";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AuthProvider } from "@/app/_components/context/AuthContext";
import { GlobalBackground } from "./_components/components/common/GlobalBackground";
import PwaRegister from "./_components/components/common/PwaRegister";
import InstallAppBanner from "./_components/components/common/InstallAppBanner";
// A nonce-based CSP needs a fresh nonce on every request, so pages cannot be prerendered statically.
export const dynamic = "force-dynamic";

// Fonts are bundled with the app (not fetched from Google at build/dev time), so a network that
// blocks fonts.gstatic.com cannot break the build or return a 500 from the dev server.
// Geist Sans/Mono ship in the `geist` package and already expose --font-geist-sans / --font-geist-mono.
const inter = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Timelly - School ERP & Management Software",
  description:
    "Timelly is a powerful School ERP and management software for handling student data, attendance tracking,staff management, and real-time notifications. Perfect solution for modern schools and institutions.",
  applicationName: "Timelly",
  appleWebApp: {
    capable: true,
    title: "Timelly",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/pwa-192.png", type: "image/png", sizes: "192x192" },
      { url: "/pwa-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: [{ url: "/pwa-192.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#28143F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject attributes on <body> before hydration. */}
      <body
        suppressHydrationWarning
        className={`
          ${inter.variable}
          ${GeistSans.variable}
          ${GeistMono.variable}
          antialiased
        `}
      >
        <GlobalBackground />
        <PwaRegister />
        <AuthProvider>{children}</AuthProvider>
        <InstallAppBanner />
      </body>
    </html>
  );
}

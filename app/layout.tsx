import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Inter, Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { GlobalBackground } from "./frontend/components/common/GlobalBackground";
import PwaRegister from "./frontend/components/common/PwaRegister";
import InstallAppBanner from "./frontend/components/common/InstallAppBanner";
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      <body
        className={`
          ${inter.variable}
          ${geistSans.variable}
          ${geistMono.variable}
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

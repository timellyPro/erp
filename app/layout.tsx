import type { Metadata } from "next";
import "./globals.css";
import { Inter, Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { GlobalBackground } from "./frontend/components/common/GlobalBackground";
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
  icons: {
    icon: [{ url: "/icon.png?v=3", type: "image/png", sizes: "32x32" }],
    shortcut: [{ url: "/icon.png?v=3", type: "image/png" }],
    apple: [{ url: "/icon.png?v=3", type: "image/png", sizes: "180x180" }],
  },
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

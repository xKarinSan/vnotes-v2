import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "vnotes",
  description: "A note-taking app with YouTube video embedding",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Sidebar />
        <main style={{ marginLeft: "var(--sidebar-width)", minHeight: "100vh", padding: "2rem" }}>
          <h1>VNotes</h1>
          {children}
        </main>
      </body>
    </html>
  );
}

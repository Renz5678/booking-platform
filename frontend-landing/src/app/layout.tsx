import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import CrisisBanner from "@/components/layout/CrisisBanner";
import TopNavBar from "@/components/layout/TopNavBar";
import Footer from "@/components/layout/Footer";

import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alaga - Professional Online Counseling",
  description: "Accessible, confidential, and compassionate online therapy tailored for the Philippines.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-on-background font-body-md">
        <AuthProvider>
          <CrisisBanner />
          <TopNavBar />
          <main className="flex-grow">
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}

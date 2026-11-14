import { headers } from "next/headers";
import type { Metadata } from "next";
import "./globals.css";
import CrisisBanner from "@/components/layout/CrisisBanner";
import TopNavBar from "@/components/layout/TopNavBar";
import Footer from "@/components/layout/Footer";

import { AuthProvider } from "@/context/AuthContext";
import RecaptchaProvider from "@/components/providers/RecaptchaProvider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Alaga - Professional Online Counseling",
  description: "Accessible, confidential, and compassionate online therapy tailored for the Philippines.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") || undefined;
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-on-background font-body-md">
        <RecaptchaProvider nonce={nonce}>
          <AuthProvider>
            <CrisisBanner />
            <TopNavBar />
            <main className="flex-grow">
              {children}
            </main>
            <Footer />
          </AuthProvider>
        </RecaptchaProvider>
      </body>
    </html>
  );
}

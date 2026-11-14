import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import CrisisBanner from "@/components/layout/CrisisBanner";
import TopNavBar from "@/components/layout/TopNavBar";
import Footer from "@/components/layout/Footer";
import { Motion } from "@/components/Motion";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { site } from "@/data/site";
import { hostGrotesk, zodiak } from "./fonts";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Alaga | Online Counseling",
    template: "%s | Alaga",
  },
  description: site.description,
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    siteName: site.name,
    title: "Alaga | Online Counseling",
    description: site.description,
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Alaga | Online Counseling",
    description: site.description,
    images: ["/og.png"],
  },
};

const flagsScript = `document.documentElement.classList.add('js');if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('motion');`;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "MedicalBusiness",
  name: site.name,
  description: site.description,
  url: site.url,
  areaServed: "PH",
  availableLanguage: ["English", "Filipino"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${hostGrotesk.variable} ${zodiak.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: flagsScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-on-background font-body-md">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[120] focus:bg-primary focus:text-on-primary focus:px-4 focus:py-2.5 focus:rounded-lg focus:shadow-ambient focus:font-label-md"
        >
          Skip to main content
        </a>

        <div id="curtain" aria-hidden="true">
          <div className="curtain__panel flex flex-col items-center justify-center gap-2 text-on-primary">
            <span className="font-serif text-4xl tracking-[-0.02em]">Alaga</span>
            <span className="text-[11px] uppercase tracking-[0.16em] text-primary-fixed-dim">
              Quiet Room
            </span>
          </div>
        </div>

        <AuthProvider>
          <ToastProvider>
            <CrisisBanner />
            <TopNavBar />
            <main id="main-content" tabIndex={-1} className="flex-grow flex flex-col">
              {children}
            </main>
            <Footer />
          </ToastProvider>
        </AuthProvider>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <Motion />

        {process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && (
          <Script
            src={`https://www.google.com/recaptcha/api.js?render=${process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}`}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}

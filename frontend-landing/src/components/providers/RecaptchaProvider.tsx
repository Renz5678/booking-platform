"use client";

import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3";
import { ReactNode } from "react";

export default function RecaptchaProvider({ children, nonce }: { children: ReactNode; nonce?: string }) {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  
  if (!siteKey) {
    return <>{children}</>; // Dev mode fallback if no key is provided
  }

  return (
    <GoogleReCaptchaProvider reCaptchaKey={siteKey} scriptProps={{ nonce }}>
      {children}
    </GoogleReCaptchaProvider>
  );
}

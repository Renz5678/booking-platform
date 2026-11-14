declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

export async function getCaptchaToken(action: string): Promise<string> {
  if (!RECAPTCHA_SITE_KEY) {
    return "dev-captcha-token";
  }
  if (typeof window === "undefined" || !window.grecaptcha) {
    return "";
  }
  return new Promise((resolve) => {
    window.grecaptcha!.ready(async () => {
      try {
        const token = await window.grecaptcha!.execute(RECAPTCHA_SITE_KEY, { action });
        resolve(token);
      } catch {
        resolve("");
      }
    });
  });
}

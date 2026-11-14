type Execute = ((action?: string) => Promise<string>) | undefined;
export async function captchaToken(execute: Execute, action: string): Promise<string> {
  if (!execute) {
    if (process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) return "dev_bypass_token";
    throw new Error("Security verification is unavailable. Please reload and try again.");
  }
  return execute(action);
}

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="w-full mt-section-gap bg-surface-container-highest border-t border-outline-variant py-section-gap">
      <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="flex flex-col gap-4">
          <Link href="/" className="font-headline-md text-headline-md font-black text-primary">
            Alaga
          </Link>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Accessible, confidential, and compassionate online therapy tailored for the Philippines.
          </p>
          <div className="mt-2 p-4 bg-surface-container-lowest rounded-lg border border-outline-variant/40">
            <p className="font-label-sm text-[12px] text-primary uppercase font-bold mb-1">National Crisis Hotline</p>
            <a href="tel:1553" className="font-headline-md text-error font-bold hover:underline inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[20px]">call</span> 1553
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="font-label-md text-primary font-bold mb-1">Platform</h4>
          <Link className="font-body-md text-on-surface-variant hover:text-primary transition-colors" href="/">Home</Link>
          <Link className="font-body-md text-on-surface-variant hover:text-primary transition-colors" href="/counselors">Find a Counselor</Link>
          <Link className="font-body-md text-on-surface-variant hover:text-primary transition-colors" href="/faq">Frequently Asked Questions</Link>
          <Link className="font-body-md text-on-surface-variant hover:text-primary transition-colors" href="/contact">Contact Support</Link>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="font-label-md text-primary font-bold mb-1">Legal & Privacy</h4>
          <Link className="font-body-md text-on-surface-variant hover:text-primary transition-colors" href="/privacy-policy">Privacy Policy (RA 10173)</Link>
          <Link className="font-body-md text-on-surface-variant hover:text-primary transition-colors" href="/privacy-policy#terms">Terms of Service</Link>
          <a className="font-body-md text-on-surface-variant hover:text-primary transition-colors" href="tel:1553">Crisis Helpline (1553)</a>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="font-label-md text-primary font-bold mb-1">Compliance & Seals</h4>
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 space-y-2">
            <div className="flex items-center gap-2 text-primary font-label-sm font-semibold">
              <span className="material-symbols-outlined text-[18px] text-secondary">verified_user</span>
              <span>RA 10173 Compliant</span>
            </div>
            <p className="font-body-sm text-[12px] text-on-surface-variant">
              Data Privacy Act of 2012 registered and client intake encrypted at rest.
            </p>
            <div className="flex items-center gap-2 text-primary font-label-sm font-semibold pt-1 border-t border-outline-variant/30">
              <span className="material-symbols-outlined text-[18px] text-primary">receipt_long</span>
              <span>BIR Registered</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 mt-12 pt-6 border-t border-outline-variant text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="font-label-sm text-[13px] text-on-surface-variant">
          © 2026 Alaga Counseling. All rights reserved. Registered in the Republic of the Philippines.
        </p>
        <p className="font-label-sm text-[12px] text-on-surface-variant">
          Official Electronic Receipt provided for all completed sessions.
        </p>
      </div>
    </footer>
  );
}

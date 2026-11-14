import Link from "next/link";

export default function Footer() {
  return (
    <footer className="w-full mt-section-gap bg-surface-container-highest border-t border-outline-variant py-section-gap">
      <div className="max-w-container-max mx-auto px-margin-desktop grid grid-cols-1 md:grid-cols-3 gap-gutter">
        <div className="flex flex-col gap-4">
          <div className="font-headline-md text-headline-md font-black text-primary">
            Alaga
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Professional counseling for your peace of mind.
          </p>
          <div className="mt-4 p-4 bg-surface-container-lowest rounded-lg custom-shadow">
            <p className="font-label-sm text-label-sm text-primary uppercase mb-1">National Crisis Hotline</p>
            <p className="font-headline-md text-headline-md text-error font-bold">1553</p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <h4 className="font-label-md text-label-md text-primary font-bold mb-2">Company</h4>
          <Link className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="/#about">About Us</Link>
          <Link className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="/counselors">Find a Counselor</Link>
          <Link className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="/faq">FAQ</Link>
          <Link className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="/contact">Contact Us</Link>
        </div>
        <div className="flex flex-col gap-3">
          <h4 className="font-label-md text-label-md text-primary font-bold mb-2">Legal</h4>
          <Link className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="/privacy-policy">Privacy Policy</Link>
          <Link className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="/privacy-policy">Terms of Service</Link>
          <Link className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="/contact">Crisis Resources</Link>
        </div>
      </div>
      <div className="max-w-container-max mx-auto px-margin-desktop mt-12 pt-6 border-t border-outline-variant text-center md:text-left">
        <p className="font-label-sm text-label-sm text-on-surface-variant">
          © 2024 Alaga Counseling. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

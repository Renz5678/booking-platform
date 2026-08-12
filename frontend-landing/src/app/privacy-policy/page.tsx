import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Alaga Counseling",
  description: "Privacy policy in compliance with the Philippines Data Privacy Act (RA 10173).",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline mb-8 font-label-lg">
        <span className="material-symbols-outlined text-[20px]">arrow_back</span> Back to Home
      </Link>
      
      <div className="bg-white p-8 md:p-12 rounded-2xl shadow-ambient">
        <h1 className="font-headline-xl text-primary mb-4">Privacy Policy</h1>
        <p className="font-body-md text-on-surface-variant mb-8">
          Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </p>

        <div className="space-y-8 font-body-md text-on-surface leading-relaxed">
          <section>
            <p>
              At Alaga, accessible from our platform, one of our main priorities is the privacy of our users. 
              This Privacy Policy document contains types of information that is collected and recorded by Alaga 
              and how we use it, in compliance with the Data Privacy Act of 2012 (Republic Act No. 10173) of the Philippines.
            </p>
          </section>

          <section>
            <h2 className="font-headline-md text-primary mb-3">1. Information We Collect</h2>
            <p className="mb-2">We collect information that you provide directly to us when you use our platform:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Personal Information:</strong> Name, email address, password, and contact details provided during registration.</li>
              <li><strong>Health and Sensitive Information:</strong> Intake form answers, concern categories, counselor notes, and session schedules.</li>
              <li><strong>Financial Information:</strong> Payment details, transaction history, and billing information (processed securely through third-party providers).</li>
              <li><strong>Technical Information:</strong> Log files, IP addresses, browser types, and device information automatically collected when accessing the platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-headline-md text-primary mb-3">2. How We Use Your Information</h2>
            <p className="mb-2">We use the collected information for various purposes, including to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, operate, and maintain our counseling platform.</li>
              <li>Facilitate the booking, scheduling, and execution of therapy sessions.</li>
              <li>Process payments and provide transaction receipts.</li>
              <li>Communicate with you regarding updates, reminders, and platform changes.</li>
              <li>Improve platform performance and user experience.</li>
              <li>Comply with legal obligations and enforce our terms of service.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-headline-md text-primary mb-3">3. Data Retention</h2>
            <p>
              We will retain your personal information only for as long as is necessary for the purposes set out 
              in this Privacy Policy. We will retain and use your information to the extent necessary to comply 
              with our legal obligations, resolve disputes, and enforce our policies. Health and session-related 
              records will be securely retained according to professional ethical guidelines and standard 
              healthcare retention laws.
            </p>
          </section>

          <section>
            <h2 className="font-headline-md text-primary mb-3">4. Your Rights as a Data Subject</h2>
            <p className="mb-2">Under RA 10173, you have the following rights concerning your personal data:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Right to be Informed:</strong> To know whether personal data pertaining to you is being processed.</li>
              <li><strong>Right to Access:</strong> To request copies of your personal data.</li>
              <li><strong>Right to Object:</strong> To object to the processing of your personal data.</li>
              <li><strong>Right to Erasure or Blocking:</strong> To suspend, withdraw, or order the blocking, removal, or destruction of your personal data.</li>
              <li><strong>Right to Damages:</strong> To be indemnified for any damages sustained due to inaccurate, incomplete, or unlawful processing.</li>
              <li><strong>Right to Rectification:</strong> To dispute inaccuracy or error in the personal data and have us correct it.</li>
              <li><strong>Right to Data Portability:</strong> To obtain a copy of your data in an electronic or structured format.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-headline-md text-primary mb-3">5. Security Measures</h2>
            <p>
              We implement robust organizational, physical, and technical security measures to protect your data 
              from unauthorized access, accidental loss, or destruction. We utilize industry-standard encryption, 
              secure server hosting, and strict access controls. Only authorized personnel and your matched 
              counselor have access to your sensitive health information.
            </p>
          </section>

          <section>
            <h2 className="font-headline-md text-primary mb-3">6. Contact Us</h2>
            <p>
              If you have any questions or suggestions about our Privacy Policy, or if you wish to exercise 
              any of your rights under the Data Privacy Act, please do not hesitate to contact our Data 
              Protection Officer (DPO) at:
            </p>
            <div className="mt-4 p-4 bg-surface-container-lowest border border-outline-variant rounded-lg inline-block">
              <p><strong>Email:</strong> privacy@alaga.ph</p>
              <p><strong>Address:</strong> Manila, Philippines</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

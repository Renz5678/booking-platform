import React from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function PrivacyPolicyPage() {
  return (
    <DashboardLayout role="client" allowedRoles={["client", "counselor", "admin"]}>
      <div className="max-w-4xl mx-auto py-8">
        <h1 className="font-headline-xl text-primary mb-6">Privacy Policy</h1>
        <div className="bg-surface rounded-xl shadow-ambient p-8 space-y-6 text-on-surface-variant font-body-md">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          
          <h2 className="font-headline-md text-primary mt-8 mb-4">1. Introduction</h2>
          <p>
            Welcome to Alaga. We are committed to protecting your personal information and your right to privacy. 
            If you have any questions or concerns about this privacy notice, or our practices with regards to your personal information, please contact us.
          </p>
          
          <h2 className="font-headline-md text-primary mt-8 mb-4">2. Data Privacy Act (RA 10173) Compliance</h2>
          <p>
            In compliance with the Data Privacy Act of 2012 of the Philippines, we ensure that your personal and sensitive information is collected, processed, and stored securely. We only collect information that is necessary for providing our counseling services.
          </p>

          <h2 className="font-headline-md text-primary mt-8 mb-4">3. Information We Collect</h2>
          <p>
            We collect personal information that you voluntarily provide to us when you register on the platform, express an interest in obtaining information about us or our products and services, or otherwise when you contact us. This includes:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-4">
            <li>Name and Contact Data (Email)</li>
            <li>Credentials (Passwords)</li>
            <li>Booking Information and Intake Forms</li>
            <li>Session Notes (Strictly accessible only by your counselor)</li>
          </ul>

          <h2 className="font-headline-md text-primary mt-8 mb-4">4. How We Use Your Information</h2>
          <p>
            We process your information for purposes based on legitimate business interests, the fulfillment of our contract with you, compliance with our legal obligations, and/or your consent. This includes:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-4">
            <li>Facilitating account creation and logon process</li>
            <li>Fulfilling and managing your bookings</li>
            <li>Sending administrative information (e.g. session reminders)</li>
            <li>Protecting our services (e.g. fraud monitoring)</li>
          </ul>

          <h2 className="font-headline-md text-primary mt-8 mb-4">5. Information Security</h2>
          <p>
            We aim to protect your personal information through a system of organizational and technical security measures. We have implemented appropriate technical and organizational security measures designed to protect the security of any personal information we process.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

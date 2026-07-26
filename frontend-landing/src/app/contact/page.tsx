"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";

export default function ContactPage() {
  return (
    <DashboardLayout role="client" allowedRoles={["client"]}>
      <div className="max-w-2xl mx-auto">
        <h1 className="font-headline-xl text-primary mb-2">Contact Support</h1>
        <p className="font-body-lg text-on-surface-variant mb-8">We&apos;re here to help. Send us a message and we'll get back to you shortly.</p>
        
        <form className="bg-surface-container-lowest p-8 rounded-xl shadow-sm border border-outline-variant space-y-6">
          <div>
            <label className="block text-label-md font-semibold text-on-surface-variant mb-2">Subject</label>
            <input type="text" className="w-full border border-outline-variant rounded-lg p-3 bg-surface focus:outline-none focus:border-secondary" placeholder="How can we help?" />
          </div>
          <div>
            <label className="block text-label-md font-semibold text-on-surface-variant mb-2">Message</label>
            <textarea rows={5} className="w-full border border-outline-variant rounded-lg p-3 bg-surface focus:outline-none focus:border-secondary" placeholder="Describe your issue..."></textarea>
          </div>
          <button type="button" className="w-full bg-secondary text-on-secondary font-label-md py-3 rounded-lg hover:opacity-90">
            Send Message
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}

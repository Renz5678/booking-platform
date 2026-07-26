"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";

export default function FAQPage() {
  return (
    <DashboardLayout role="client" allowedRoles={["client"]}>
      <div className="max-w-3xl mx-auto">
        <h1 className="font-headline-xl text-primary mb-2">Frequently Asked Questions</h1>
        <p className="font-body-lg text-on-surface-variant mb-8">Find answers to common questions about our platform.</p>
        
        <div className="space-y-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant">
              <h3 className="font-headline-md text-primary mb-2">How do I book a session? (Placeholder)</h3>
              <p className="text-on-surface-variant">This is a placeholder answer for the FAQ section. Once content is ready, it will be displayed here.</p>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface FAQEntry {
  question: string;
  answer: string;
}

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const data = await api.get("/admin/content");
        const faqItem = data.find((item: any) => item.key === "faq_entries");
        if (faqItem && faqItem.value) {
          try {
            setFaqs(JSON.parse(faqItem.value));
          } catch (e) {
            console.error("Failed to parse FAQ JSON", e);
            setFaqs([]);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchFaqs();
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="font-headline-xl text-primary mb-2">Frequently Asked Questions</h1>
      <p className="font-body-lg text-on-surface-variant mb-12">Find answers to common questions about our platform.</p>
      
      <div className="space-y-6">
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant animate-pulse h-32"></div>
          ))
        ) : faqs.length > 0 ? (
          faqs.map((faq, idx) => (
            <div key={idx} className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant">
              <h3 className="font-headline-md text-primary mb-2">{faq.question}</h3>
              <p className="text-on-surface-variant font-body-md whitespace-pre-wrap">{faq.answer}</p>
            </div>
          ))
        ) : (
          <div className="text-center p-8 text-on-surface-variant bg-surface-container-lowest rounded-xl border border-outline-variant">
            No FAQs available at the moment.
          </div>
        )}
      </div>
    </div>
  );
}

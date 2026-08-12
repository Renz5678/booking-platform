"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: "", type: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg({ text: "", type: "" });

    try {
      await api.post("/contact/", {
        name,
        email,
        message,
        captcha_token: "dummy_token", // Replace with real reCAPTCHA/hCaptcha integration if needed
        website
      });
      setStatusMsg({ text: "Your message has been sent successfully. We will get back to you soon.", type: "success" });
      setName("");
      setEmail("");
      setMessage("");
      setWebsite("");
    } catch (err) {
      console.error(err);
      setStatusMsg({ text: "Failed to send message. Please try again later.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline mb-8 font-label-lg">
        <span className="material-symbols-outlined text-[20px]">arrow_back</span> Back to Home
      </Link>

      <div className="bg-white p-8 md:p-12 rounded-2xl shadow-ambient">
        <h1 className="font-headline-xl text-primary mb-2">Contact Support</h1>
        <p className="font-body-lg text-on-surface-variant mb-8">We're here to help. Send us a message and we'll get back to you shortly.</p>
        
        {statusMsg.text && (
          <div className={`mb-6 p-4 rounded-lg font-body-md ${statusMsg.type === 'success' ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`}>
            {statusMsg.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Honeypot field - hidden from users */}
          <div className="hidden" aria-hidden="true">
            <label>Website (Leave this blank)</label>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-label-md font-semibold text-on-surface-variant mb-2">Name</label>
              <input 
                type="text" 
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-outline-variant rounded-lg p-3 bg-surface focus:outline-none focus:border-secondary transition-colors" 
                placeholder="Your full name" 
              />
            </div>
            <div>
              <label className="block text-label-md font-semibold text-on-surface-variant mb-2">Email</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-outline-variant rounded-lg p-3 bg-surface focus:outline-none focus:border-secondary transition-colors" 
                placeholder="Your email address" 
              />
            </div>
          </div>
          
          <div>
            <label className="block text-label-md font-semibold text-on-surface-variant mb-2">Message</label>
            <textarea 
              rows={5} 
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full border border-outline-variant rounded-lg p-3 bg-surface focus:outline-none focus:border-secondary transition-colors" 
              placeholder="Describe your issue or inquiry..."
            ></textarea>
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full md:w-auto bg-primary text-on-primary font-label-md px-8 py-3 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Sending..." : "Send Message"}
          </button>
        </form>
      </div>
    </div>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Counselor {
  id: string;
  bio: string | null;
  photo_url?: string | null;
  specialization_tags: string[];
  user: {
    id: string;
    full_name: string;
  };
}

export default function Home() {
  const [quotes, setQuotes] = useState<string[]>([
    "Seeking help is not a sign of weakness; it's a testament to your commitment to well-being and personal growth."
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [featuredCounselors, setFeaturedCounselors] = useState<Counselor[]>([]);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const data = await api.get("/admin/content");
        if (Array.isArray(data)) {
          const quoteItem = data.find((item: any) => item.key === "homepage_quotes");
          if (quoteItem && quoteItem.value) {
            try {
              const parsed = JSON.parse(quoteItem.value);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setQuotes(parsed);
              }
            } catch {
              // Malformed JSON in content — fall back to default quote
            }
          }
        }
      } catch {
        // Fall back to default quote silently
      }
    };

    const fetchCounselors = async () => {
      try {
        const data = await api.get("/counselors");
        if (Array.isArray(data) && data.length > 0) {
          setFeaturedCounselors(data.slice(0, 3));
        }
      } catch {
        // Silently keep default fallback
      }
    };

    fetchContent();
    fetchCounselors();
  }, []);

  useEffect(() => {
    if (quotes.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(i => (i + 1) % quotes.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [quotes]);

  return (
    <>
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-16 md:py-24 grid grid-cols-1 md:grid-cols-2 gap-8 items-center border-b border-outline-variant">
        <div className="pr-0 md:pr-12">
          <h1 className="font-headline-xl text-[48px] md:text-[64px] leading-[1.1] text-primary mb-8 tracking-tight animate-fade-in-up">
            Professional counseling for your peace of mind.
          </h1>
          <p className="font-body-lg text-lg md:text-xl text-on-surface-variant mb-10 max-w-md leading-relaxed animate-fade-in-up animation-delay-200">
            Accessible, confidential, and compassionate online therapy tailored for the Philippines. Connect with licensed professionals from the comfort of your safe space.
          </p>
          <Link href="/counselors" className="inline-block bg-primary text-on-primary px-10 py-5 rounded-xl font-label-lg hover:bg-inverse-surface hover:text-inverse-on-surface hover:-translate-y-0.5 transition-all duration-300 shadow-md">
            Book a Session
          </Link>
        </div>
        <div className="relative h-64 md:h-[540px] rounded-2xl overflow-hidden border border-outline-variant animate-fade-in-up animation-delay-600">
          <Image
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBiCTk6Co4rdBNY7PtEJKqjdcG3ThIhRiiRAUtA1UipYcupQZdR0pM2uEoQFFVXWwp5KlzBK0jTY4Fwco6zrNZSPklmqM_eOuATVAwJgeKGismQuV_PQWXFNnwQ7aOs6AEw_fKGIpEbWlgAGNW_UFdSF5eli6tHwzIZsUcQglipLY3zoTbWp21fUmvgsUT0LUT8NldWBszZOIMbRkA3gBR-MNcVmfaUfLv1KpQGtYR9iO2eCaqbw2HzYsc6K-RkZQdLjDKAnQ8W8ZY"
            alt="A serene, well-lit modern home office or living room space serving as a safe setting for online therapy."
            className="w-full h-full object-cover grayscale-[20%]"
            fill
            priority
            unoptimized
          />
        </div>
      </section>

      {/* Quote / Testimonial Banner */}
      <section className="bg-surface-container py-16 px-6 md:px-12 border-b border-outline-variant">
        <div className="max-w-4xl mx-auto text-center">
          <p key={currentIndex} className="font-headline-md text-2xl md:text-3xl text-primary mb-4 transition-opacity duration-500 ease-in-out opacity-100 leading-snug">
            "{quotes[currentIndex]}"
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-20 border-b border-outline-variant">
        <div className="mb-14">
          <h2 className="font-headline-lg text-4xl text-primary mb-4">How It Works</h2>
          <p className="font-body-lg text-on-surface-variant max-w-2xl">Your journey to better mental health in three simple steps.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Step 1 */}
          <div className="p-8 rounded-2xl border border-outline-variant/60 bg-white shadow-sm">
            <h3 className="font-headline-md text-2xl text-primary mb-3">01. Find a Match</h3>
            <p className="font-body-md text-on-surface-variant">Browse our network of licensed professionals and filter by specialization to find the right fit for your needs.</p>
          </div>
          {/* Step 2 */}
          <div className="p-8 rounded-2xl border border-outline-variant/60 bg-white shadow-sm">
            <h3 className="font-headline-md text-2xl text-primary mb-3">02. Book a Session</h3>
            <p className="font-body-md text-on-surface-variant">Choose a schedule that works for you. Our booking system is simple, secure, and completely confidential.</p>
          </div>
          {/* Step 3 */}
          <div className="p-8 rounded-2xl border border-outline-variant/60 bg-white shadow-sm">
            <h3 className="font-headline-md text-2xl text-primary mb-3">03. Meet Online</h3>
            <p className="font-body-md text-on-surface-variant">Connect with your counselor via our secure, private video platform from anywhere you feel comfortable.</p>
          </div>
        </div>
      </section>

      {/* Featured Counselors */}
      <section className="py-20 px-6 md:px-12 bg-surface border-b border-outline-variant">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
            <div className="max-w-2xl">
              <h2 className="font-headline-lg text-4xl text-primary mb-3">Featured Professionals</h2>
              <p className="font-body-lg text-on-surface-variant">Meet some of our highly qualified, licensed counselors.</p>
            </div>
            <Link href="/counselors" className="text-primary font-label-lg hover:bg-primary hover:text-on-primary border border-primary px-6 py-3 rounded-xl transition-colors">
              View Directory
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {featuredCounselors.length > 0 ? (
              featuredCounselors.map((counselor) => (
                <Link
                  key={counselor.id}
                  href={`/counselors/${counselor.id}`}
                  className="rounded-2xl border border-outline-variant/60 bg-white flex flex-col group cursor-pointer overflow-hidden shadow-sm hover:shadow-md transition-all duration-300"
                >
                  <div className="h-56 relative bg-surface-container flex items-center justify-center overflow-hidden">
                    {counselor.photo_url ? (
                      <img
                        src={counselor.photo_url}
                        alt={counselor.user.full_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <span className="font-headline-xl text-primary/40 text-5xl">
                        {counselor.user.full_name ? counselor.user.full_name[0].toUpperCase() : "C"}
                      </span>
                    )}
                  </div>
                  <div className="p-6 flex-grow flex flex-col">
                    <h3 className="font-headline-sm text-xl text-primary mb-1 group-hover:text-secondary transition-colors duration-300">
                      {counselor.user.full_name}
                    </h3>
                    <p className="font-body-sm text-secondary mb-4 flex items-center gap-1 font-medium">
                      <span className="material-symbols-outlined text-[16px]">verified</span>
                      Licensed Counselor
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-auto">
                      {counselor.specialization_tags?.slice(0, 2).map((tag) => (
                        <span key={tag} className="bg-secondary-container/60 text-on-secondary-container px-2.5 py-0.5 rounded-full font-label-sm text-[12px]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <>
                <Link href="/counselors" className="rounded-2xl border border-outline-variant/60 bg-white flex flex-col group cursor-pointer overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="h-56 relative border-b border-outline-variant overflow-hidden">
                    <Image src="https://lh3.googleusercontent.com/aida-public/AB6AXuCp1jj8wAHjlAdoNQ0UF7q6LFbSdyfcs2mmT4U5KhNQC-unnBnWsjCF06uRdqvjgVgXkRrHwmxSjfoMQ3nHN-6Ztu2-2lp1AZYqzkoi4Rs_l6dvr-fuO1cD36b125zAgAqkjiSWOSRC5Kc-fFXeqn7-cIMJUfOuc3-X15snJ5Op3MoD-Y3sL7xuWc9oeNBKyEtuSGU2IvWRHS12b-8IBaBUX15QT4MTNXuxOrtnwFGjHh6CFSMpjojVelBpJY7IprziBJE_jt-Ht1g" alt="Dr. Jasmin Gacutan-Santos" className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700 ease-in-out" fill unoptimized />
                  </div>
                  <div className="p-6 flex-grow flex flex-col">
                    <h3 className="font-headline-sm text-xl text-primary mb-1 group-hover:text-secondary transition-colors duration-300">Dr. Jasmin Gacutan-Santos</h3>
                    <p className="font-body-sm text-secondary mb-4 flex items-center gap-1 font-medium">
                      <span className="material-symbols-outlined text-[16px]">verified</span>
                      Licensed Guidance Counselor
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-auto">
                      <span className="bg-secondary-container/60 text-on-secondary-container px-2.5 py-0.5 rounded-full font-label-sm text-[12px]">Mental Health</span>
                      <span className="bg-secondary-container/60 text-on-secondary-container px-2.5 py-0.5 rounded-full font-label-sm text-[12px]">Student Wellness</span>
                    </div>
                  </div>
                </Link>

                <Link href="/counselors" className="rounded-2xl border border-outline-variant/60 bg-white flex flex-col group cursor-pointer overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="h-56 relative border-b border-outline-variant overflow-hidden">
                    <Image src="https://lh3.googleusercontent.com/aida-public/AB6AXuBNa8Wd59QOed9xaQfWKgAQjSDpil1fX793N8RxPk_6K1JBY0d13seljiOXsZAnpM-touZOHG-Kr09KWuzKhrMRZ8KiPPdB6W3x8qddOg2OJtcbWlFsf-5TQQGzh5anKE0ze-HVWj4UPuw0NSvIKhI80z2IVgQ-e3ra33oEz-y_YKWyfuAPUYeImEn4wZqVWEeeujzNoeSJo6-a9vDmHYcEOu4JHeSQ-PI3TJrtfh7K-zRVyn1DBkPBf3CNAJXt66vowbsbtGuC8yE" alt="Sir Danree De Gula" className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700 ease-in-out" fill unoptimized />
                  </div>
                  <div className="p-6 flex-grow flex flex-col">
                    <h3 className="font-headline-sm text-xl text-primary mb-1 group-hover:text-secondary transition-colors duration-300">Sir Danree De Gula</h3>
                    <p className="font-body-sm text-secondary mb-4 flex items-center gap-1 font-medium">
                      <span className="material-symbols-outlined text-[16px]">verified</span>
                      Certified Career Guidance Advocate
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-auto">
                      <span className="bg-secondary-container/60 text-on-secondary-container px-2.5 py-0.5 rounded-full font-label-sm text-[12px]">Career Guidance</span>
                      <span className="bg-secondary-container/60 text-on-secondary-container px-2.5 py-0.5 rounded-full font-label-sm text-[12px]">Personal Growth</span>
                    </div>
                  </div>
                </Link>

                <Link href="/counselors" className="rounded-2xl border border-outline-variant/60 bg-white flex flex-col group cursor-pointer overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="h-56 relative border-b border-outline-variant overflow-hidden">
                    <Image src="https://lh3.googleusercontent.com/aida-public/AB6AXuA5nR2yWKeWaQgyPNYctMcy43Foxef-S5N3hQfDcWQjZYYIqxcm1ADnmw0mVCuoACwDuXm2YROPFSTz1Xnwx8x5UR71fBfWV-4_ZcvNADV4NnKawrdgZGcR-VHmVo7rLi670JytPTkmOpEaC2xPZLt7ZePTR5KwIFjYU8fkgBFiN7x5IsxMM5v3czLkZr9lCK6oFCFcMLcw5OtKqvCaNdmxLbtTlNWRqqnlhW6aNiMc6xh9roOkIZZftlaggmWgpkGBBBK9VqGxq3I" alt="Dr. Princess Lara V. Gaganao" className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700 ease-in-out" fill unoptimized />
                  </div>
                  <div className="p-6 flex-grow flex flex-col">
                    <h3 className="font-headline-sm text-xl text-primary mb-1 group-hover:text-secondary transition-colors duration-300">Dr. Princess Lara V. Gaganao</h3>
                    <p className="font-body-sm text-secondary mb-4 flex items-center gap-1 font-medium">
                      <span className="material-symbols-outlined text-[16px]">verified</span>
                      Values Education Specialist
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-auto">
                      <span className="bg-secondary-container/60 text-on-secondary-container px-2.5 py-0.5 rounded-full font-label-sm text-[12px]">Values Education</span>
                      <span className="bg-secondary-container/60 text-on-secondary-container px-2.5 py-0.5 rounded-full font-label-sm text-[12px]">Holistic Wellness</span>
                    </div>
                  </div>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-20 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="order-2 md:order-1 relative h-64 md:h-[450px] rounded-2xl overflow-hidden border border-outline-variant">
          <Image src="https://lh3.googleusercontent.com/aida-public/AB6AXuC5gvjiTgJkatt3S7PVBB8GBs_aPSpQfjFyjqJ-mF9I82dK5QZQFVyzAupj5ur4H8wB5zZzaYRvaaSF_xD14qyYnnQQ_gBEEGTw2pXi7J7WX9LJv_XmbE090ZZK5J5IFVCx0UMnmE182tZ6VO3ud7js-Qv2jLkfnF-Ifn0DTgOvH1O5MfBNG0og6hC1-4WVDQKgPavP1hrUHfusJAT9n0wAQ7L0UI0bg_H1VObF1xyxFwwnvBwU_iOfMZRHNuKaEaO2xYndCcy5onY" alt="An abstract, minimalist conceptual image representing mental health and wellness." className="w-full h-full object-cover grayscale-[20%]" fill unoptimized />
        </div>
        <div className="order-1 md:order-2 pl-0 md:pl-6">
          <h2 className="font-headline-lg text-4xl text-primary mb-6">Our Mission at Alaga</h2>
          <p className="font-body-lg text-on-surface-variant mb-4 leading-relaxed">
            We believe that mental health care should be a fundamental right, not a luxury. "Alaga"—which means care and nurture—is at the core of everything we do.
          </p>
          <p className="font-body-lg text-on-surface-variant mb-8 leading-relaxed">
            Our platform provides a safe, stigma-free digital environment connecting Filipinos with licensed mental health professionals. We are committed to making quality therapy accessible, reliable, and grounded in professional authority.
          </p>
          <Link href="/faq" className="inline-block border border-primary text-primary px-8 py-3.5 rounded-xl font-label-lg hover:bg-primary hover:text-on-primary transition-colors font-medium">
            Read Frequently Asked Questions
          </Link>
        </div>
      </section>
    </>
  );
}

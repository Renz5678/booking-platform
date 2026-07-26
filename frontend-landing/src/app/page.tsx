export default function Home() {
  return (
    <>
      {/* Hero Section */}
      <section className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-16 md:py-24 grid grid-cols-1 md:grid-cols-2 gap-gutter items-center">
        <div>
          <h1 className="font-headline-xl text-headline-xl md:text-[56px] md:leading-[64px] text-primary mb-6">
            Professional counseling for your peace of mind
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mb-8 max-w-md">
            Accessible, confidential, and compassionate online therapy tailored for the Philippines. Connect with licensed professionals from the comfort of your safe space.
          </p>
          <button className="bg-secondary text-on-secondary px-8 py-4 rounded-full font-label-md text-lg hover:opacity-90 transition-opacity shadow-md hover:shadow-lg">
            Book a Session
          </button>
        </div>
        <div className="relative h-64 md:h-[500px] rounded-2xl overflow-hidden custom-shadow">
          <img className="w-full h-full object-cover" alt="A serene, well-lit modern home office or living room space serving as a safe setting for online therapy. The room features soft neutral tones, minimal decor, a comfortable armchair, and warm natural light streaming through a window. The overall aesthetic is calm, professional, and therapeutic, utilizing a corporate modern minimalist style with pale mint and pure white accents." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBiCTk6Co4rdBNY7PtEJKqjdcG3ThIhRiiRAUtA1UipYcupQZdR0pM2uEoQFFVXWwp5KlzBK0jTY4Fwco6zrNZSPklmqM_eOuATVAwJgeKGismQuV_PQWXFNnwQ7aOs6AEw_fKGIpEbWlgAGNW_UFdSF5eli6tHwzIZsUcQglipLY3zoTbWp21fUmvgsUT0LUT8NldWBszZOIMbRkA3gBR-MNcVmfaUfLv1KpQGtYR9iO2eCaqbw2HzYsc6K-RkZQdLjDKAnQ8W8ZY"/>
        </div>
      </section>

      {/* Quote / Testimonial Banner */}
      <section className="bg-surface-container-low py-12 px-margin-mobile md:px-margin-desktop my-section-gap">
        <div className="max-w-3xl mx-auto text-center">
          <span className="material-symbols-outlined text-on-tertiary-container text-4xl mb-4 opacity-50" style={{ fontVariationSettings: "'FILL' 1" }}>format_quote</span>
          <p className="font-headline-lg text-headline-lg text-primary mb-6">
            &quot;Seeking help is not a sign of weakness; it&apos;s a testament to your commitment to well-being and personal growth.&quot;
          </p>
          <div className="h-1 w-16 bg-on-tertiary-container mx-auto rounded-full"></div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-section-gap">
        <div className="text-center mb-12">
          <h2 className="font-headline-lg text-headline-lg text-primary mb-4">How It Works</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Your journey to better mental health in three simple steps.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Step 1 */}
          <div className="bg-surface-container-lowest p-8 rounded-2xl text-center custom-shadow custom-hover-shadow transition-shadow">
            <div className="w-16 h-16 bg-surface-container-low rounded-full flex items-center justify-center mx-auto mb-6 text-on-tertiary-container">
              <span className="material-symbols-outlined text-3xl">search</span>
            </div>
            <h3 className="font-headline-md text-headline-md text-primary mb-3">Find a Match</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">Browse our network of licensed professionals and filter by specialization to find the right fit.</p>
          </div>
          {/* Step 2 */}
          <div className="bg-surface-container-lowest p-8 rounded-2xl text-center custom-shadow custom-hover-shadow transition-shadow">
            <div className="w-16 h-16 bg-surface-container-low rounded-full flex items-center justify-center mx-auto mb-6 text-on-tertiary-container">
              <span className="material-symbols-outlined text-3xl">calendar_today</span>
            </div>
            <h3 className="font-headline-md text-headline-md text-primary mb-3">Book a Session</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">Choose a schedule that works for you. Our booking system is simple, secure, and confidential.</p>
          </div>
          {/* Step 3 */}
          <div className="bg-surface-container-lowest p-8 rounded-2xl text-center custom-shadow custom-hover-shadow transition-shadow">
            <div className="w-16 h-16 bg-surface-container-low rounded-full flex items-center justify-center mx-auto mb-6 text-on-tertiary-container">
              <span className="material-symbols-outlined text-3xl">videocam</span>
            </div>
            <h3 className="font-headline-md text-headline-md text-primary mb-3">Meet Online</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">Connect with your counselor via our secure, private video platform from anywhere.</p>
          </div>
        </div>
      </section>

      {/* Featured Counselors */}
      <section className="bg-surface-container-low py-section-gap px-margin-mobile md:px-margin-desktop">
        <div className="max-w-container-max mx-auto">
          <div className="flex justify-between items-end mb-10">
            <div>
              <h2 className="font-headline-lg text-headline-lg text-primary mb-2">Featured Professionals</h2>
              <p className="font-body-md text-body-md text-on-surface-variant">Meet some of our highly qualified counselors.</p>
            </div>
            <button className="hidden md:flex text-on-tertiary-container font-label-md hover:underline items-center gap-1">
              View All <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="bg-surface-container-lowest rounded-2xl overflow-hidden custom-shadow custom-hover-shadow transition-shadow">
              <div className="h-48 relative">
                <img className="w-full h-full object-cover" alt="Professional headshot portrait of a compassionate female counselor named Dr. Maria Santos." src="https://lh3.googleusercontent.com/aida-public/AB6AXuCp1jj8wAHjlAdoNQ0UF7q6LFbSdyfcs2mmT4U5KhNQC-unnBnWsjCF06uRdqvjgVgXkRrHwmxSjfoMQ3nHN-6Ztu2-2lp1AZYqzkoi4Rs_l6dvr-fuO1cD36b125zAgAqkjiSWOSRC5Kc-fFXeqn7-cIMJUfOuc3-X15snJ5Op3MoD-Y3sL7xuWc9oeNBKyEtuSGU2IvWRHS12b-8IBaBUX15QT4MTNXuxOrtnwFGjHh6CFSMpjojVelBpJY7IprziBJE_jt-Ht1g"/>
              </div>
              <div className="p-6">
                <h3 className="font-headline-md text-headline-md text-primary mb-1">Dr. Maria Santos</h3>
                <p className="font-body-md text-body-md text-outline mb-4">Clinical Psychologist</p>
                <div className="flex flex-wrap gap-2">
                  <span className="bg-surface-container px-3 py-1 rounded-full font-label-sm text-on-surface-variant">Anxiety</span>
                  <span className="bg-surface-container px-3 py-1 rounded-full font-label-sm text-on-surface-variant">Depression</span>
                </div>
              </div>
            </div>
            {/* Card 2 */}
            <div className="bg-surface-container-lowest rounded-2xl overflow-hidden custom-shadow custom-hover-shadow transition-shadow">
              <div className="h-48 relative">
                <img className="w-full h-full object-cover" alt="Professional headshot portrait of an empathetic male counselor." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBNa8Wd59QOed9xaQfWKgAQjSDpil1fX793N8RxPk_6K1JBY0d13seljiOXsZAnpM-touZOHG-Kr09KWuzKhrMRZ8KiPPdB6W3x8qddOg2OJtcbWlFsf-5TQQGzh5anKE0ze-HVWj4UPuw0NSvIKhI80z2IVgQ-e3ra33oEz-y_YKWyfuAPUYeImEn4wZqVWEeeujzNoeSJo6-a9vDmHYcEOu4JHeSQ-PI3TJrtfh7K-zRVyn1DBkPBf3CNAJXt66vowbsbtGuC8yE"/>
              </div>
              <div className="p-6">
                <h3 className="font-headline-md text-headline-md text-primary mb-1">Mark Reyes, RGC</h3>
                <p className="font-body-md text-body-md text-outline mb-4">Registered Guidance Counselor</p>
                <div className="flex flex-wrap gap-2">
                  <span className="bg-surface-container px-3 py-1 rounded-full font-label-sm text-on-surface-variant">Relationships</span>
                  <span className="bg-surface-container px-3 py-1 rounded-full font-label-sm text-on-surface-variant">Stress</span>
                </div>
              </div>
            </div>
            {/* Card 3 */}
            <div className="bg-surface-container-lowest rounded-2xl overflow-hidden custom-shadow custom-hover-shadow transition-shadow">
              <div className="h-48 relative">
                <img className="w-full h-full object-cover" alt="Professional headshot portrait of a friendly female therapist." src="https://lh3.googleusercontent.com/aida-public/AB6AXuA5nR2yWKeWaQgyPNYctMcy43Foxef-S5N3hQfDcWQjZYYIqxcm1ADnmw0mVCuoACwDuXm2YROPFSTz1Xnwx8x5UR71fBfWV-4_ZcvNADV4NnKawrdgZGcR-VHmVo7rLi670JytPTkmOpEaC2xPZLt7ZePTR5KwIFjYU8fkgBFiN7x5IsxMM5v3czLkZr9lCK6oFCFcMLcw5OtKqvCaNdmxLbtTlNWRqqnlhW6aNiMc6xh9roOkIZZftlaggmWgpkGBBBK9VqGxq3I"/>
              </div>
              <div className="p-6">
                <h3 className="font-headline-md text-headline-md text-primary mb-1">Sarah Lim, RPsy</h3>
                <p className="font-body-md text-body-md text-outline mb-4">Registered Psychologist</p>
                <div className="flex flex-wrap gap-2">
                  <span className="bg-surface-container px-3 py-1 rounded-full font-label-sm text-on-surface-variant">Trauma</span>
                  <span className="bg-surface-container px-3 py-1 rounded-full font-label-sm text-on-surface-variant">Grief</span>
                </div>
              </div>
            </div>
          </div>
          <button className="md:hidden w-full mt-8 bg-surface-container text-primary py-3 rounded-full font-label-md">
            View All Counselors
          </button>
        </div>
      </section>

      {/* About Section */}
      <section className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-section-gap grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="order-2 md:order-1 relative h-64 md:h-[400px] rounded-2xl overflow-hidden custom-shadow">
          <img className="w-full h-full object-cover" alt="An abstract, minimalist conceptual image representing mental health and wellness." src="https://lh3.googleusercontent.com/aida-public/AB6AXuC5gvjiTgJkatt3S7PVBB8GBs_aPSpQfjFyjqJ-mF9I82dK5QZQFVyzAupj5ur4H8wB5zZzaYRvaaSF_xD14qyYnnQQ_gBEEGTw2pXi7J7WX9LJv_XmbE090ZZK5J5IFVCx0UMnmE182tZ6VO3ud7js-Qv2jLkfnF-Ifn0DTgOvH1O5MfBNG0og6hC1-4WVDQKgPavP1hrUHfusJAT9n0wAQ7L0UI0bg_H1VObF1xyxFwwnvBwU_iOfMZRHNuKaEaO2xYndCcy5onY"/>
        </div>
        <div className="order-1 md:order-2">
          <h2 className="font-headline-lg text-headline-lg text-primary mb-6">Our Mission at Alaga</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-4">
            We believe that mental health care should be a fundamental right, not a luxury. &quot;Alaga&quot;—which means care and nurture—is at the core of everything we do.
          </p>
          <p className="font-body-md text-body-md text-on-surface-variant mb-6">
            Our platform provides a safe, stigma-free digital environment connecting Filipinos with licensed mental health professionals. We are committed to making quality therapy accessible, reliable, and grounded in professional authority.
          </p>
          <button className="text-on-tertiary-container font-label-md font-semibold hover:underline flex items-center gap-1">
            Learn more about us <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      </section>
    </>
  );
}

"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";

export default function CounselorDashboardPage() {
  return (
    <DashboardLayout role="counselor" allowedRoles={["counselor"]}>
      {/* Welcome Header & Banner */}
      <header className="space-y-6">
        <div>
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-[28px] md:text-[32px] font-semibold tracking-tight text-primary">Good morning, Dr. Jenkins.</h1>
          <p className="font-body-md text-[16px] text-on-surface-variant mt-2">Here's an overview of your practice today.</p>
        </div>
        
        {/* Status Banner (Mint/Teal) */}
        <div className="bg-[#C3F2DA] rounded-lg p-4 flex items-center gap-3 border border-[#4FC3AA] shadow-sm">
          <div className="bg-secondary text-on-secondary rounded-full p-1.5 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <p className="font-label-md text-[14px] font-medium text-tertiary">Your profile is currently active and visible to new clients.</p>
        </div>
      </header>

      {/* Snapshot Row (Bento Grid Style) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1 */}
        <div className="bg-surface-container-lowest rounded-xl shadow-ambient p-6 flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300 cursor-pointer border border-white">
          <div className="flex items-start justify-between mb-4">
            <div className="bg-surface-container-low p-3 rounded-lg text-primary">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>groups</span>
            </div>
            <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">arrow_outward</span>
          </div>
          <div>
            <h3 className="font-headline-lg text-[32px] font-semibold text-primary mb-1">8</h3>
            <p className="font-label-md text-[14px] font-medium text-on-surface-variant">Sessions This Week</p>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-surface-container-lowest rounded-xl shadow-ambient p-6 flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300 cursor-pointer border border-white">
          <div className="flex items-start justify-between mb-4">
            <div className="bg-surface-container-low p-3 rounded-lg text-primary">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>edit_document</span>
            </div>
            <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">arrow_outward</span>
          </div>
          <div>
            <h3 className="font-headline-lg text-[32px] font-semibold text-primary mb-1">2</h3>
            <p className="font-label-md text-[14px] font-medium text-on-surface-variant">Pending Notes</p>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-surface-container-lowest rounded-xl shadow-ambient p-6 flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300 cursor-pointer border border-white">
          <div className="flex items-start justify-between mb-4">
            <div className="bg-secondary-container p-3 rounded-lg text-on-secondary-container">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>notification_add</span>
            </div>
            <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">arrow_outward</span>
          </div>
          <div>
            <h3 className="font-headline-lg text-[32px] font-semibold text-primary mb-1">3</h3>
            <p className="font-label-md text-[14px] font-medium text-on-surface-variant">New Bookings</p>
          </div>
        </div>
      </section>

      {/* Today's Schedule */}
      <section className="bg-surface-container-lowest rounded-xl shadow-ambient p-6 md:p-8 border border-white">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-surface-container">
          <h2 className="font-headline-md text-[24px] font-medium text-primary flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary">today</span>
            Today's Schedule
          </h2>
          <button className="font-label-sm text-[12px] font-semibold tracking-wider text-secondary hover:underline">View Full Calendar</button>
        </div>

        <div className="space-y-4">
          {/* Session 1 (Next Up) */}
          <div className="bg-surface-bright border border-surface-container-high rounded-xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden group">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-secondary"></div>
            <div className="flex items-center gap-4 pl-2">
              <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-on-surface-variant">person</span>
              </div>
              <div>
                <h4 className="font-label-md text-[14px] font-bold text-primary">Sarah M.</h4>
                <div className="flex items-center gap-3 mt-1 font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant">
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">schedule</span> 10:00 AM - 10:50 AM</span>
                  <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">videocam</span> Video Call</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-secondary-container text-on-secondary-container px-2 py-1 rounded font-label-sm text-[12px] font-semibold tracking-wider mr-2 hidden md:inline-block">Next Up</span>
              <button className="bg-secondary text-on-secondary font-label-md text-[14px] font-medium px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity shadow-sm w-full md:w-auto">Join Session</button>
            </div>
          </div>

          {/* Session 2 */}
          <div className="bg-surface border border-transparent hover:border-surface-container-highest rounded-xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
            <div className="flex items-center gap-4 pl-3.5">
              <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant font-headline-md text-[24px] font-medium shrink-0">
                JD
              </div>
              <div>
                <h4 className="font-label-md text-[14px] font-bold text-primary">James D.</h4>
                <div className="flex items-center gap-3 mt-1 font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant">
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">schedule</span> 1:00 PM - 1:50 PM</span>
                  <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">videocam</span> Video Call</span>
                </div>
              </div>
            </div>
            <div>
              <button className="text-primary border border-outline-variant font-label-md text-[14px] font-medium px-4 py-2 rounded-lg hover:bg-surface-container-low transition-colors w-full md:w-auto">Review Notes</button>
            </div>
          </div>

          {/* Session 3 */}
          <div className="bg-surface border border-transparent hover:border-surface-container-highest rounded-xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
            <div className="flex items-center gap-4 pl-3.5">
              <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant font-headline-md text-[24px] font-medium shrink-0">
                AT
              </div>
              <div>
                <h4 className="font-label-md text-[14px] font-bold text-primary">Alex T.</h4>
                <div className="flex items-center gap-3 mt-1 font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant">
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">schedule</span> 3:30 PM - 4:20 PM</span>
                  <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">meeting_room</span> In Person</span>
                </div>
              </div>
            </div>
            <div>
              <button className="text-primary border border-outline-variant font-label-md text-[14px] font-medium px-4 py-2 rounded-lg hover:bg-surface-container-low transition-colors w-full md:w-auto">Review Notes</button>
            </div>
          </div>
        </div>
      </section>
    </DashboardLayout>
  );
}

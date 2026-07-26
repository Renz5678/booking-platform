"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";

export default function AdminDashboardPage() {
  return (
    <DashboardLayout role="admin" allowedRoles={["admin"]}>
      {/* Header */}
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h2 className="font-headline-lg text-[32px] font-semibold tracking-tight text-primary mb-2">Welcome back, Admin</h2>
          <p className="font-body-md text-[16px] text-on-surface-variant">Here's what's happening today.</p>
        </div>
        <div className="flex gap-4">
          <button className="bg-surface-container-highest text-on-surface-variant font-label-md text-[14px] font-medium px-4 py-2 rounded-lg hover:bg-surface-container-high transition-colors flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">calendar_today</span>
            Last 30 Days
          </button>
          <button className="bg-primary text-on-primary font-label-md text-[14px] font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">
            Generate Report
          </button>
        </div>
      </header>

      {/* Stat Cards Row */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {/* Card 1 */}
        <div className="bg-white rounded-xl p-6 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all border border-surface-container-highest">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-label-md text-[14px] font-medium text-on-surface-variant">Counselors Pending Review</h3>
            <div className="bg-secondary-container text-on-secondary-container p-2 rounded-lg">
              <span className="material-symbols-outlined">pending_actions</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-headline-xl text-[48px] font-semibold tracking-tight text-primary">12</span>
            <span className="font-label-sm text-[12px] font-semibold tracking-wider text-error flex items-center">
              <span className="material-symbols-outlined text-[16px]">trending_up</span> +3 this week
            </span>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white rounded-xl p-6 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all border border-surface-container-highest">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-label-md text-[14px] font-medium text-on-surface-variant">Bookings Today</h3>
            <div className="bg-tertiary-fixed text-on-tertiary-fixed p-2 rounded-lg">
              <span className="material-symbols-outlined">calendar_month</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-headline-xl text-[48px] font-semibold tracking-tight text-primary">145</span>
            <span className="font-label-sm text-[12px] font-semibold tracking-wider text-secondary flex items-center">
              <span className="material-symbols-outlined text-[16px]">trending_up</span> +12% vs yday
            </span>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white rounded-xl p-6 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all border border-surface-container-highest">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-label-md text-[14px] font-medium text-on-surface-variant">Revenue This Week</h3>
            <div className="bg-primary-fixed text-on-primary-fixed p-2 rounded-lg">
              <span className="material-symbols-outlined">payments</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-headline-xl text-[48px] font-semibold tracking-tight text-primary">$8.4k</span>
            <span className="font-label-sm text-[12px] font-semibold tracking-wider text-secondary flex items-center">
              <span className="material-symbols-outlined text-[16px]">trending_up</span> +5%
            </span>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white rounded-xl p-6 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all border border-error-container">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-label-md text-[14px] font-medium text-on-surface-variant">Flagged Issues</h3>
            <div className="bg-error-container text-on-error-container p-2 rounded-lg">
              <span className="material-symbols-outlined">flag</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-headline-xl text-[48px] font-semibold tracking-tight text-error">3</span>
            <span className="font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant">Requires attention</span>
          </div>
        </div>
      </section>

      {/* Main Content Area: Needs Attention Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Counselors Needs Review */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-surface-container-highest flex flex-col h-full">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-headline-md text-[24px] font-medium text-primary">Pending Counselors</h3>
            <button className="font-label-md text-[14px] font-medium text-secondary hover:underline">View All</button>
          </div>
          <div className="flex flex-col gap-4 flex-1">
            {/* List Item 1 */}
            <div className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg border border-surface-container-highest hover:bg-surface-container-low transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-fixed text-on-primary-fixed rounded-full flex items-center justify-center font-bold">DR</div>
                <div>
                  <h4 className="font-label-md text-[14px] font-bold text-primary">Dr. Sarah Jenkins</h4>
                  <p className="font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant">Clinical Psychologist • Submitted 2 hrs ago</p>
                </div>
              </div>
              <button className="bg-surface-container-highest text-on-surface-variant px-3 py-1.5 rounded-lg font-label-sm text-[12px] font-semibold tracking-wider hover:bg-secondary-container hover:text-on-secondary-container transition-colors">Review</button>
            </div>

            {/* List Item 2 */}
            <div className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg border border-surface-container-highest hover:bg-surface-container-low transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-tertiary-fixed text-on-tertiary-fixed rounded-full flex items-center justify-center font-bold">MW</div>
                <div>
                  <h4 className="font-label-md text-[14px] font-bold text-primary">Marcus Webb, LMFT</h4>
                  <p className="font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant">Family Therapist • Submitted 5 hrs ago</p>
                </div>
              </div>
              <button className="bg-surface-container-highest text-on-surface-variant px-3 py-1.5 rounded-lg font-label-sm text-[12px] font-semibold tracking-wider hover:bg-secondary-container hover:text-on-secondary-container transition-colors">Review</button>
            </div>

            {/* List Item 3 */}
            <div className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg border border-surface-container-highest hover:bg-surface-container-low transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-fixed-dim text-on-primary-fixed rounded-full flex items-center justify-center font-bold">EL</div>
                <div>
                  <h4 className="font-label-md text-[14px] font-bold text-primary">Elena Rodriguez, LCSW</h4>
                  <p className="font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant">Social Worker • Submitted 1 day ago</p>
                </div>
              </div>
              <button className="bg-surface-container-highest text-on-surface-variant px-3 py-1.5 rounded-lg font-label-sm text-[12px] font-semibold tracking-wider hover:bg-secondary-container hover:text-on-secondary-container transition-colors">Review</button>
            </div>
          </div>
        </div>

        {/* Reported Bookings / Issues */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-surface-container-highest flex flex-col h-full">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-headline-md text-[24px] font-medium text-primary flex items-center gap-2">
              Flagged Issues <span className="bg-error-container text-on-error-container font-label-sm text-[12px] font-semibold tracking-wider px-2 py-0.5 rounded-full">3</span>
            </h3>
          </div>
          <div className="flex flex-col gap-4 flex-1">
            {/* Issue Item 1 */}
            <div className="p-4 bg-error-container/20 border border-error-container rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-label-md text-[14px] font-bold text-on-error-container">Missed Session Dispute</h4>
                <span className="font-label-sm text-[12px] font-semibold tracking-wider text-error">High Priority</span>
              </div>
              <p className="font-body-md text-[14px] text-on-surface-variant mb-3">Client #4829 disputes missed session charge with Dr. Jenkins. Both parties have submitted notes.</p>
              <div className="flex gap-2">
                <button className="bg-white text-on-surface-variant border border-outline-variant px-3 py-1.5 rounded-lg font-label-sm text-[12px] font-semibold tracking-wider hover:bg-surface-container-low">View Details</button>
                <button className="bg-primary text-on-primary px-3 py-1.5 rounded-lg font-label-sm text-[12px] font-semibold tracking-wider hover:opacity-90">Resolve</button>
              </div>
            </div>

            {/* Issue Item 2 */}
            <div className="p-4 bg-surface-container-lowest border border-outline-variant rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-label-md text-[14px] font-bold text-primary">Technical: Video Failure</h4>
                <span className="font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant">Med Priority</span>
              </div>
              <p className="font-body-md text-[14px] text-on-surface-variant mb-3">System logged incomplete video connection for Booking #9921. Client requested refund.</p>
              <div className="flex gap-2">
                <button className="bg-white text-on-surface-variant border border-outline-variant px-3 py-1.5 rounded-lg font-label-sm text-[12px] font-semibold tracking-wider hover:bg-surface-container-low">View Logs</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </DashboardLayout>
  );
}

"use client";

export default function SchoolAdminDashboard() {
  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-6 text-white">
      <div className="max-w-5xl mx-auto">
        <section className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 sm:p-6 md:p-8 mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-semibold mb-1">Dashboard</h2>
          <p className="text-sm text-gray-300">School admin overview</p>
        </section>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 text-center text-white/60 text-sm sm:text-base">
          Dashboard content
        </div>
      </div>
    </div>
  );
}
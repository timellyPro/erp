import { BadgeCheck, Download, Stamp } from "lucide-react"

interface Certificate {
  id: string;
  title: string;
  description: string | null;
  issuedDate: string;
  certificateUrl: string | null;
  student: {
    user: { name: string | null };
  };
}

const CertificateCard = ({ data }: any) => {
  return (
    <div className="relative group aspect-[1/1.35] bg-[#F3F4F6] rounded-xl overflow-hidden shadow-xl hover:-translate-y-2 transition duration-300">

      {/* Double Border */}
      <div className="absolute inset-3 border-4 border-[#1E293B] rounded-lg pointer-events-none"></div>
      <div className="absolute inset-6 border border-[#1E293B] rounded-lg pointer-events-none"></div>

      {/* Corner Accents */}
      <div className="absolute top-4 left-4 w-10 h-10 border-t-2 border-l-2 border-[#1E293B]" />
      <div className="absolute top-4 right-4 w-10 h-10 border-t-2 border-r-2 border-[#1E293B]" />
      <div className="absolute bottom-4 left-4 w-10 h-10 border-b-2 border-l-2 border-[#1E293B]" />
      <div className="absolute bottom-4 right-4 w-10 h-10 border-b-2 border-r-2 border-[#1E293B]" />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-between text-center px-10 py-14">

        {/* Top */}
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 border-2 border-[#1E293B] rounded-full">
            <BadgeCheck className="w-8 h-8 text-[#1E293B]" />
          </div>

          <h1 className="text-3xl font-serif font-bold tracking-wide text-[#1E293B]">
            CERTIFICATE
          </h1>

          <p className="italic text-gray-600 text-sm">
            of Achievement
          </p>
        </div>

        {/* Middle */}
        <div className="space-y-4">
          <p className="text-gray-500 tracking-widest text-xs">
            THIS IS TO CERTIFY THAT
          </p>

          <h2 className="text-2xl font-bold text-[#1E293B] border-b border-gray-400 pb-2 px-6">
            {data.name}
          </h2>

          <p className="text-gray-600 text-sm">
            has successfully completed requirements for the
          </p>

          <p className="font-semibold text-[#1E293B]">
            {data.title}
          </p>
        </div>

        {/* Bottom */}
        <div className="w-full text-sm text-gray-600 flex flex-col gap-6">

          <div className="flex justify-between">
            <p>
              <span className="font-semibold">Date:</span> {data.date}
            </p>
            <p>
              <span className="font-semibold">No:</span> {data.number}
            </p>
          </div>

          <div className="flex justify-between items-center pt-6">
            <div className="text-center">
              <div className="border-t border-gray-400 w-28 mx-auto mb-1"></div>
              <p className="text-xs tracking-wide">SIGNATURE</p>
            </div>

            <Stamp className="w-8 h-8 text-red-600" />

            <div className="text-center">
              <div className="border-t border-gray-400 w-28 mx-auto mb-1"></div>
              <p className="text-xs tracking-wide">CHAIRMAN</p>
            </div>
          </div>
        </div>
      </div>

      {/* Always-visible small download icon for touch/mobile and keyboard users */}
      {data.url && (
        <a
          href={data.url}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-2 right-2 p-2 bg-white/20 rounded-full text-black/70 hover:bg-white/30 z-20"
          aria-label="Download certificate"
        >
          <Download size={16} />
        </a>
      )}

      Hover Overlay (kept for larger desktop button)
      <div className="absolute inset-0 z-20 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
        {data.url ? (
          <a
            href={data.url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 bg-[#A3E635] text-black font-semibold rounded-full shadow-lg hover:scale-105 transition"
          >
            <Download size={18} />
            Download PDF
          </a>
        ) : (
          <button disabled className="flex items-center gap-2 px-6 py-3 bg-gray-500 text-white font-semibold rounded-full shadow-lg cursor-not-allowed">
            <Download size={18} />
            No PDF Available
          </button>
        )}
      </div>
    </div>
  )
}

const ApprovedCertificates = ({ certificates = [] }: { certificates?: Certificate[] }) => {
  const formattedCertificates = certificates.map((cert) => ({
    id: cert.id,
    name: cert.student.user.name || "Student",
    title: cert.title,
    date: new Date(cert.issuedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }),
    number: `CERT${cert.id.slice(-6).toUpperCase()}`,
    url: cert.certificateUrl,
  }));

  return (
    <div className="bg-[rgba(255,255,255,0.05)] backdrop-blur-xl border border-white/10 rounded-2xl shadow-lg overflow-hidden">
      
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Approved Certificates
          </h2>
          <p className="text-sm text-gray-400">
            Official certificates ready
          </p>
        </div>

        <span className="px-3 py-1 bg-[#A3E635]/20 text-[#A3E635] rounded-full text-xs font-bold border border-[#A3E635]/30">
          {formattedCertificates.length}
        </span>
      </div>

      {/* Certificates Grid */}
      <div className="p-6">
        {formattedCertificates.length === 0 ? (
          <div className="text-center text-gray-400 py-8">No certificates issued yet</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {formattedCertificates.map((certificate) => (
              <CertificateCard key={certificate.id} data={certificate} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ApprovedCertificates

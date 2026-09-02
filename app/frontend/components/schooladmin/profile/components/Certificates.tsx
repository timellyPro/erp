import { Award, Download } from "lucide-react";

type Certificate = {
  id: string;
  title: string;
  issuedDate: string;
  issuedBy: string | null;
  certificateUrl: string | null;
};

type Props = {
  certificates?: Certificate[];
};

export const Certificates = ({ certificates = [] }: Props) => {
  const displayData = certificates.length > 0 ? certificates : [];

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-[2rem] p-4 sm:p-8 shadow-2xl overflow-hidden min-w-0">
      <h3 className="text-lg sm:text-xl font-semibold flex items-center gap-2 sm:gap-3 mb-6 sm:mb-10 text-white">
        <Award className="w-6 h-6 text-[#b4f44d] flex-shrink-0" />
        Certificates
      </h3>
      
      {displayData.length === 0 ? (
        <div className="py-8 text-center text-gray-500 text-sm">No certificates</div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {displayData.map((c) => (
          <div
            key={c.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center transition-all hover:bg-white/10 min-w-0"
          >
            <div className="flex gap-3 sm:gap-4 items-start sm:items-center min-w-0 flex-1">
              <div className="w-11 h-11 sm:w-12 sm:h-12 bg-[#b4f44d]/10 rounded-xl flex items-center justify-center text-[#b4f44d] flex-shrink-0">
                <Award size={24} />
              </div>
              <div className="min-w-0">
                <p className="text-sm sm:text-base font-bold text-white leading-tight break-words">{c.title}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Issued on {new Date(c.issuedDate).toLocaleDateString()}
                </p>
              </div>
            </div>
            <a
              href={c.certificateUrl ?? "#"}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-[#b4f44d] p-2 transition-colors touch-manipulation min-h-[44px] min-w-[44px] inline-flex items-center justify-center self-end sm:self-center flex-shrink-0"
              aria-label="Download"
            >
              <Download size={20} />
            </a>
          </div>
        ))}
      </div>
      )}
    </div>
  );
};
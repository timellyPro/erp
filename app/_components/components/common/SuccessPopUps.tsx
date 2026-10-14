import { PRIMARY_COLOR } from "../../constants/colors";

interface SuccessPopupProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
}

export default function SuccessPopups({
  open,
  title,
  description,
  onClose,
}: SuccessPopupProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="rounded-2xl px-6 sm:px-8 py-6 sm:py-7 w-[92vw] max-w-[360px] text-center shadow-lg relative bg-white/10 border border-gray-300/20">
        {/* Check Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full border-2 flex items-center justify-center" style={{ borderColor: PRIMARY_COLOR }}>
            <svg
              className="w-8 h-8"
              style={{ color: PRIMARY_COLOR }}
              fill="none"
              stroke="currentColor" 
              strokeWidth="3"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>

        {/* Text */}
        <h2 className="text-base sm:text-lg font-semibold text-white mb-1">
          {title}
        </h2>

        {description && (
          <p className="text-xs sm:text-sm text-white/70">{description}</p>
        )}

        {/* Button */}
        <button
          onClick={onClose}
          className="mt-6 w-full py-2.5 rounded-lg text-white font-medium bg-white/10 border border-gray-300/20 hover:bg-white/20 transition-colors cursor-pointer"
        >
          OK
        </button>
      </div>
    </div>
  );
}

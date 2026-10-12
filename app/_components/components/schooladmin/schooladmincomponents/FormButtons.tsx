import { motion } from "framer-motion";
import { Loader } from "lucide-react";

interface FormButtonsProps {
  submitLabel: string;
  onCancel: () => void;
  loading?: boolean;
}

export default function FormButtons({
  submitLabel,
  onCancel,
  loading = false,
}: FormButtonsProps) {
  return (
    <div className="flex gap-3 pt-4">
      <motion.button
        type="submit"
        disabled={loading}
        whileHover={{ x: 4 }}
        className="flex-1 px-6 py-3 rounded-xl bg-lime-400 text-black font-semibold
          hover:bg-lime-300 disabled:opacity-50 disabled:cursor-not-allowed
          transition flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader size={18} className="animate-spin" />
            Saving...
          </>
        ) : (
          submitLabel
        )}
      </motion.button>
      <motion.button
        type="button"
        onClick={onCancel}
        disabled={loading}
        whileHover={{ x: -4 }}
        className="flex-1 px-6 py-3 rounded-xl bg-white/10 border border-white/20
          text-white font-semibold hover:bg-white/15 disabled:opacity-50
          transition"
      >
        Cancel
      </motion.button>
    </div>
  );
}

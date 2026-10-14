import { motion } from "framer-motion";

interface ButtonProps {
  title: string;
  loading?: boolean;
  onClick?: () => void;
}

export default function SecondaryButton({ title, loading, onClick }: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      disabled={loading}
      onClick={onClick}
      type="button"
      className="w-full bg-white/5 text-white border border-white/10 rounded-xl hover:bg-white/10 py-2.5 px-4 transition"
    >
      {loading ? "Loading..." : title}
    </motion.button>
  );
}

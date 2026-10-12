import { motion } from "framer-motion";

interface ButtonProps {
  title: string;
  loading?: boolean;
  onClick?:()=>void
}

export default function PrimaryButton({ title, loading = false, onClick }: ButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      disabled={loading}
      type="submit"
      className="bg-lime-400 text-slate-900 font-semibold
       rounded-xl hover:bg-lime-500 
       shadow-lg shadow-lime-400/20
       w-full py-3"
    >
      {title}
    </motion.button>
  );
}
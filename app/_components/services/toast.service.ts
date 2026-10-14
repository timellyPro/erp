import { ToastType } from "../context/ToastContext";


let toastFn: (msg: string, type?: ToastType) => void;

export const registerToast = (fn: typeof toastFn) => {
  toastFn = fn;
};

export const toast = {
  success: (msg: string) => toastFn?.(msg, "success"),
  error: (msg: string) => toastFn?.(msg, "error"),
  info: (msg: string) => toastFn?.(msg, "info"),
  warning: (msg: string) => toastFn?.(msg, "warning"),
};

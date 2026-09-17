import { CircleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Any action that fails without its own error message shows up here, so a button never
 * silently does nothing.
 */
export function ErrorToaster() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { message?: string } | undefined;
      setMessage(reason?.message || "Something went wrong. Please try again.");
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4" aria-live="assertive">
      <AnimatePresence>
        {message && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} role="alert" className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl bg-ink px-4 py-3 text-[15px] text-paper shadow-lg">
            <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-haldi" />
            <span className="flex-1">{message}</span>
            <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss" className="-mr-1 grid size-7 place-items-center rounded-md hover:bg-white/10">
              <X aria-hidden className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

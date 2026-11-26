import { cn } from "@/lib/utils";

export function WhatsappBubble({ message, className }: { message: string; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl rounded-tl-sm border border-emerald-100 bg-[#e7fce3] px-4 py-3 text-sm leading-relaxed text-slate-800 break-words",
        className
      )}
    >
      {message}
    </div>
  );
}

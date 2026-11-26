import { Sparkles } from "lucide-react";

interface TopBarProps {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}

export function TopBar({ title, subtitle, action }: TopBarProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-border bg-white px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <div className="flex items-center gap-2 md:hidden">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

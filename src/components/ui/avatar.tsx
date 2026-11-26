import * as React from "react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

const palette = [
  "bg-blue-50 text-blue-700",
  "bg-emerald-50 text-emerald-700",
  "bg-amber-50 text-amber-700",
  "bg-rose-50 text-rose-700",
  "bg-violet-50 text-violet-700",
  "bg-cyan-50 text-cyan-700",
];

function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % palette.length;
  return palette[hash];
}

export function Avatar({ name, size = "md", className, ...props }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        sizeMap[size],
        colorFor(name),
        className
      )}
      {...props}
    >
      {getInitials(name)}
    </div>
  );
}

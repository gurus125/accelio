import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default: "bg-brand-500 text-white hover:bg-brand-600 shadow-soft hover:shadow-md hover:-translate-y-0.5",
        secondary:
          "bg-white text-foreground border border-border hover:bg-muted hover:-translate-y-0.5",
        ghost: "hover:bg-muted text-foreground",
        outline: "border border-border bg-transparent hover:bg-muted",
        success: "bg-success-500 text-white hover:bg-success-600 hover:-translate-y-0.5",
        link: "text-brand-600 underline-offset-4 hover:underline p-0 h-auto active:scale-100",
        destructive: "bg-danger-500 text-white hover:bg-danger-600",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
        <Compass className="h-7 w-7 text-brand-600" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        Looks like this page doesn&apos;t exist.
      </p>
      <Link href="/dashboard" className={buttonVariants({ size: "lg", className: "mt-8" })}>
        Go to dashboard
      </Link>
    </div>
  );
}

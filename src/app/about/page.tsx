import { SiteNavbar } from "@/components/marketing/site-navbar";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata = { title: "About — Accelio" };

/** PLACEHOLDER — real About-page copy isn't written yet; wire this up
 * from the admin panel/CMS later instead of inventing company copy here. */
export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteNavbar />
      <div className="container flex flex-1 animate-fade-in-up flex-col items-center justify-center py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">About Accelio</h1>
        <p className="mt-3 max-w-md text-muted-foreground">This page is coming soon.</p>
      </div>
      <SiteFooter />
    </div>
  );
}

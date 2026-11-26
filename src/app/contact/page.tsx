import { SiteNavbar } from "@/components/marketing/site-navbar";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata = { title: "Contact — Reelo" };

/** PLACEHOLDER — real contact details aren't set up yet; wire this up
 * from the admin panel/CMS later instead of inventing contact info here. */
export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteNavbar />
      <div className="container flex flex-1 flex-col items-center justify-center py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Contact us</h1>
        <p className="mt-3 max-w-md text-muted-foreground">This page is coming soon.</p>
      </div>
      <SiteFooter />
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Scissors,
  Wand2,
  Wrench,
  Stethoscope,
  Dumbbell,
  Shirt,
  MoreHorizontal,
  FileSpreadsheet,
  Receipt,
  Monitor,
  NotebookPen,
  UploadCloud,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ensureBusinessForCurrentUser } from "@/lib/business/actions";

const BUSINESS_TYPES = [
  { id: "salon", label: "Salon", icon: Scissors },
  { id: "parlour", label: "Parlour", icon: Wand2 },
  { id: "garage", label: "Garage", icon: Wrench },
  { id: "clinic", label: "Clinic", icon: Stethoscope },
  { id: "gym", label: "Gym", icon: Dumbbell },
  { id: "boutique", label: "Boutique", icon: Shirt },
  { id: "other", label: "Other", icon: MoreHorizontal },
];

const RECORD_OPTIONS = [
  { id: "sheets", label: "Excel / Google Sheets", icon: FileSpreadsheet },
  { id: "billing", label: "Billing software", icon: Receipt },
  { id: "pos", label: "POS", icon: Monitor },
  { id: "notebook", label: "Notebook", icon: NotebookPen },
  { id: "other", label: "Other", icon: MoreHorizontal },
];

const TOTAL_STEPS = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [businessType, setBusinessType] = React.useState("salon");
  const [recordMethod, setRecordMethod] = React.useState("sheets");
  const [settingUpBusiness, setSettingUpBusiness] = React.useState(false);
  const [finishing, setFinishing] = React.useState(false);

  const back = () => setStep((s) => Math.max(s - 1, 1));

  /**
   * Phase 20 fix — this used to be called only once, at the very end of
   * onboarding (step 4's "finish"). But step 3 now hands off to the real
   * customer-import wizard at /customers/import, and that page requires a
   * business to already exist (`getBusinessForCurrentUser()` — see its
   * "Finish setting up your business in Settings first" fallback). So this
   * runs as soon as we have enough to create the business (after step 1),
   * not just at the end. `ensureBusinessForCurrentUser` is idempotent —
   * calling it again in `finish()` for someone who skips import is a
   * harmless no-op, not a duplicate business row.
   */
  const goToStep3 = async () => {
    setSettingUpBusiness(true);
    try {
      await ensureBusinessForCurrentUser({ businessType: BUSINESS_TYPES.find((t) => t.id === businessType)?.label });
    } catch {
      // Non-fatal — worst case /customers/import shows its own "finish
      // setting up your business" message and the user can retry from there.
    } finally {
      setSettingUpBusiness(false);
      setStep(3);
    }
  };

  const goToImport = () => {
    router.push("/customers/import");
  };

  const finish = async () => {
    setFinishing(true);
    try {
      await ensureBusinessForCurrentUser({ businessType: BUSINESS_TYPES.find((t) => t.id === businessType)?.label });
    } catch {
      // Non-fatal: worst case, the business row gets created lazily the
      // next time a page needs it. Never block navigation on this.
    }
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="flex h-16 items-center justify-center gap-2 border-b border-border bg-white">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="text-lg font-semibold tracking-tight">Reelo</span>
      </header>

      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-10 sm:py-16">
        {/* Progress */}
        <div className="mb-10 flex items-center gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, idx) => (
            <div
              key={idx}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                idx + 1 <= step ? "bg-brand-500" : "bg-border"
              )}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="animate-fade-in-up">
            <h1 className="text-2xl font-semibold tracking-tight">What type of business do you run?</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">This helps Reelo tailor its suggestions.</p>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {BUSINESS_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setBusinessType(type.id)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-2xl border bg-white p-5 text-sm font-medium transition-all duration-150 active:scale-95",
                    businessType === type.id
                      ? "border-brand-500 ring-2 ring-brand-100 scale-[1.02]"
                      : "border-border hover:border-brand-200 hover:-translate-y-0.5 hover:shadow-md"
                  )}
                >
                  <type.icon className="h-6 w-6 text-brand-600" />
                  {type.label}
                </button>
              ))}
            </div>
            <Button className="mt-10 w-full" size="lg" onClick={() => setStep(2)}>
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-in-up">
            <h1 className="text-2xl font-semibold tracking-tight">How do you currently keep customer records?</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">There&apos;s no wrong answer — we&apos;ll work with what you have.</p>
            <div className="mt-8 space-y-2.5">
              {RECORD_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setRecordMethod(option.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border bg-white p-4 text-left text-sm font-medium transition-all duration-150 active:scale-[0.98]",
                    recordMethod === option.id
                      ? "border-brand-500 ring-2 ring-brand-100"
                      : "border-border hover:border-brand-200 hover:-translate-y-0.5 hover:shadow-md"
                  )}
                >
                  <option.icon className="h-5 w-5 text-brand-600" />
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mt-10 flex gap-3">
              <Button variant="secondary" size="lg" onClick={back}>Back</Button>
              <Button className="flex-1" size="lg" onClick={goToStep3} disabled={settingUpBusiness}>
                {settingUpBusiness ? "One moment..." : "Continue"}
                {!settingUpBusiness && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-fade-in-up">
            <h1 className="text-2xl font-semibold tracking-tight">Import your customers</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Bring in your existing customer list so Reelo can start finding opportunities. You can always do this
              later from Customers.
            </p>

            <button
              onClick={goToImport}
              className="mt-8 flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-white px-6 py-14 text-center transition-all duration-200 hover:border-brand-300 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
            >
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Import from a CSV or Excel file</p>
                <p className="text-sm text-muted-foreground">
                  We&apos;ll walk you through matching your columns — up to 20,000 rows
                </p>
              </div>
            </button>

            <div className="mt-10 flex items-center justify-between gap-3">
              <Button variant="secondary" size="lg" onClick={back}>Back</Button>
              <button
                className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => setStep(4)}
              >
                Skip for now — I&apos;ll import later
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="animate-fade-in-up flex flex-col items-center py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-50 animate-scale-in">
              <CheckCircle2 className="h-9 w-9 text-success-600" />
            </div>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">You&apos;re ready.</h1>
            <p className="mt-2 max-w-sm text-muted-foreground">
              Add your customers whenever you&apos;re ready, and Reelo will start finding who needs your attention.
            </p>
            <Button size="lg" className="mt-8" onClick={finish} disabled={finishing}>
              {finishing ? "Setting up..." : "Go to dashboard"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

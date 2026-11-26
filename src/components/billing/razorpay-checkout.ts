"use client";

/**
 * Loads Razorpay's Checkout script once (cached on `window`) and opens it
 * for a given subscription. This is the ONLY file that touches
 * `window.Razorpay` — kept small and isolated so it's obvious nothing else
 * in the client bundle depends on how Checkout is loaded.
 */

interface RazorpayCheckoutOptions {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  theme?: { color?: string };
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckoutScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Not in a browser."));
  if (window.Razorpay) return Promise.resolve();

  const existing = document.querySelector(`script[src="${CHECKOUT_SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Couldn't load the payment form. Please try again.")));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load the payment form. Please try again."));
    document.body.appendChild(script);
  });
}

export async function openRazorpayCheckout(params: {
  razorpayKeyId: string;
  razorpaySubscriptionId: string;
  planName: string;
  onSuccess: (response: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => void;
  onDismiss: () => void;
}): Promise<void> {
  await loadCheckoutScript();
  if (!window.Razorpay) throw new Error("Couldn't load the payment form. Please try again.");

  const checkout = new window.Razorpay({
    key: params.razorpayKeyId,
    subscription_id: params.razorpaySubscriptionId,
    name: "Reelo",
    description: `${params.planName} plan`,
    theme: { color: "#4f46e5" },
    handler: params.onSuccess,
    modal: { ondismiss: params.onDismiss },
  });
  checkout.open();
}

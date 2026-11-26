"use client";

import * as React from "react";
import { Check, MessageCircle, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

type SendState = "idle" | "sending" | "sent";

interface SendWhatsappButtonProps extends Omit<ButtonProps, "onClick"> {
  label?: string;
}

/**
 * Simulates sending a WhatsApp message: idle -> "Sending..." -> "Sent ✓".
 * No real message is ever sent — this is a Phase 1 visual mock only.
 */
export function SendWhatsappButton({ label = "Send WhatsApp", className, ...props }: SendWhatsappButtonProps) {
  const [state, setState] = React.useState<SendState>("idle");

  const handleClick = () => {
    if (state !== "idle") return;
    setState("sending");
    setTimeout(() => setState("sent"), 1100);
  };

  return (
    <Button
      variant={state === "sent" ? "success" : "default"}
      onClick={handleClick}
      disabled={state === "sending"}
      className={className}
      {...props}
    >
      {state === "idle" && (
        <>
          <MessageCircle className="h-4 w-4" />
          {label}
        </>
      )}
      {state === "sending" && (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Sending...
        </>
      )}
      {state === "sent" && (
        <>
          <Check className="h-4 w-4" />
          Sent
        </>
      )}
    </Button>
  );
}

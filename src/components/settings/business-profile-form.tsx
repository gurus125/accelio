"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/inline-error";
import { updateBusinessProfile } from "@/lib/business/actions";

interface BusinessProfileFormProps {
  initialName: string;
  initialType: string;
  initialCity: string;
  initialOwnerName: string;
  initialPhone: string;
}

export function BusinessProfileForm({
  initialName,
  initialType,
  initialCity,
  initialOwnerName,
  initialPhone,
}: BusinessProfileFormProps) {
  const [name, setName] = React.useState(initialName);
  const [type, setType] = React.useState(initialType);
  const [city, setCity] = React.useState(initialCity);
  const [ownerName, setOwnerName] = React.useState(initialOwnerName);
  const [phone, setPhone] = React.useState(initialPhone);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    const result = await updateBusinessProfile({ name, businessType: type, city, ownerName, phone });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSuccess(true);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <InlineError message={error} />
      {success && (
        <p role="status" className="text-sm text-success-600">
          Saved.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="business-name" className="text-sm font-medium">
            Business name
          </label>
          <Input id="business-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="business-type" className="text-sm font-medium">
            Business type
          </label>
          <Input id="business-type" value={type} onChange={(e) => setType(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="business-city" className="text-sm font-medium">
            City
          </label>
          <Input id="business-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="business-owner" className="text-sm font-medium">
            Owner
          </label>
          <Input id="business-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="business-phone" className="text-sm font-medium">
            Your own WhatsApp number (for testing automations)
          </label>
          <Input
            id="business-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 98765 43210"
          />
          <p className="text-xs text-neutral-500">
            Used only for &quot;Send test message&quot; in Automations — never for real customer sends.
          </p>
        </div>
      </div>
      <Button size="sm" type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}

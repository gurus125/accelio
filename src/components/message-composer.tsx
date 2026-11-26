"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { WhatsappBubble } from "@/components/whatsapp-bubble";
import { Pencil } from "lucide-react";

interface MessageComposerProps {
  initialMessage: string;
  onSave?: (message: string) => void;
}

/**
 * Toggles between a read-only WhatsApp-style preview and an editable
 * textarea. Purely local state for Phase 1 — nothing is persisted.
 */
export function MessageComposer({ initialMessage, onSave }: MessageComposerProps) {
  const [message, setMessage] = React.useState(initialMessage);
  const [draft, setDraft] = React.useState(initialMessage);
  const [editing, setEditing] = React.useState(false);

  const handleSave = () => {
    setMessage(draft);
    setEditing(false);
    onSave?.(draft);
  };

  if (editing) {
    return (
      <div className="space-y-3">
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} aria-label="Edit message" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleSave}>
            Save message
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(message);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <WhatsappBubble message={message} />
      <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
        <Pencil className="h-3.5 w-3.5" />
        Edit message
      </Button>
    </div>
  );
}

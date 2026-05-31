"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NcmModal } from "@/components/admin/ncm-modal";

interface Props {
  value: string;
  onChange: (position: string) => void;
  onApply?: (position: string, dieNumber: number | null, aecNumber: number | null, teNumber: number | null) => void;
  name?: string;
}

export function NcmAutocomplete({ value, onChange, onApply, name = "tariffPosition" }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  function handleSelect(position: string, dieNumber: number | null, aecNumber: number | null, teNumber: number | null) {
    onChange(position);
    onApply?.(position, dieNumber, aecNumber, teNumber);
  }

  return (
    <>
      {/* Hidden input for FormData */}
      <input type="hidden" name={name} value={value} />

      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ej. 8518.40.00.000C"
          className="font-mono"
        />
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          title="Buscar posición arancelaria en PCRAM"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          Buscar NCM
        </button>
      </div>

      <NcmModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleSelect}
      />
    </>
  );
}

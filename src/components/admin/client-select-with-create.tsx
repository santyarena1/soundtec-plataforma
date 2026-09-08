"use client";

import { useState } from "react";
import { SearchablePick } from "@/components/admin/searchable-pick";
import { ClientFormModal } from "@/components/admin/client-form-modal";
import { getClientOption } from "@/server/actions/clients";

export interface ClientOption {
  id: string;
  name: string;
}

interface Props {
  clients: ClientOption[];
  owners: { id: string; name: string }[];
  priceLists: { id: string; name: string }[];
  /** Nombre del input hidden que viaja en el form (default "clientId"). */
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  label?: string;
  placeholder?: string;
}

/**
 * Selector de cliente con alta inline: al crear uno nuevo desde el modal queda
 * seleccionado sin salir de la pantalla (cotización rápida, nueva cotización).
 */
export function ClientSelectWithCreate({
  clients,
  owners,
  priceLists,
  name = "clientId",
  value,
  defaultValue = "",
  onChange,
  label = "Cliente",
  placeholder = "Buscá un cliente activo…",
}: Props) {
  const [options, setOptions] = useState<ClientOption[]>(clients);
  const [internal, setInternal] = useState(defaultValue);
  const selected = value ?? internal;

  function select(id: string) {
    setInternal(id);
    onChange?.(id);
  }

  async function handleCreated(id: string) {
    const option = await getClientOption(id);
    if (option) {
      setOptions((current) =>
        current.some((item) => item.id === option.id) ? current : [option, ...current]
      );
    }
    select(id);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <SearchablePick
            label={label}
            options={options}
            value={selected}
            onChange={select}
            placeholder={placeholder}
          />
        </div>
        <ClientFormModal
          owners={owners}
          priceLists={priceLists}
          triggerLabel="+ Nuevo cliente"
          onCreated={handleCreated}
        />
      </div>
      <input type="hidden" name={name} value={selected} />
    </div>
  );
}

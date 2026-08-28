"use client";

import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "soundtec.quoteFocusMode";

/** Oculta el sidebar del admin para dar más espacio al documento de la COT. */
export function QuoteFocusToggle() {
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY) === "1";
    setFocus(saved);
    document.body.classList.toggle("quote-focus-mode", saved);
    return () => document.body.classList.remove("quote-focus-mode");
  }, []);

  function toggle() {
    setFocus((prev) => {
      const next = !prev;
      window.localStorage.setItem(KEY, next ? "1" : "0");
      document.body.classList.toggle("quote-focus-mode", next);
      return next;
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" className="bg-card/95 shadow-sm" onClick={toggle}>
      {focus ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
      {focus ? "Mostrar menú" : "Modo enfoque"}
    </Button>
  );
}

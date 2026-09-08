import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
export function RunPanel({ children }: { children: ReactNode }) { return <Card><CardContent className="space-y-4 p-5">{children}</CardContent></Card>; }

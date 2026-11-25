import { Suspense } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { getCurrentPermissions, getSessionUser } from "@/lib/auth-helpers";
import { isPanelRole } from "@/lib/permissions";
import { quickEditAccess } from "@/lib/quick-edit/access";
import { prisma } from "@/lib/prisma";
import { QuickEditLauncher } from "./quick-edit-launcher";

/**
 * Montaje de la edición rápida en una ficha (portal o catálogo público). Decide
 * en el servidor: a un cliente, a un visitante o a alguien del equipo sin
 * permiso de editar productos no se le manda nada.
 */
export async function AdminQuickEdit({ productId }: { productId: string }) {
  const user = await getSessionUser();
  if (!user || !isPanelRole(user.role)) return null;
  const { permissions } = await getCurrentPermissions();
  if (!quickEditAccess(user.role, permissions).canOpen) return null;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      normalizedName: true,
      updatedAt: true,
      images: { select: { id: true, sortOrder: true, isPrimary: true } },
      videos: { select: { id: true, sortOrder: true } },
      labels: { select: { labelId: true } },
      _count: { select: { accessories: true } },
    },
  });
  if (!product) return null;
  // Huella de lo que muestra el panel: si cambia (otra pestaña, otro panel), el panel relee.
  const revision = [
    product.updatedAt.toISOString(),
    product.images.map((i) => `${i.id}:${i.sortOrder}:${i.isPrimary ? 1 : 0}`).sort().join(","),
    product.videos.map((v) => `${v.id}:${v.sortOrder}`).sort().join(","),
    product.labels.map((l) => l.labelId).sort().join(","),
    product._count.accessories,
  ].join("|");

  return (
    <Suspense fallback={null}>
      <QuickEditLauncher productId={productId} productName={product.normalizedName} revision={revision} adminHref={`/admin/products/${productId}`} />
    </Suspense>
  );
}

/**
 * Botón de la ficha del admin: abre la misma ficha en el portal con el panel de
 * edición rápida ya abierto. Con Ctrl/Cmd+clic, en otra pestaña (es un enlace).
 */
export function OpenPortalEditLink({ productId, isActive }: { productId: string; isActive: boolean }) {
  if (!isActive) return null;
  return (
    <Link
      href={`/portal/products/${productId}?editar=1`}
      title="Ver la ficha como la ve el cliente y editarla ahí (Ctrl/Cmd+clic: otra pestaña)"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
    >
      <Pencil className="h-3.5 w-3.5" /> Editar en la vista del portal
    </Link>
  );
}

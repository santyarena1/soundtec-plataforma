import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Bookmark } from "lucide-react";
import { createWishlist } from "@/server/actions/wishlist";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Mis listas" };

export default async function ListsPage() {
  const user = await requireUser();
  const lists = await prisma.wishlist.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { items: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Mis listas" description="Armá listas internas (proyectos, presupuestos, equipos) con tus productos." />

      <Card>
        <CardContent className="p-6">
          <form action={createWishlist} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="name" required>
                Nueva lista
              </Label>
              <Input id="name" name="name" placeholder="Ej. Auditorio Universidad XYZ" required minLength={2} />
            </div>
            <Button type="submit">Crear lista</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map((list) => (
          <Card key={list.id} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Bookmark className="h-4 w-4" />
                </span>
                <p className="font-semibold">{list.name}</p>
                {list.isDefault ? <span className="text-xs text-muted-foreground">(favoritos)</span> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {list._count.items} ítem(s) · creada el {formatDate(list.createdAt)}
              </p>
              <div className="mt-auto flex gap-2">
                <Link
                  href={`/portal/lists/${list.id}`}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-secondary"
                >
                  Ver lista
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

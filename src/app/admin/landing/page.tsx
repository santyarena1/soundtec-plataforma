import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { upsertHero, upsertPost, deletePost } from "@/server/actions/landing";
import { ConfirmSubmit } from "@/components/ui/confirm-button";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Admin · Landing" };

export default async function AdminLandingPage() {
  await requireAdmin();
  const [hero, posts] = await Promise.all([
    prisma.landingHero.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.landingPost.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Landing pública" description="Editá el contenido visible para no-clientes." />

      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">Hero principal</h2>
          <form action={upsertHero} className="grid gap-3 sm:grid-cols-2">
            {hero ? <input type="hidden" name="id" value={hero.id} /> : null}
            <div className="sm:col-span-2">
              <Label htmlFor="title" required>Título</Label>
              <Input id="title" name="title" required defaultValue={hero?.title || ""} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="subtitle">Subtítulo</Label>
              <Textarea id="subtitle" name="subtitle" rows={3} defaultValue={hero?.subtitle || ""} />
            </div>
            <div>
              <Label htmlFor="imageUrl">URL de imagen</Label>
              <Input id="imageUrl" name="imageUrl" type="url" defaultValue={hero?.imageUrl || ""} placeholder="https://..." />
            </div>
            <div>
              <Label htmlFor="ctaText">Texto botón</Label>
              <Input id="ctaText" name="ctaText" defaultValue={hero?.ctaText || "Acceder al portal"} />
            </div>
            <div>
              <Label htmlFor="ctaUrl">URL botón</Label>
              <Input id="ctaUrl" name="ctaUrl" defaultValue={hero?.ctaUrl || "/login"} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={hero?.isActive ?? true} />
              Mostrar en landing
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit">Guardar hero</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">Nueva publicación / nota</h2>
          <form action={upsertPost} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="post-title" required>Título</Label>
              <Input id="post-title" name="title" required />
            </div>
            <div>
              <Label htmlFor="coverImageUrl">URL de portada</Label>
              <Input id="coverImageUrl" name="coverImageUrl" type="url" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="excerpt">Resumen</Label>
              <Input id="excerpt" name="excerpt" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="content" required>Contenido (Markdown permitido)</Label>
              <Textarea id="content" name="content" required rows={6} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPublished" />
              Publicar inmediatamente
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit">Crear publicación</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {posts.map((p) => (
          <Card key={p.id}>
            <CardContent className="space-y-3 p-5">
              <details>
                <summary className="flex cursor-pointer items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      /{p.slug} · {p.isPublished ? <Badge tone="success">publicada</Badge> : <Badge tone="muted">borrador</Badge>} ·{" "}
                      {formatDate(p.updatedAt)}
                    </p>
                  </div>
                  <span className="text-xs text-accent">Editar / contraer</span>
                </summary>

                <form action={upsertPost} className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={p.id} />
                  <div>
                    <Label htmlFor={`title-${p.id}`} required>Título</Label>
                    <Input id={`title-${p.id}`} name="title" required defaultValue={p.title} />
                  </div>
                  <div>
                    <Label htmlFor={`cover-${p.id}`}>URL de portada</Label>
                    <Input id={`cover-${p.id}`} name="coverImageUrl" type="url" defaultValue={p.coverImageUrl || ""} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor={`excerpt-${p.id}`}>Resumen</Label>
                    <Input id={`excerpt-${p.id}`} name="excerpt" defaultValue={p.excerpt || ""} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor={`content-${p.id}`}>Contenido</Label>
                    <Textarea id={`content-${p.id}`} name="content" rows={6} defaultValue={p.content} required />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="isPublished" defaultChecked={p.isPublished} />
                    Publicada
                  </label>
                  <div className="sm:col-span-2 flex justify-end">
                    <Button type="submit" size="sm">Guardar cambios</Button>
                  </div>
                </form>

                <form action={deletePost} className="mt-2 flex justify-end">
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmSubmit confirmMessage={`Eliminar la publicación "${p.title}"?`}>
                    Eliminar publicación
                  </ConfirmSubmit>
                </form>
              </details>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

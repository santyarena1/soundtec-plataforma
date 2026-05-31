import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { upsertCrestronDevice, deleteCrestronDevice } from "@/server/actions/crestron-home";
import { CrestronActionsBar } from "./crestron-actions";

export const metadata = { title: "Admin · Crestron Home" };

const CATEGORIES = [
  "Audio",
  "Cameras",
  "Climate",
  "Lighting",
  "Motorized Shades",
  "Networking",
  "Occupancy Sensors",
  "Remotes & Keypads",
  "Security",
  "Televisions",
  "Video",
  "Other",
];

const PROTOCOLS = ["Cresnet", "infiNET EX", "Ethernet", "IP", "RS-232", "IR", "Zigbee", "Z-Wave"];

interface CrestronDevice {
  id: string;
  modelNumber: string;
  productName: string;
  category: string;
  subCategory: string | null;
  brand: string | null;
  protocol: string | null;
  notes: string | null;
  sourceUrl: string | null;
  isActive: boolean;
}

export default async function CrestronHomePage() {
  await requireAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;
  const devices: CrestronDevice[] = await db.crestronHomeDevice.findMany({
    orderBy: [{ category: "asc" }, { productName: "asc" }],
  });

  const byCategory = devices.reduce<Record<string, CrestronDevice[]>>((acc, d) => {
    if (!acc[d.category]) acc[d.category] = [];
    acc[d.category].push(d);
    return acc;
  }, {});

  const compatibleCount = await prisma.product.count({ where: { isCrestronHomeCompatible: true } });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crestron Home"
        description={`Dispositivos compatibles con Crestron Home · ${devices.length} modelos · ${compatibleCount} productos marcados`}
        actions={<CrestronActionsBar />}
      />

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 text-sm font-semibold">Agregar dispositivo</h2>
          <form action={upsertCrestronDevice} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="modelNumber" required>Modelo</Label>
              <Input id="modelNumber" name="modelNumber" required placeholder="Ej. DMPS3-4K-300-C" />
            </div>
            <div className="lg:col-span-2">
              <Label htmlFor="productName" required>Nombre del producto</Label>
              <Input id="productName" name="productName" required />
            </div>
            <div>
              <Label htmlFor="category" required>Categoría</Label>
              <Select id="category" name="category">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="subCategory">Subcategoría</Label>
              <Input id="subCategory" name="subCategory" />
            </div>
            <div>
              <Label htmlFor="brand">Marca</Label>
              <Input id="brand" name="brand" placeholder="Ej. Crestron, Lutron" />
            </div>
            <div>
              <Label htmlFor="protocol">Protocolo</Label>
              <Select id="protocol" name="protocol">
                <option value="">— ninguno —</option>
                {PROTOCOLS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="sourceUrl">URL de referencia</Label>
              <Input id="sourceUrl" name="sourceUrl" type="url" placeholder="https://..." />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
              <Button type="submit">Agregar dispositivo</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {devices.length === 0 ? (
        <TableEmpty message="Sin dispositivos registrados todavía." />
      ) : (
        Object.entries(byCategory).map(([cat, list]) => (
          <div key={cat}>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{cat}</h2>
            <Table>
              <THead>
                <TR>
                  <TH>Modelo</TH>
                  <TH>Producto</TH>
                  <TH>Marca</TH>
                  <TH>Protocolo</TH>
                  <TH>Subcategoría</TH>
                  <TH>Estado</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {list.map((d) => (
                  <TR key={d.id}>
                    <TD className="font-mono text-xs">{d.modelNumber}</TD>
                    <TD>
                      {d.sourceUrl ? (
                        <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                          {d.productName}
                        </a>
                      ) : d.productName}
                    </TD>
                    <TD>{d.brand || "—"}</TD>
                    <TD>{d.protocol || "—"}</TD>
                    <TD>{d.subCategory || "—"}</TD>
                    <TD>
                      {d.isActive ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>}
                    </TD>
                    <TD>
                      <form action={deleteCrestronDevice}>
                        <input type="hidden" name="id" value={d.id} />
                        <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                          Eliminar
                        </Button>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        ))
      )}
    </div>
  );
}

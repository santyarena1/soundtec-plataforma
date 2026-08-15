"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadQuoteForUser } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { quoteIssueCheck } from "@/lib/quote-issue";
import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import * as XLSX from "xlsx";

export async function issueQuote(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const id = String(formData.get("quoteId") || "");
  const loaded = await loadQuoteForUser(id);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (!permissionsHave(loaded.permissions, "quotes.issue") && !loaded.permissions.fullAccess) {
    return { ok: false, error: "Sin permiso para emitir." };
  }
  const check = quoteIssueCheck(loaded.quote);
  if (check.errors.length) return { ok: false, error: check.errors[0] };

  const snapshot = {
    number: loaded.quote.number,
    client: loaded.quote.client?.companyName,
    items: loaded.quote.items.map((i) => ({
      quantity: Number(i.quantity),
      description: i.description,
      unitPriceUsd: Number(i.unitPriceUsd),
      lineTotalUsd: Number(i.lineTotalUsd),
      ivaRate: Number(i.ivaRate),
      deliveryKey: i.deliveryKey,
      optional: i.optional,
    })),
    sections: loaded.quote.sections.map((s) => ({ type: s.type, title: s.title, body: s.body, included: s.included })),
    assets: loaded.quote.assets.map((a) => ({ kind: a.kind, url: a.url, caption: a.caption })),
  };

  let xlsxBlobUrl: string | undefined;
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { bytes, filename } = await buildQuoteWorkbook(id);
      const blob = await put(`quotes/${id}/${filename}`, Buffer.from(bytes), {
        access: "public",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      xlsxBlobUrl = blob.url;
    }
  } catch {
    /* snapshot sigue valiendo */
  }

  await prisma.quote.update({
    where: { id },
    data: {
      status: "ISSUED",
      issuedAt: new Date(),
      issuedById: loaded.user.id,
      ...(xlsxBlobUrl ? { xlsxBlobUrl } : {}),
    },
  });
  await prisma.quoteRevision.create({
    data: {
      quoteId: id,
      actorId: loaded.user.id,
      summary: `Emisión ${loaded.quote.number}`,
      snapshot,
    },
  });
  for (const w of check.warnings) {
    await prisma.quoteValidation.create({
      data: { quoteId: id, rule: "issue_warning", severity: "WARNING", message: w, status: "ignored" },
    });
  }
  revalidatePath(`/admin/quotes/${id}`);
  revalidatePath("/admin/quotes");
  return { ok: true };
}

export async function submitQuoteForReview(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const id = String(formData.get("quoteId") || "");
  const loaded = await loadQuoteForUser(id);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "Ya emitida." };
  await prisma.quote.update({ where: { id }, data: { status: "IN_REVIEW" } });
  await prisma.quoteRevision.create({
    data: { quoteId: id, actorId: loaded.user.id, summary: "Enviada a revisión" },
  });
  revalidatePath(`/admin/quotes/${id}`);
  return { ok: true };
}

export async function buildQuoteWorkbook(quoteId: string): Promise<{ bytes: Uint8Array; filename: string }> {
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) throw new Error("Sin acceso");
  const rows = [
    ["Número", loaded.quote.number],
    ["Cliente", loaded.quote.client?.companyName || ""],
    ["Referencia", loaded.quote.reference || ""],
    [],
    ["Cant", "U", "Detalle", "Unitario USD", "Total USD", "IVA %", "Entrega"],
    ...loaded.quote.items.map((i) => [
      Number(i.quantity),
      i.unit,
      i.description,
      Number(i.unitPriceUsd),
      Number(i.lineTotalUsd),
      Number(i.ivaRate),
      i.deliveryKey || "",
    ]),
    [],
    ["Total neto USD", loaded.quote.items.reduce((s, i) => s + Number(i.lineTotalUsd), 0)],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "COT");
  return {
    bytes: XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array,
    filename: `${loaded.quote.number}.xlsx`,
  };
}

export async function addServiceToQuote(formData: FormData): Promise<void> {
  const quoteId = String(formData.get("quoteId") || "");
  const description = String(formData.get("description") || "").trim();
  const qty = Number(formData.get("quantity") || "1") || 1;
  const unitPrice = Number(formData.get("unitPriceUsd") || "0") || 0;
  if (!description) return;
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote || loaded.quote.status === "ISSUED") return;
  const sort = loaded.quote.items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
  await prisma.quoteItem.create({
    data: {
      quoteId,
      alternativeId: loaded.quote.alternatives.find((a) => a.isDefault)?.id,
      kind: "SERVICE",
      serviceType: "servicio",
      quantity: new Prisma.Decimal(qty),
      description,
      unitPriceUsd: new Prisma.Decimal(unitPrice),
      lineTotalUsd: new Prisma.Decimal(unitPrice * qty),
      ivaRate: new Prisma.Decimal(21),
      source: "MANUAL",
      sortOrder: sort,
    },
  });
  revalidatePath(`/admin/quotes/${quoteId}`);
}

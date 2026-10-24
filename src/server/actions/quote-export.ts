"use server";

import { isBlobConfigured, uploadFile } from "@/lib/blob-storage";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadQuoteForUser, requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { quoteIssueCheck } from "@/lib/quote-issue";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { generateAndStoreQuotePdf } from "@/lib/quote-pdf-store";
import { getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { payableLines } from "@/lib/quote-totals";

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
    client: loaded.quote.client?.companyName ?? loaded.quote.clientName ?? undefined,
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
    if (isBlobConfigured()) {
      const { bytes, filename } = await buildQuoteWorkbook(id);
      xlsxBlobUrl = await uploadFile(
        `quotes/${id}/${filename}`,
        Buffer.from(bytes),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    }
  } catch {
    /* snapshot sigue valiendo */
  }

  // La fecha de emisión se guarda antes de armar el PDF: el documento lleva la misma fecha que la base.
  const previous = { status: loaded.quote.status, issuedAt: loaded.quote.issuedAt, issuedById: loaded.quote.issuedById };
  await prisma.quote.update({
    where: { id },
    data: {
      status: "ISSUED",
      issuedAt: new Date(),
      issuedById: loaded.user.id,
      ...(xlsxBlobUrl ? { xlsxBlobUrl } : {}),
    },
  });
  try {
    await generateAndStoreQuotePdf(id, loaded.user.id);
  } catch (error) {
    // Sin PDF no hay emisión: vuelve al estado anterior para no mandar un documento viejo o vacío.
    console.error("issueQuote pdf", error);
    await prisma.quote.update({ where: { id }, data: previous });
    return { ok: false, error: "No se pudo generar el PDF. La cotización no se emitió: probá de nuevo." };
  }
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
  if (!loaded.permissions.fullAccess && !permissionsHave(loaded.permissions, "quotes.submit_review") && !permissionsHave(loaded.permissions, "quotes.edit")) {
    return { ok: false, error: "Sin permiso." };
  }
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
    ["Cliente", loaded.quote.client?.companyName || loaded.quote.clientName || ""],
    ["Referencia", loaded.quote.reference || ""],
    [],
    ["Ambiente", "Cant", "U", "Detalle", "Unitario USD", "Total USD", "IVA %", "Entrega"],
    // Lo que va al documento: sin las filas «dejar afuera».
    ...loaded.quote.items.filter((i) => !i.excluded).map((i) => [
      loaded.quote.itemGroups.find((group) => group.id === i.groupId)?.title || "General",
      Number(i.quantity),
      i.unit,
      i.description,
      Number(i.unitPriceUsd),
      Number(i.lineTotalUsd),
      Number(i.ivaRate),
      i.deliveryKey || "",
    ]),
    [],
    ["Total neto USD", payableLines(loaded.quote.items).reduce((s, i) => s + Number(i.lineTotalUsd), 0)],
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
  await requireQuotePermission("quotes.edit");
  const quoteId = String(formData.get("quoteId") || "");
  const description = String(formData.get("description") || "").trim();
  const qty = Number(formData.get("quantity") || "1") || 1;
  const unitPrice = Number(formData.get("unitPriceUsd") || "0") || 0;
  if (!description) return;
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) return;
  // El servicio usaba 21 fijo e ignoraba el IVA configurado.
  const serviceIva = Number(await getSetting(QUOTE_SETTING_KEYS.defaultIva, "21")) || 21;
  const serviceUnit = (await getSetting(QUOTE_SETTING_KEYS.defaultUnit, "u")).trim() || "u";
  const serviceDelivery = (await getSetting(QUOTE_SETTING_KEYS.defaultDelivery, "")).trim();
  const sort = loaded.quote.items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
  const groupId = String(formData.get("groupId") || "").trim() || null;
  await prisma.quoteItem.create({
    data: {
      quoteId,
      groupId,
      alternativeId: loaded.quote.alternatives.find((a) => a.isDefault)?.id,
      kind: "SERVICE",
      serviceType: "servicio",
      quantity: new Prisma.Decimal(qty),
      description,
      unitPriceUsd: new Prisma.Decimal(unitPrice),
      lineTotalUsd: new Prisma.Decimal(unitPrice * qty),
      unit: serviceUnit,
      deliveryKey: serviceDelivery || null,
      ivaRate: new Prisma.Decimal(serviceIva),
      source: "MANUAL",
      sortOrder: sort,
    },
  });
  revalidatePath(`/admin/quotes/${quoteId}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/auth-helpers";
import { calculatePricesForProducts, isProductVisibleToClient } from "@/lib/pricing";
import { getGlobalMarginPercent } from "@/lib/settings";
import { requireCommercialClientId, resolveCommercialClientId } from "@/lib/client-context";
import { accessoryAckNote, evaluateAccessoryPolicy } from "@/lib/accessory-context";
import { getOrCreateActiveDraft } from "@/lib/draft-request";

function revalidateDraftPaths(requestId: string) {
  revalidatePath("/portal/requests");
  revalidatePath(`/portal/requests/${requestId}`);
  revalidatePath("/portal/products");
  revalidatePath("/portal/cart");
}

async function assertVisible(productId: string, userId: string, role: string) {
  if (role !== "CLIENT") return true;
  const commercialClientId = await resolveCommercialClientId(userId);
  if (!commercialClientId) return false;
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, brandId: true, categoryId: true, distributorId: true, familyId: true },
  });
  if (!p) return false;
  return isProductVisibleToClient(p, commercialClientId);
}

const createSchema = z.object({
  type: z.enum(["QUOTE", "ORDER", "CONSULTATION"]).default("QUOTE"),
  projectDescription: z.string().max(5000).optional().nullable(),
  productId: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(9999).default(1),
  primaryProductId: z.string().optional().nullable(),
  fromWishlistId: z.string().optional().nullable(),
  ackAccessoryWarning: z.coerce.boolean().optional(),
});

export async function createRequestDraft(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = createSchema.safeParse({
    type: formData.get("type") || "QUOTE",
    projectDescription: formData.get("projectDescription") || null,
    productId: formData.get("productId") || null,
    quantity: formData.get("quantity") || 1,
    primaryProductId: formData.get("primaryProductId") || null,
    fromWishlistId: formData.get("fromWishlistId") || null,
    ackAccessoryWarning:
      formData.get("ackAccessoryWarning") === "true" || formData.get("ackAccessoryWarning") === "on",
  });
  if (!parsed.success) return;

  const commercialClientId = await requireCommercialClientId(user.id);
  const forceNew = formData.get("forceNew") === "true";

  if (parsed.data.productId) {
    const visible = await assertVisible(parsed.data.productId, user.id, user.role);
    if (!visible) return;
    const policy = await evaluateAccessoryPolicy({
      productId: parsed.data.productId,
      primaryProductId: parsed.data.primaryProductId || null,
    });
    if (policy.blocked) return;
    if (policy.needsAcknowledgement && !parsed.data.ackAccessoryWarning) return;
  }

  const request = forceNew
    ? await prisma.customerRequest.create({
        data: {
          userId: user.id,
          clientId: commercialClientId,
          type: parsed.data.type,
          status: "DRAFT",
          projectDescription: parsed.data.projectDescription || null,
        },
      })
    : await getOrCreateActiveDraft(user.id, { type: parsed.data.type, migrateLegacyCart: true });

  if (!forceNew && parsed.data.projectDescription) {
    await prisma.customerRequest.update({
      where: { id: request.id },
      data: { projectDescription: parsed.data.projectDescription },
    });
  }

  if (parsed.data.productId) {
    const policy = await evaluateAccessoryPolicy({
      productId: parsed.data.productId,
      primaryProductId: parsed.data.primaryProductId || null,
    });
    const noteParts: string[] = [];
    if (parsed.data.primaryProductId) {
      noteParts.push(`Accesorio asociado a producto principal: ${parsed.data.primaryProductId}`);
    }
    if (policy.needsAcknowledgement && parsed.data.ackAccessoryWarning) {
      noteParts.push(accessoryAckNote(policy.compatiblePrimaries));
    }
    await prisma.customerRequestItem.create({
      data: {
        requestId: request.id,
        productId: parsed.data.productId,
        quantity: parsed.data.quantity,
        userNotes: noteParts.length ? noteParts.join(" | ") : null,
      },
    });
  }

  if (parsed.data.fromWishlistId) {
    const items = await prisma.wishlistItem.findMany({
      where: { wishlistId: parsed.data.fromWishlistId, wishlist: { userId: user.id } },
    });
    for (const item of items) {
      const existing = await prisma.customerRequestItem.findFirst({
        where: { requestId: request.id, productId: item.productId, isAdminSuggestion: false },
      });
      if (existing) {
        await prisma.customerRequestItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + item.quantity },
        });
      } else {
        await prisma.customerRequestItem.create({
          data: {
            requestId: request.id,
            productId: item.productId,
            quantity: item.quantity,
            userNotes: item.notes ?? null,
          },
        });
      }
    }
  }

  revalidateDraftPaths(request.id);
  redirect(`/portal/requests/${request.id}`);
}

type RequestItemResult = {
  ok: boolean;
  error?: string;
  requestId?: string;
  requiresAcknowledgement?: boolean;
  warningMessage?: string;
  compatiblePrimaries?: { id: string; name: string }[];
};

/** Crear solicitud nueva con un producto (desde ficha / formulario cliente). */
export async function createRequestWithProduct(formData: FormData): Promise<RequestItemResult> {
  const user = await requireUser();
  const parsed = createSchema.safeParse({
    type: formData.get("type") || "QUOTE",
    projectDescription: formData.get("projectDescription") || null,
    productId: formData.get("productId") || null,
    quantity: formData.get("quantity") || 1,
    primaryProductId: formData.get("primaryProductId") || null,
    ackAccessoryWarning:
      formData.get("ackAccessoryWarning") === "true" || formData.get("ackAccessoryWarning") === "on",
  });
  if (!parsed.success || !parsed.data.productId) {
    return { ok: false, error: "Datos inválidos." };
  }

  const commercialClientId = await requireCommercialClientId(user.id);
  const visible = await assertVisible(parsed.data.productId, user.id, user.role);
  if (!visible) return { ok: false, error: "Producto no disponible." };

  const policy = await evaluateAccessoryPolicy({
    productId: parsed.data.productId,
    primaryProductId: parsed.data.primaryProductId || null,
  });
  if (policy.blocked) return { ok: false, error: policy.blockedMessage };
  if (policy.needsAcknowledgement && !parsed.data.ackAccessoryWarning) {
    return {
      ok: false,
      requiresAcknowledgement: true,
      warningMessage: policy.warningMessage,
      compatiblePrimaries: policy.compatiblePrimaries,
    };
  }

  const request = await prisma.customerRequest.create({
    data: {
      userId: user.id,
      clientId: commercialClientId,
      type: parsed.data.type,
      status: "DRAFT",
      projectDescription: parsed.data.projectDescription || null,
    },
  });

  const noteParts: string[] = [];
  if (parsed.data.primaryProductId) {
    noteParts.push(`Accesorio asociado a producto principal: ${parsed.data.primaryProductId}`);
  }
  if (policy.needsAcknowledgement && parsed.data.ackAccessoryWarning) {
    noteParts.push(accessoryAckNote(policy.compatiblePrimaries));
  }

  await prisma.customerRequestItem.create({
    data: {
      requestId: request.id,
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      userNotes: noteParts.length ? noteParts.join(" | ") : null,
    },
  });

  revalidatePath("/portal/requests");
  return { ok: true, requestId: request.id };
}

const addItemSchema = z.object({
  requestId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(9999).default(1),
  userNotes: z.string().max(1000).optional().nullable(),
  primaryProductId: z.string().optional().nullable(),
  ackAccessoryWarning: z.coerce.boolean().optional(),
});

export async function addRequestItem(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  requiresAcknowledgement?: boolean;
  warningMessage?: string;
  compatiblePrimaries?: { id: string; name: string }[];
}> {
  const user = await requireUser();
  const parsed = addItemSchema.safeParse({
    requestId: formData.get("requestId"),
    productId: formData.get("productId"),
    quantity: formData.get("quantity") || 1,
    userNotes: formData.get("userNotes") || null,
    primaryProductId: formData.get("primaryProductId") || null,
    ackAccessoryWarning:
      formData.get("ackAccessoryWarning") === "true" || formData.get("ackAccessoryWarning") === "on",
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const request = await prisma.customerRequest.findFirst({
    where: { id: parsed.data.requestId, userId: user.id },
  });
  if (!request || request.status !== "DRAFT") return { ok: false, error: "Solicitud no editable" };

  const visible = await assertVisible(parsed.data.productId, user.id, user.role);
  if (!visible) return { ok: false, error: "Producto no disponible." };

  const policy = await evaluateAccessoryPolicy({
    productId: parsed.data.productId,
    requestId: request.id,
    primaryProductId: parsed.data.primaryProductId || null,
  });
  if (policy.blocked) return { ok: false, error: policy.blockedMessage };
  if (policy.needsAcknowledgement && !parsed.data.ackAccessoryWarning) {
    return {
      ok: false,
      requiresAcknowledgement: true,
      warningMessage: policy.warningMessage,
      compatiblePrimaries: policy.compatiblePrimaries,
    };
  }

  const noteParts: string[] = [];
  if (parsed.data.userNotes) noteParts.push(parsed.data.userNotes);
  if (parsed.data.primaryProductId) {
    noteParts.push(`Accesorio asociado a producto principal: ${parsed.data.primaryProductId}`);
  }
  if (policy.needsAcknowledgement && parsed.data.ackAccessoryWarning) {
    noteParts.push(accessoryAckNote(policy.compatiblePrimaries));
  }

  const existingItem = await prisma.customerRequestItem.findFirst({
    where: {
      requestId: request.id,
      productId: parsed.data.productId,
      isAdminSuggestion: false,
    },
  });

  if (existingItem) {
    await prisma.customerRequestItem.update({
      where: { id: existingItem.id },
      data: {
        quantity: existingItem.quantity + parsed.data.quantity,
        userNotes: noteParts.length
          ? [existingItem.userNotes, ...noteParts].filter(Boolean).join(" | ")
          : existingItem.userNotes,
      },
    });
  } else {
    await prisma.customerRequestItem.create({
      data: {
        requestId: request.id,
        productId: parsed.data.productId,
        quantity: parsed.data.quantity,
        userNotes: noteParts.length ? noteParts.join(" | ") : null,
      },
    });
  }

  await prisma.customerRequest.update({ where: { id: request.id }, data: { updatedAt: new Date() } });
  revalidateDraftPaths(request.id);
  return { ok: true };
}

const draftAddSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(9999).default(1),
  userNotes: z.string().max(1000).optional().nullable(),
  primaryProductId: z.string().optional().nullable(),
  ackAccessoryWarning: z.coerce.boolean().optional(),
});

/** Agrega un producto a la solicitud en borrador activa (flujo unificado, reemplaza «carrito»). */
export async function addToDraftRequest(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  requiresAcknowledgement?: boolean;
  warningMessage?: string;
  compatiblePrimaries?: { id: string; name: string }[];
  requestId?: string;
  detail?: {
    productName: string;
    addedQty: number;
    itemQty: number;
    itemsTotal: number;
    unitsTotal: number;
  };
}> {
  const user = await requireUser();
  const parsed = draftAddSchema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity") || 1,
    userNotes: formData.get("userNotes") || null,
    primaryProductId: formData.get("primaryProductId") || null,
    ackAccessoryWarning:
      formData.get("ackAccessoryWarning") === "true" || formData.get("ackAccessoryWarning") === "on",
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const visible = await assertVisible(parsed.data.productId, user.id, user.role);
  if (!visible) return { ok: false, error: "Producto no disponible para tu cuenta." };

  const product = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
    select: { normalizedName: true },
  });
  if (!product) return { ok: false, error: "Producto no encontrado." };

  const draft = await getOrCreateActiveDraft(user.id, { migrateLegacyCart: true });

  const policy = await evaluateAccessoryPolicy({
    productId: parsed.data.productId,
    requestId: draft.id,
    primaryProductId: parsed.data.primaryProductId || null,
  });
  if (policy.blocked) return { ok: false, error: policy.blockedMessage };
  if (policy.needsAcknowledgement && !parsed.data.ackAccessoryWarning) {
    return {
      ok: false,
      requiresAcknowledgement: true,
      warningMessage: policy.warningMessage,
      compatiblePrimaries: policy.compatiblePrimaries,
      requestId: draft.id,
    };
  }

  const noteParts: string[] = [];
  if (parsed.data.userNotes) noteParts.push(parsed.data.userNotes);
  if (parsed.data.primaryProductId) {
    noteParts.push(`Accesorio asociado a producto principal: ${parsed.data.primaryProductId}`);
  }
  if (policy.needsAcknowledgement && parsed.data.ackAccessoryWarning) {
    noteParts.push(accessoryAckNote(policy.compatiblePrimaries));
  }

  const existingItem = await prisma.customerRequestItem.findFirst({
    where: { requestId: draft.id, productId: parsed.data.productId, isAdminSuggestion: false },
  });

  let itemQty = parsed.data.quantity;
  if (existingItem) {
    itemQty = existingItem.quantity + parsed.data.quantity;
    await prisma.customerRequestItem.update({
      where: { id: existingItem.id },
      data: {
        quantity: itemQty,
        userNotes: noteParts.length
          ? [existingItem.userNotes, ...noteParts].filter(Boolean).join(" | ")
          : existingItem.userNotes,
      },
    });
  } else {
    await prisma.customerRequestItem.create({
      data: {
        requestId: draft.id,
        productId: parsed.data.productId,
        quantity: parsed.data.quantity,
        userNotes: noteParts.length ? noteParts.join(" | ") : null,
      },
    });
  }

  await prisma.customerRequest.update({ where: { id: draft.id }, data: { updatedAt: new Date() } });

  const items = await prisma.customerRequestItem.findMany({
    where: { requestId: draft.id, isAdminSuggestion: false },
    select: { quantity: true },
  });

  revalidateDraftPaths(draft.id);

  return {
    ok: true,
    requestId: draft.id,
    detail: {
      productName: product.normalizedName,
      addedQty: parsed.data.quantity,
      itemQty,
      itemsTotal: items.length,
      unitsTotal: items.reduce((a, i) => a + i.quantity, 0),
    },
  };
}

/**
 * Agrega un conjunto de productos al borrador activo en una sola llamada.
 *
 * Pensado para el "armado" en la ficha del producto principal: el usuario
 * elige cantidad del producto principal + qué accesorios sumar, y al final
 * un solo submit los lleva todos al draft.
 *
 * Cada item se upserta (suma cantidades si ya estaba). Productos sin
 * visibilidad para el usuario se omiten silenciosamente.
 */
export async function addItemsToDraftBundle(input: {
  items: { productId: string; quantity: number; userNotes?: string | null }[];
  primaryProductId?: string | null;
}): Promise<{
  ok: boolean;
  error?: string;
  requestId?: string;
  added: number;
  itemsTotal: number;
  unitsTotal: number;
}> {
  const user = await requireUser();
  if (!input.items || input.items.length === 0) {
    return { ok: false, error: "Sin items para agregar.", added: 0, itemsTotal: 0, unitsTotal: 0 };
  }
  // Sanitize: dropear duplicados (suma local) y cantidades inválidas
  const byProduct = new Map<string, { quantity: number; userNotes: string | null }>();
  for (const it of input.items) {
    if (!it.productId || !Number.isFinite(it.quantity) || it.quantity <= 0) continue;
    const prev = byProduct.get(it.productId);
    if (prev) {
      prev.quantity += it.quantity;
      if (it.userNotes) {
        prev.userNotes = [prev.userNotes, it.userNotes].filter(Boolean).join(" | ");
      }
    } else {
      byProduct.set(it.productId, {
        quantity: it.quantity,
        userNotes: it.userNotes ?? null,
      });
    }
  }
  if (byProduct.size === 0) {
    return { ok: false, error: "Sin items válidos.", added: 0, itemsTotal: 0, unitsTotal: 0 };
  }

  const draft = await getOrCreateActiveDraft(user.id, { migrateLegacyCart: true });
  let added = 0;

  for (const [productId, info] of byProduct) {
    const visible = await assertVisible(productId, user.id, user.role);
    if (!visible) continue;

    const noteParts: string[] = [];
    if (info.userNotes) noteParts.push(info.userNotes);
    if (input.primaryProductId && productId !== input.primaryProductId) {
      noteParts.push(`Accesorio asociado a producto principal: ${input.primaryProductId}`);
    }

    const existing = await prisma.customerRequestItem.findFirst({
      where: { requestId: draft.id, productId, isAdminSuggestion: false },
    });

    if (existing) {
      await prisma.customerRequestItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + info.quantity,
          userNotes: noteParts.length
            ? [existing.userNotes, ...noteParts].filter(Boolean).join(" | ")
            : existing.userNotes,
        },
      });
    } else {
      await prisma.customerRequestItem.create({
        data: {
          requestId: draft.id,
          productId,
          quantity: info.quantity,
          userNotes: noteParts.length ? noteParts.join(" | ") : null,
        },
      });
    }
    added++;
  }

  await prisma.customerRequest.update({
    where: { id: draft.id },
    data: { updatedAt: new Date() },
  });

  const items = await prisma.customerRequestItem.findMany({
    where: { requestId: draft.id, isAdminSuggestion: false },
    select: { quantity: true },
  });

  revalidateDraftPaths(draft.id);

  return {
    ok: true,
    requestId: draft.id,
    added,
    itemsTotal: items.length,
    unitsTotal: items.reduce((a, i) => a + i.quantity, 0),
  };
}

export async function bulkAddToDraftSimple(
  productIds: string[]
): Promise<{ ok: boolean; added: number; error?: string }> {
  const user = await requireUser();
  if (!productIds.length) return { ok: false, added: 0, error: "Sin productos seleccionados." };

  const draft = await getOrCreateActiveDraft(user.id, { migrateLegacyCart: true });

  const existing = await prisma.customerRequestItem.findMany({
    where: { requestId: draft.id, productId: { in: productIds }, isAdminSuggestion: false },
    select: { productId: true },
  });
  const existingSet = new Set(existing.map((e) => e.productId));
  const toAdd = productIds.filter((id) => !existingSet.has(id));

  if (toAdd.length > 0) {
    await prisma.customerRequestItem.createMany({
      data: toAdd.map((productId) => ({ requestId: draft.id, productId, quantity: 1 })),
      skipDuplicates: true,
    });
    await prisma.customerRequest.update({ where: { id: draft.id }, data: { updatedAt: new Date() } });
  }

  revalidateDraftPaths(draft.id);
  return { ok: true, added: toAdd.length };
}

export async function updateDraftItemQuantityForm(formData: FormData): Promise<void> {
  await updateDraftItemQuantity(formData);
}

export async function updateDraftItemQuantity(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const itemId = String(formData.get("itemId") || "");
  const quantity = Number(formData.get("quantity") || 1);
  if (!itemId || quantity < 1) return { ok: false, error: "Datos inválidos." };

  const item = await prisma.customerRequestItem.findFirst({
    where: { id: itemId, request: { userId: user.id, status: "DRAFT" } },
  });
  if (!item) return { ok: false, error: "Ítem no encontrado o solicitud ya enviada." };

  await prisma.customerRequestItem.update({ where: { id: itemId }, data: { quantity } });
  await prisma.customerRequest.update({ where: { id: item.requestId }, data: { updatedAt: new Date() } });
  revalidateDraftPaths(item.requestId);
  return { ok: true };
}

const sendSchema = z.object({
  requestId: z.string().min(1),
  projectDescription: z.string().max(5000).optional().nullable(),
});

export async function sendRequest(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = sendSchema.safeParse({
    requestId: formData.get("requestId"),
    projectDescription: formData.get("projectDescription") || null,
  });
  if (!parsed.success) return;

  const request = await prisma.customerRequest.findFirst({
    where: { id: parsed.data.requestId, userId: user.id },
    include: { items: true },
  });
  if (!request || request.status !== "DRAFT") return;
  if (request.items.length === 0) return;

  await prisma.customerRequest.update({
    where: { id: request.id },
    data: {
      status: "SENT",
      projectDescription: parsed.data.projectDescription ?? request.projectDescription,
    },
  });
  revalidatePath("/portal/requests");
  revalidatePath(`/portal/requests/${request.id}`);
  revalidatePath("/admin/requests");
}

const messageSchema = z.object({
  requestId: z.string().min(1),
  message: z.string().min(1).max(4000),
});

export async function postRequestMessage(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = messageSchema.safeParse({
    requestId: formData.get("requestId"),
    message: formData.get("message"),
  });
  if (!parsed.success) return;

  const isStaff = user.role !== "CLIENT";
  const request = await prisma.customerRequest.findFirst({
    where: isStaff
      ? { id: parsed.data.requestId }
      : { id: parsed.data.requestId, userId: user.id },
  });
  if (!request) return;

  await prisma.requestMessage.create({
    data: {
      requestId: request.id,
      senderId: user.id,
      message: parsed.data.message,
    },
  });

  revalidatePath(`/portal/requests/${request.id}`);
  revalidatePath(`/admin/requests/${request.id}`);
}

/* ------------------------------------------------------------------ *
 * Acciones del panel admin
 *
 * Todas devuelven `{ ok, error? }` para que la UI pueda mostrar un toast
 * de confirmación o de error en vez de recargar en silencio.
 * ------------------------------------------------------------------ */

type ActionResult = { ok: boolean; error?: string };

const ADMIN_STATUSES = ["IN_REVIEW", "ANSWERED", "CONFIRMED", "REJECTED", "CLOSED"] as const;

function revalidateRequest(requestId: string) {
  revalidatePath("/admin/requests");
  revalidatePath(`/admin/requests/${requestId}`);
  revalidatePath("/portal/requests");
  revalidatePath(`/portal/requests/${requestId}`);
}

/** Cliente comercial al que hay que facturarle, para calcular precios como los ve él. */
async function commercialClientIdForRequest(request: { clientId: string | null; userId: string }) {
  return request.clientId ?? (await resolveCommercialClientId(request.userId));
}

const adminRespondSchema = z.object({
  requestId: z.string().min(1),
  status: z.enum(ADMIN_STATUSES),
  adminResponse: z.string().max(10000).optional().nullable(),
});

/**
 * Guarda la respuesta visible para el cliente y mueve el estado.
 * El texto se publica además como mensaje en la conversación.
 */
export async function adminRespondRequest(input: {
  requestId: string;
  status: string;
  adminResponse?: string | null;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = adminRespondSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisá el estado y la respuesta antes de guardar." };

  const request = await prisma.customerRequest.findUnique({
    where: { id: parsed.data.requestId },
    select: { id: true, status: true },
  });
  if (!request) return { ok: false, error: "La solicitud ya no existe." };

  const responseText = parsed.data.adminResponse?.trim() || "";

  await prisma.customerRequest.update({
    where: { id: request.id },
    data: {
      status: parsed.data.status,
      ...(responseText ? { adminResponse: responseText } : {}),
    },
  });

  if (responseText) {
    await prisma.requestMessage.create({
      data: { requestId: request.id, senderId: admin.id, message: responseText },
    });
  }

  revalidateRequest(request.id);
  return { ok: true };
}

/** Cambio de estado suelto, sin escribir respuesta (botones de acción rápida). */
export async function adminSetRequestStatus(input: { requestId: string; status: string }): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z
    .object({ requestId: z.string().min(1), status: z.enum(ADMIN_STATUSES) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Estado inválido." };

  const request = await prisma.customerRequest.findUnique({
    where: { id: parsed.data.requestId },
    select: { id: true },
  });
  if (!request) return { ok: false, error: "La solicitud ya no existe." };

  await prisma.customerRequest.update({
    where: { id: request.id },
    data: { status: parsed.data.status },
  });

  revalidateRequest(request.id);
  return { ok: true };
}

/** Mensaje en la conversación, desde el panel admin. */
export async function adminSendRequestMessage(input: {
  requestId: string;
  message: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "El mensaje no puede estar vacío." };

  const request = await prisma.customerRequest.findUnique({
    where: { id: parsed.data.requestId },
    select: { id: true },
  });
  if (!request) return { ok: false, error: "La solicitud ya no existe." };

  await prisma.requestMessage.create({
    data: { requestId: request.id, senderId: admin.id, message: parsed.data.message },
  });

  revalidateRequest(request.id);
  return { ok: true };
}

/**
 * Buscador de productos para sugerir, con el precio que vería este cliente.
 * Reemplaza al `<select>` con cientos de opciones precargadas.
 */
export async function adminSearchProductsForRequest(input: {
  requestId: string;
  query: string;
}): Promise<{
  ok: boolean;
  error?: string;
  products: Array<{ id: string; name: string; sku: string | null; brand: string | null; priceUsd: number | null }>;
}> {
  await requireAdmin();
  const query = (input.query || "").trim();
  if (query.length < 2) return { ok: true, products: [] };

  const request = await prisma.customerRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, userId: true, clientId: true },
  });
  if (!request) return { ok: false, error: "La solicitud ya no existe.", products: [] };

  const found = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { normalizedName: { contains: query, mode: "insensitive" } },
        { originalName: { contains: query, mode: "insensitive" } },
        { internalSku: { contains: query, mode: "insensitive" } },
        { supplierSku: { contains: query, mode: "insensitive" } },
        { modelNumber: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { normalizedName: "asc" },
    take: 25,
    select: {
      id: true,
      normalizedName: true,
      internalSku: true,
      baseCostUsd: true,
      brandId: true,
      distributorId: true,
      categoryId: true,
      familyId: true,
      discountPercent: true,
      tariffDutyPercent: true,
      brand: { select: { name: true } },
    },
  });

  const clientId = await commercialClientIdForRequest(request);
  const globalMargin = await getGlobalMarginPercent();
  const prices = await calculatePricesForProducts(
    found.map((p) => ({
      productId: p.id,
      baseCostUsd: Number(p.baseCostUsd),
      brandId: p.brandId,
      distributorId: p.distributorId,
      categoryId: p.categoryId,
      familyId: p.familyId,
      productDiscountPercent: p.discountPercent ? Number(p.discountPercent) : null,
      tariffDutyPercent: p.tariffDutyPercent ? Number(p.tariffDutyPercent) : null,
    })),
    clientId,
    globalMargin
  );

  return {
    ok: true,
    products: found.map((p) => ({
      id: p.id,
      name: p.normalizedName,
      sku: p.internalSku,
      brand: p.brand?.name ?? null,
      priceUsd: prices.get(p.id)?.finalPriceUsd ?? null,
    })),
  };
}

/**
 * Sugerencia admin → cliente: agrega un producto marcado como propuesta del
 * equipo (no es lo que pidió el cliente). El cliente lo ve destacado.
 */
const adminSuggestionSchema = z.object({
  requestId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(9999).default(1),
  adminNotes: z.string().max(2000).optional().nullable(),
  replacesItemId: z.string().optional().nullable(),
  announce: z.boolean().default(true),
});

export async function addAdminSuggestion(input: {
  requestId: string;
  productId: string;
  quantity?: number | string;
  adminNotes?: string | null;
  replacesItemId?: string | null;
  announce?: boolean;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = adminSuggestionSchema.safeParse({
    ...input,
    quantity: input.quantity ?? 1,
    announce: input.announce ?? true,
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const request = await prisma.customerRequest.findUnique({ where: { id: parsed.data.requestId } });
  if (!request) return { ok: false, error: "La solicitud ya no existe." };

  const product = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
    select: { id: true, normalizedName: true },
  });
  if (!product) return { ok: false, error: "El producto no existe o fue dado de baja." };

  const replaced = parsed.data.replacesItemId
    ? await prisma.customerRequestItem.findUnique({
        where: { id: parsed.data.replacesItemId },
        select: { productId: true, product: { select: { normalizedName: true } } },
      })
    : null;

  await prisma.customerRequestItem.create({
    data: {
      requestId: request.id,
      productId: product.id,
      quantity: parsed.data.quantity,
      isAdminSuggestion: true,
      adminNotes: parsed.data.adminNotes?.trim() || null,
      adminAlternativeProductId: replaced?.productId ?? null,
    },
  });

  if (parsed.data.announce) {
    const lines = [
      replaced
        ? `Te propongo reemplazar ${replaced.product.normalizedName} por ${parsed.data.quantity} × ${product.normalizedName}.`
        : `Te sumo una sugerencia: ${parsed.data.quantity} × ${product.normalizedName}.`,
    ];
    if (parsed.data.adminNotes?.trim()) lines.push(parsed.data.adminNotes.trim());
    await prisma.requestMessage.create({
      data: { requestId: request.id, senderId: admin.id, message: lines.join("\n") },
    });
  }

  revalidateRequest(request.id);
  return { ok: true };
}

/** Ajuste de cantidad de un ítem desde el panel admin. */
export async function adminUpdateRequestItem(input: {
  itemId: string;
  quantity: number | string;
}): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z
    .object({ itemId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(9999) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "La cantidad debe ser un número entre 1 y 9999." };

  const item = await prisma.customerRequestItem.findUnique({
    where: { id: parsed.data.itemId },
    select: { id: true, requestId: true },
  });
  if (!item) return { ok: false, error: "El ítem ya no existe." };

  await prisma.customerRequestItem.update({
    where: { id: item.id },
    data: { quantity: parsed.data.quantity },
  });

  revalidateRequest(item.requestId);
  return { ok: true };
}

export async function adminRemoveRequestItem(input: { itemId: string }): Promise<ActionResult> {
  await requireAdmin();
  const item = await prisma.customerRequestItem.findUnique({
    where: { id: input.itemId },
    select: { id: true, requestId: true },
  });
  if (!item) return { ok: false, error: "El ítem ya no existe." };

  await prisma.customerRequestItem.delete({ where: { id: item.id } });
  revalidateRequest(item.requestId);
  return { ok: true };
}

export async function removeRequestItemForm(formData: FormData): Promise<void> {
  await removeRequestItem(formData);
}

export async function removeRequestItem(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const itemId = String(formData.get("itemId") || "");
  if (!itemId) return { ok: false, error: "ID inválido" };
  const item = await prisma.customerRequestItem.findUnique({
    where: { id: itemId },
    include: { request: true },
  });
  if (!item) return { ok: false, error: "Ítem no encontrado" };
  const isStaff = user.role !== "CLIENT";
  if (!isStaff && item.request.userId !== user.id) return { ok: false, error: "No autorizado" };
  await prisma.customerRequestItem.delete({ where: { id: itemId } });
  revalidatePath(`/admin/requests/${item.requestId}`);
  revalidateDraftPaths(item.requestId);
  return { ok: true };
}

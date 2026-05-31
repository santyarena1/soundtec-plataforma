"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/auth-helpers";
import { isProductVisibleToClient } from "@/lib/pricing";
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

const adminRespondSchema = z.object({
  requestId: z.string().min(1),
  status: z.enum(["IN_REVIEW", "ANSWERED", "CONFIRMED", "REJECTED", "CLOSED"]),
  adminResponse: z.string().max(10000).optional().nullable(),
});

export async function adminUpdateRequest(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = adminRespondSchema.safeParse({
    requestId: formData.get("requestId"),
    status: formData.get("status") || "IN_REVIEW",
    adminResponse: formData.get("adminResponse") || null,
  });
  if (!parsed.success) return;

  const responseText = parsed.data.adminResponse?.trim() || "";
  await prisma.customerRequest.update({
    where: { id: parsed.data.requestId },
    data: {
      status: parsed.data.status,
      ...(responseText ? { adminResponse: responseText } : {}),
    },
  });
  if (responseText) {
    await prisma.requestMessage.create({
      data: {
        requestId: parsed.data.requestId,
        senderId: admin.id,
        message: responseText,
      },
    });
  }
  revalidatePath(`/admin/requests/${parsed.data.requestId}`);
  revalidatePath(`/portal/requests/${parsed.data.requestId}`);
}

/**
 * Sugerencia admin → cliente: agrega un producto a la solicitud marcado como
 * sugerencia del admin (no es lo que pidió el cliente). El cliente lo verá
 * destacado como "Sugerencia del equipo Soundtec".
 */
const adminSuggestionSchema = z.object({
  requestId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(9999).default(1),
  adminNotes: z.string().max(2000).optional().nullable(),
  replacesItemId: z.string().optional().nullable(),
});

export async function addAdminSuggestion(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  const parsed = adminSuggestionSchema.safeParse({
    requestId: formData.get("requestId"),
    productId: formData.get("productId"),
    quantity: formData.get("quantity") || 1,
    adminNotes: formData.get("adminNotes") || null,
    replacesItemId: formData.get("replacesItemId") || null,
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const request = await prisma.customerRequest.findUnique({ where: { id: parsed.data.requestId } });
  if (!request) return { ok: false, error: "Solicitud no encontrada" };

  const product = await prisma.product.findUnique({ where: { id: parsed.data.productId } });
  if (!product) return { ok: false, error: "Producto no encontrado" };

  await prisma.customerRequestItem.create({
    data: {
      requestId: parsed.data.requestId,
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      isAdminSuggestion: true,
      adminNotes: parsed.data.adminNotes || null,
      adminAlternativeProductId: parsed.data.replacesItemId
        ? (
            await prisma.customerRequestItem.findUnique({
              where: { id: parsed.data.replacesItemId },
              select: { productId: true },
            })
          )?.productId ?? null
        : null,
    },
  });

  await prisma.requestMessage.create({
    data: {
      requestId: parsed.data.requestId,
      senderId: admin.id,
      message: `Sugerencia: agregar ${parsed.data.quantity} × ${product.normalizedName}${parsed.data.adminNotes ? `\nNota: ${parsed.data.adminNotes}` : ""}`,
    },
  });

  revalidatePath(`/admin/requests/${parsed.data.requestId}`);
  revalidatePath(`/portal/requests/${parsed.data.requestId}`);
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

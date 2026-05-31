"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const deviceSchema = z.object({
  modelNumber: z.string().min(1).max(200),
  productName: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  subCategory: z.string().max(100).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  protocol: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  sourceUrl: z.string().url().optional().nullable().or(z.literal("")),
  isActive: z.coerce.boolean().optional(),
});

export async function upsertCrestronDevice(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = deviceSchema.safeParse({
    modelNumber: formData.get("modelNumber"),
    productName: formData.get("productName"),
    category: formData.get("category"),
    subCategory: formData.get("subCategory") || null,
    brand: formData.get("brand") || null,
    protocol: formData.get("protocol") || null,
    notes: formData.get("notes") || null,
    sourceUrl: formData.get("sourceUrl") || null,
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) return;

  const data = {
    modelNumber: parsed.data.modelNumber,
    productName: parsed.data.productName,
    category: parsed.data.category,
    subCategory: parsed.data.subCategory || null,
    brand: parsed.data.brand || null,
    protocol: parsed.data.protocol || null,
    notes: parsed.data.notes || null,
    sourceUrl: parsed.data.sourceUrl || null,
    isActive: parsed.data.isActive ?? true,
  };

  if (id) {
    await db.crestronHomeDevice.update({ where: { id }, data });
  } else {
    await db.crestronHomeDevice.create({ data });
  }
  revalidatePath("/admin/crestron-home");
}

export async function deleteCrestronDevice(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id")?.toString();
  if (!id) return;
  await db.crestronHomeDevice.delete({ where: { id } });
  revalidatePath("/admin/crestron-home");
}

export async function matchCrestronProducts(): Promise<{ ok: boolean; matched: number; total: number }> {
  await requireAdmin();

  const devices: { modelNumber: string }[] = await db.crestronHomeDevice.findMany({
    where: { isActive: true },
    select: { modelNumber: true },
  });

  const modelSet = new Set(devices.map((d) => d.modelNumber.trim().toUpperCase()));

  // Compare against internalSku, supplierSku AND normalizedName (contains model number)
  const products = await prisma.product.findMany({
    select: { id: true, internalSku: true, supplierSku: true, normalizedName: true },
  });

  const toMark = products
    .filter((p) => {
      const sku = p.internalSku?.trim().toUpperCase() ?? "";
      const ssku = p.supplierSku?.trim().toUpperCase() ?? "";
      const name = p.normalizedName.trim().toUpperCase();
      // Direct SKU match
      if (sku && modelSet.has(sku)) return true;
      if (ssku && modelSet.has(ssku)) return true;
      // Model number appears anywhere in the product name
      for (const model of modelSet) {
        if (name.includes(model)) return true;
      }
      return false;
    })
    .map((p) => p.id);

  await prisma.product.updateMany({ data: { isCrestronHomeCompatible: false } });
  if (toMark.length > 0) {
    await prisma.product.updateMany({
      where: { id: { in: toMark } },
      data: { isCrestronHomeCompatible: true },
    });
  }

  revalidatePath("/admin/crestron-home");
  revalidatePath("/admin/products");
  return { ok: true, matched: toMark.length, total: modelSet.size };
}

const CRESTRON_SEED_DATA = [
  // Audio
  { modelNumber: "C2N-AMP-6X100", productName: "6x100W Amplifier", category: "Audio" },
  { modelNumber: "C2N-AMP-4X100", productName: "4x100W Amplifier", category: "Audio" },
  { modelNumber: "C2NI-AMP-6X100", productName: "6x100W Amplifier (infiNET)", category: "Audio" },
  { modelNumber: "C2NI-AMP-4X100", productName: "4x100W Amplifier (infiNET)", category: "Audio" },
  { modelNumber: "CNAMPX-16X60", productName: "16x60W Amplifier", category: "Audio" },
  { modelNumber: "CNAMPX-12X60", productName: "12x60W Amplifier", category: "Audio" },
  { modelNumber: "DM-NAX-16AIN", productName: "16-Channel Audio Input", category: "Audio" },
  { modelNumber: "DM-NAX-4ZSA-50", productName: "4-Zone 50W Amplifier", category: "Audio" },
  { modelNumber: "DM-NAX-8ZSA", productName: "8-Zone Amplifier", category: "Audio" },
  { modelNumber: "DM-NAX-4ZSP", productName: "4-Zone Paging Amplifier", category: "Audio" },
  { modelNumber: "DM-NAX-AMP-X300", productName: "300W Amplifier", category: "Audio" },
  { modelNumber: "SWAMP-24X8", productName: "24x8 Audio Matrix", category: "Audio" },
  { modelNumber: "SWAMPE-8", productName: "8-Zone Audio Matrix (Ethernet)", category: "Audio" },
  { modelNumber: "SWAMPE-4", productName: "4-Zone Audio Matrix (Ethernet)", category: "Audio" },
  { modelNumber: "SWAMPI-24X8", productName: "24x8 Audio Matrix (infiNET)", category: "Audio" },
  { modelNumber: "SWAMPIE-8", productName: "8-Zone Audio Matrix (infiNET Ethernet)", category: "Audio" },
  { modelNumber: "SWAMPIE-4", productName: "4-Zone Audio Matrix (infiNET Ethernet)", category: "Audio" },
  { modelNumber: "SWE-8", productName: "8-Zone Ethernet Audio Matrix", category: "Audio" },
  { modelNumber: "DM-NAX-BTIO-1G", productName: "Bluetooth I/O", category: "Audio" },
  { modelNumber: "DM-NAX-BTIO-100-1G", productName: "Bluetooth I/O (100m)", category: "Audio" },
  { modelNumber: "DM-NAX-2XLRI-1G", productName: "2-Channel XLR Input", category: "Audio" },
  { modelNumber: "DM-NAX-AUD-USB", productName: "USB Audio Interface", category: "Audio" },
  { modelNumber: "DM-NAX-AUD-IO", productName: "Audio I/O Module", category: "Audio" },
  { modelNumber: "HD-XSP", productName: "HD XiO Speaker", category: "Audio" },
  { modelNumber: "HD-XSPA", productName: "HD XiO Speaker Amplifier", category: "Audio" },
  { modelNumber: "HDI-XSPA", productName: "HD XiO Speaker Amplifier (infiNET)", category: "Audio" },
  { modelNumber: "MMS-1E", productName: "Media Management System 1E", category: "Audio" },
  { modelNumber: "MMS-3E", productName: "Media Management System 3E", category: "Audio" },
  { modelNumber: "MMS-5E", productName: "Media Management System 5E", category: "Audio" },
  { modelNumber: "MMS-2A", productName: "Media Management System 2A", category: "Audio" },
  { modelNumber: "MMS-5A", productName: "Media Management System 5A", category: "Audio" },
  { modelNumber: "M3", productName: "Streaming Music Server M3", category: "Audio" },
  { modelNumber: "M5-PRO-1TB", productName: "Streaming Music Server M5 Pro", category: "Audio" },
  // Video
  { modelNumber: "DM-MD6x6", productName: "DM 6x6 Matrix", category: "Video" },
  { modelNumber: "DM-MD8X8", productName: "DM 8x8 Matrix", category: "Video" },
  { modelNumber: "DM-MD16X16", productName: "DM 16x16 Matrix", category: "Video" },
  { modelNumber: "DM-MD32X32", productName: "DM 32x32 Matrix", category: "Video" },
  { modelNumber: "DM-NVX-384", productName: "DM NVX 384 4K AV Encoder/Decoder", category: "Video" },
  { modelNumber: "DM-NVX-363", productName: "DM NVX 363 4K AV Encoder/Decoder", category: "Video" },
  { modelNumber: "DM-NVX-360", productName: "DM NVX 360 4K AV Encoder/Decoder", category: "Video" },
  { modelNumber: "DM-NVX-352", productName: "DM NVX 352 4K AV Encoder/Decoder", category: "Video" },
  { modelNumber: "DM-NVX-351", productName: "DM NVX 351 4K AV Encoder/Decoder", category: "Video" },
  { modelNumber: "DM-NVX-350", productName: "DM NVX 350 4K AV Encoder/Decoder", category: "Video" },
  { modelNumber: "DM-NVX-D200", productName: "DM NVX D200 4K AV Decoder", category: "Video" },
  { modelNumber: "DM-NVX-E760", productName: "DM NVX E760 4K AV Encoder", category: "Video" },
  { modelNumber: "DM-NVX-E30", productName: "DM NVX E30 4K AV Encoder", category: "Video" },
  { modelNumber: "DM-NVX-E20", productName: "DM NVX E20 4K AV Encoder", category: "Video" },
  { modelNumber: "DM-NVX-E10", productName: "DM NVX E10 4K AV Encoder", category: "Video" },
  { modelNumber: "DM-NVX-385", productName: "DM NVX 385 4K AV Encoder/Decoder", category: "Video" },
  { modelNumber: "DM-RMC-200-C", productName: "DM Room Controller 200", category: "Video" },
  { modelNumber: "DM-RMC-4K-100-C", productName: "DM Room Controller 4K-100", category: "Video" },
  { modelNumber: "DM-RMC-4KZ-100-C", productName: "DM Room Controller 4KZ-100", category: "Video" },
  { modelNumber: "DM-TX-201-C", productName: "DM Transmitter 201", category: "Video" },
  { modelNumber: "DM-TX-401-C", productName: "DM Transmitter 401", category: "Video" },
  { modelNumber: "DM-TX-4K-100-C-1G", productName: "DM Transmitter 4K-100", category: "Video" },
  { modelNumber: "DM-TX-4KZ-100-C-1G", productName: "DM Transmitter 4KZ-100", category: "Video" },
  { modelNumber: "HD-PS401", productName: "HD Presentation Switcher 401", category: "Video" },
  { modelNumber: "HD-PS402", productName: "HD Presentation Switcher 402", category: "Video" },
  { modelNumber: "HD-PS622", productName: "HD Presentation Switcher 622", category: "Video" },
  { modelNumber: "HD-TX-4KZ-201", productName: "HD Transmitter 4KZ-201", category: "Video" },
  { modelNumber: "HD-TX-4KZ-401", productName: "HD Transmitter 4KZ-401", category: "Video" },
  { modelNumber: "HD-RXC-4KZ-101", productName: "HD Receiver 4KZ-101", category: "Video" },
  { modelNumber: "HD-RXU-4KZ-101-E", productName: "HD Receiver 4KZ-101-E", category: "Video" },
  { modelNumber: "HD-MD4X1-4K-E", productName: "HD MultiDrive 4x1 4K", category: "Video" },
  { modelNumber: "HD-MD4X2-4K-E", productName: "HD MultiDrive 4x2 4K", category: "Video" },
  { modelNumber: "HD-MD4X4-4KZ-E", productName: "HD MultiDrive 4x4 4KZ", category: "Video" },
  { modelNumber: "HD-MD8X8-4KZ-E", productName: "HD MultiDrive 8x8 4KZ", category: "Video" },
  { modelNumber: "HD-DA8-4KZ-E", productName: "HD Distribution Amplifier 8-Out 4KZ", category: "Video" },
  { modelNumber: "HD-DA4-4KZ-E", productName: "HD Distribution Amplifier 4-Out 4KZ", category: "Video" },
  { modelNumber: "HD-CTL-101", productName: "HD Control Processor 101", category: "Video" },
  // Lighting
  { modelNumber: "DIN-DALI-2", productName: "DIN DALI Gateway 2", category: "Lighting" },
  { modelNumber: "DIN-DLI", productName: "DIN Lighting Interface", category: "Lighting" },
  { modelNumber: "DIN-GWDL", productName: "DIN Gateway DALI-Lutron", category: "Lighting" },
  { modelNumber: "CLW-DIMEX-E", productName: "CLW Dimmer (Ethernet)", category: "Lighting" },
  { modelNumber: "CLW-DIMEX-P", productName: "CLW Dimmer (Powerline)", category: "Lighting" },
  { modelNumber: "CLW-SWEX-E", productName: "CLW Switch (Ethernet)", category: "Lighting" },
  { modelNumber: "CLW-SWEX-P", productName: "CLW Switch (Powerline)", category: "Lighting" },
  { modelNumber: "CLW-DELVEX-E", productName: "CLW Decorator Dimmer (Ethernet)", category: "Lighting" },
  { modelNumber: "CLW-DELVEX-P", productName: "CLW Decorator Dimmer (Powerline)", category: "Lighting" },
  { modelNumber: "CLX-4HSW4", productName: "CLX 4-Channel Switch", category: "Lighting" },
  { modelNumber: "CLX-2DIM8", productName: "CLX 2-Channel Dimmer 8A", category: "Lighting" },
  { modelNumber: "CLX-1DIM8", productName: "CLX 1-Channel Dimmer 8A", category: "Lighting" },
  { modelNumber: "CLX-1DIMU4", productName: "CLX 1-Channel Universal Dimmer 4A", category: "Lighting" },
  { modelNumber: "DIN-8SW8", productName: "DIN 8-Channel Switch 8A", category: "Lighting" },
  { modelNumber: "DIN-4DIMFLV4", productName: "DIN 4-Channel Dimmer FLV 4A", category: "Lighting" },
  { modelNumber: "DIN-1DIM4", productName: "DIN 1-Channel Dimmer 4A", category: "Lighting" },
  { modelNumber: "GLX-DIM6", productName: "GLX Dimmer 6A", category: "Lighting" },
  { modelNumber: "GLXP-DIMFLV8", productName: "GLXP Dimmer FLV 8A", category: "Lighting" },
  { modelNumber: "GLXP-HSW12", productName: "GLXP High-Voltage Switch 12A", category: "Lighting" },
  // Shading
  { modelNumber: "CSM-QMT50-DCCN", productName: "Cresnet Shade Motor 50mm DC", category: "Motorized Shades" },
  { modelNumber: "CSM-QMT50-DCEX", productName: "Wireless Shade Motor 50mm DC", category: "Motorized Shades" },
  { modelNumber: "CLX-1MC4", productName: "CLX 1-Channel Motor Controller 4A", category: "Motorized Shades" },
  { modelNumber: "C2N-SDC", productName: "Shade Driver (Cresnet)", category: "Motorized Shades" },
  { modelNumber: "C2N-SDC-DC", productName: "Shade Driver DC (Cresnet)", category: "Motorized Shades" },
  { modelNumber: "CSC-ACEX", productName: "Shade Controller AC (Wireless)", category: "Motorized Shades" },
  { modelNumber: "CSC-DCCN", productName: "Shade Controller DC (Cresnet)", category: "Motorized Shades" },
  { modelNumber: "CSC-DCEX", productName: "Shade Controller DC (Wireless)", category: "Motorized Shades" },
  { modelNumber: "DIN-2MC2", productName: "DIN 2-Channel Motor Controller 2A", category: "Motorized Shades" },
  // Control Systems
  { modelNumber: "CP4-R", productName: "Control Processor 4", category: "Control Systems" },
  { modelNumber: "DIN-AP4-R", productName: "DIN AP4 Controller", category: "Control Systems" },
  { modelNumber: "MC4-R", productName: "Media Controller 4", category: "Control Systems" },
  { modelNumber: "PC4-R", productName: "Portable Controller 4", category: "Control Systems" },
  // Touch Screens
  { modelNumber: "DGE-1000", productName: "Digital Graphics Engine 1000", category: "Video" },
  { modelNumber: "TST-1080", productName: "Touch Screen Tabletop 10.1\"", category: "Remotes & Keypads" },
  { modelNumber: "TS-1070", productName: "Touch Screen 10.1\"", category: "Remotes & Keypads" },
  { modelNumber: "TS-1070R", productName: "Touch Screen 10.1\" Residential", category: "Remotes & Keypads" },
  { modelNumber: "TS-770", productName: "Touch Screen 7\"", category: "Remotes & Keypads" },
  { modelNumber: "TS-770R", productName: "Touch Screen 7\" Residential", category: "Remotes & Keypads" },
  { modelNumber: "TSW-1070", productName: "Touch Screen Wall 10.1\"", category: "Remotes & Keypads" },
  { modelNumber: "TSW-1070R", productName: "Touch Screen Wall 10.1\" Residential", category: "Remotes & Keypads" },
  { modelNumber: "TSW-770", productName: "Touch Screen Wall 7\"", category: "Remotes & Keypads" },
  { modelNumber: "TSW-770R", productName: "Touch Screen Wall 7\" Residential", category: "Remotes & Keypads" },
  { modelNumber: "TSW-570", productName: "Touch Screen Wall 5.7\"", category: "Remotes & Keypads" },
  { modelNumber: "TSW-570P", productName: "Touch Screen Wall 5.7\" Portrait", category: "Remotes & Keypads" },
  { modelNumber: "TSW-570PR", productName: "Touch Screen Wall 5.7\" Portrait Residential", category: "Remotes & Keypads" },
  { modelNumber: "TSW-1060", productName: "Touch Screen Wall 10.1\" Gen2", category: "Remotes & Keypads" },
  { modelNumber: "TSW-760", productName: "Touch Screen Wall 7\" Gen2", category: "Remotes & Keypads" },
  { modelNumber: "TSW-560", productName: "Touch Screen Wall 5.5\" Gen2", category: "Remotes & Keypads" },
  { modelNumber: "UC-MM30-R", productName: "UC Mini Module 30", category: "Remotes & Keypads" },
  // Remotes
  { modelNumber: "HR-100", productName: "Handheld Remote 100", category: "Remotes & Keypads" },
  { modelNumber: "HR-150", productName: "Handheld Remote 150", category: "Remotes & Keypads" },
  { modelNumber: "HR-310", productName: "Handheld Remote 310", category: "Remotes & Keypads" },
  { modelNumber: "HR-310-I", productName: "Handheld Remote 310 International", category: "Remotes & Keypads" },
  { modelNumber: "TSR-310", productName: "Touch Screen Remote 310", category: "Remotes & Keypads" },
  { modelNumber: "HR-CV-MINI", productName: "Handheld Remote CV Mini", category: "Remotes & Keypads" },
];

export async function toggleProductCrestron(productId: string, value: boolean): Promise<{ ok: boolean }> {
  await requireAdmin();
  await prisma.product.update({ where: { id: productId }, data: { isCrestronHomeCompatible: value } });
  revalidatePath("/admin/crestron-home");
  revalidatePath("/admin/products");
  return { ok: true };
}

export async function seedCrestronDevices(): Promise<{ ok: boolean; created: number }> {
  await requireAdmin();
  let created = 0;
  for (const d of CRESTRON_SEED_DATA) {
    const existing = await db.crestronHomeDevice.findFirst({ where: { modelNumber: d.modelNumber } });
    if (!existing) {
      await db.crestronHomeDevice.create({ data: { ...d, isActive: true } });
      created++;
    }
  }
  revalidatePath("/admin/crestron-home");
  return { ok: true, created };
}

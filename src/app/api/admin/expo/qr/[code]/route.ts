import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth-helpers";
import { isValidQrCode } from "@/lib/expo/qr-code";
import { appUrl } from "@/lib/app-url";
import { qrPngWithLogo } from "@/server/expo/qr-image";

export const dynamic = "force-dynamic";

/** PNG del QR en alta resolución (negro, con el isotipo de Soundtec al centro) para imprimir. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  await requirePermission("settings.manage");
  const { code } = await params;
  if (!isValidQrCode(code)) return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  const png = await qrPngWithLogo(`${appUrl()}/e/${code}`);
  return new NextResponse(Buffer.from(png), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="qr-${code}.png"` },
  });
}

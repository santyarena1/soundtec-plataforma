import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { requirePermission } from "@/lib/auth-helpers";
import { isValidQrCode } from "@/lib/expo/qr-code";

export const dynamic = "force-dynamic";

function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.soundtecportal.com.ar").replace(/\/$/, "");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  await requirePermission("settings.manage");
  const { code } = await params;
  if (!isValidQrCode(code)) return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  const png = await QRCode.toBuffer(`${appUrl()}/e/${code}`, { width: 2048, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0E1A2B", light: "#FFFFFF" } });
  return new NextResponse(Buffer.from(png), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="qr-${code}.png"` },
  });
}

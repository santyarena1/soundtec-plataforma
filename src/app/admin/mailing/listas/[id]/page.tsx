import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { readAudienceQuery } from "@/lib/mailing/audience";
import { loadFilterOptions } from "@/lib/mailing/filter-options";
import { ListDetailClient } from "./list-detail-client";

export const metadata = { title: "Admin · Lista de mails" };

const PAGE_SIZE = 200;

export default async function MailingListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff("marketing.manage");
  const { id } = await params;
  const sp = await searchParams;
  const list = await prisma.mailingList.findUnique({ where: { id } });
  if (!list) notFound();
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 120);
  const page = Math.max(1, Number(sp.pagina) || 1);

  if (list.kind === "DYNAMIC") {
    const query = readAudienceQuery(list.query);
    return (
      <div className="space-y-5">
        <Link href="/admin/mailing/listas" className="text-sm text-muted-foreground hover:text-foreground">
          ← Listas
        </Link>
        <ListDetailClient
          mode="dynamic"
          list={{ id: list.id, name: list.name, description: list.description ?? "" }}
          query={query ?? { source: "clients", filters: { segments: [], taxConditions: [], ownerIds: [], provinces: [], status: "active", portalAccess: "any", requestStatuses: [], eventIds: [] } }}
          options={await loadFilterOptions()}
        />
      </div>
    );
  }

  const where = { listId: id, ...(q ? { OR: [{ email: { contains: q } }, { name: { contains: q, mode: "insensitive" as const } }, { company: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const [members, total, suppressed] = await Promise.all([
    prisma.mailingListMember.findMany({ where, orderBy: { createdAt: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.mailingListMember.count({ where }),
    prisma.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*)::bigint AS n FROM "MailingListMember" m JOIN "MailSuppression" s ON s."email" = m."email" WHERE m."listId" = ${id}`,
  ]);

  return (
    <div className="space-y-5">
      <Link href="/admin/mailing/listas" className="text-sm text-muted-foreground hover:text-foreground">
        ← Listas
      </Link>
      <ListDetailClient
        mode="imported"
        list={{ id: list.id, name: list.name, description: list.description ?? "" }}
        members={members.map((m) => ({
          id: m.id,
          email: m.email,
          name: m.name ?? "",
          company: m.company ?? "",
          fields: m.fields && typeof m.fields === "object" && !Array.isArray(m.fields) ? Object.entries(m.fields).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : "",
        }))}
        total={total}
        suppressed={Number(suppressed[0]?.n ?? 0)}
        page={page}
        pages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        q={q}
      />
    </div>
  );
}

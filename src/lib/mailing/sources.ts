import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/mail/address";
import { buildRecipients, readAudienceQuery, type AudienceFilters, type AudienceQuery, type CampaignAudience, type RecipientStats } from "@/lib/mailing/audience";
import type { MailContact } from "@/lib/mailing/variables";

/**
 * Lectura de la base para las audiencias: listas importadas y filtros sobre
 * clientes, usuarios del portal, interesados y solicitudes de cuenta.
 */

const MAX_CONTACTS_PER_SOURCE = 100_000;

function clientWhere(filters: AudienceFilters): Prisma.ClientWhereInput {
  const where: Prisma.ClientWhereInput = {};
  if (filters.status === "active") where.isActive = true;
  if (filters.status === "inactive") where.isActive = false;
  if (filters.segments.length) where.segment = { in: filters.segments };
  if (filters.taxConditions.length) where.taxCondition = { in: filters.taxConditions };
  if (filters.ownerIds.length) where.ownerId = { in: filters.ownerIds };
  if (filters.provinces.length) where.province = { in: filters.provinces };
  if (filters.portalAccess === "with") where.portalUsers = { some: { isActive: true } };
  if (filters.portalAccess === "without") where.portalUsers = { none: { isActive: true } };
  return where;
}

function hasClientFilters(filters: AudienceFilters): boolean {
  return Boolean(filters.segments.length || filters.taxConditions.length || filters.ownerIds.length || filters.provinces.length || filters.portalAccess !== "any");
}

async function clientContacts(filters: AudienceFilters): Promise<MailContact[]> {
  const clients = await prisma.client.findMany({
    where: clientWhere(filters),
    take: MAX_CONTACTS_PER_SOURCE,
    orderBy: { companyName: "asc" },
    select: {
      companyName: true,
      tradeName: true,
      contactName: true,
      email: true,
      segment: true,
      province: true,
      city: true,
      owner: { select: { name: true } },
      contacts: { where: { email: { not: null } }, select: { name: true, email: true, isPrimary: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
    },
  });
  const out: MailContact[] = [];
  for (const c of clients) {
    const company = c.tradeName?.trim() || c.companyName;
    const fields = { rubro: c.segment ?? "", provincia: c.province ?? "", ciudad: c.city ?? "", responsable: c.owner?.name ?? "" };
    if (c.email) out.push({ email: c.email, name: c.contactName, company, fields });
    for (const contact of c.contacts) out.push({ email: contact.email!, name: contact.name, company, fields });
  }
  return out;
}

async function portalUserContacts(filters: AudienceFilters): Promise<MailContact[]> {
  const where: Prisma.UserWhereInput = { role: "CLIENT" };
  if (filters.status === "active") where.isActive = true;
  if (filters.status === "inactive") where.isActive = false;
  if (hasClientFilters({ ...filters, portalAccess: "any" })) where.client = clientWhere({ ...filters, status: "all", portalAccess: "any" });
  const users = await prisma.user.findMany({
    where,
    take: MAX_CONTACTS_PER_SOURCE,
    select: { name: true, email: true, companyName: true, client: { select: { companyName: true, tradeName: true, segment: true, province: true, owner: { select: { name: true } } } } },
  });
  return users.map((u) => ({
    email: u.email,
    name: u.name,
    company: u.client?.tradeName?.trim() || u.client?.companyName || u.companyName,
    fields: { rubro: u.client?.segment ?? "", provincia: u.client?.province ?? "", responsable: u.client?.owner?.name ?? "" },
  }));
}

async function expoContacts(filters: AudienceFilters): Promise<MailContact[]> {
  const visitors = await prisma.visitorLead.findMany({
    where: filters.eventIds.length ? { eventId: { in: filters.eventIds } } : {},
    take: MAX_CONTACTS_PER_SOURCE,
    orderBy: { createdAt: "desc" },
    select: { email: true, name: true, company: true, interest: true, event: { select: { name: true } } },
  });
  const out: MailContact[] = visitors.map((v) => ({ email: v.email, name: v.name, company: v.company, fields: { evento: v.event?.name ?? "", interes: (v.interest ?? "").slice(0, 200) } }));
  if (!filters.eventIds.length) {
    const assistant = await prisma.expoLead.findMany({ where: { email: { not: null } }, take: MAX_CONTACTS_PER_SOURCE, orderBy: { createdAt: "desc" }, select: { email: true, name: true, company: true } });
    for (const a of assistant) out.push({ email: a.email!, name: a.name, company: a.company, fields: { evento: "Asistente de productos" } });
  }
  return out;
}

async function accountRequestContacts(filters: AudienceFilters): Promise<MailContact[]> {
  const statuses = filters.requestStatuses.filter((s): s is "PENDING" | "APPROVED" | "REJECTED" => ["PENDING", "APPROVED", "REJECTED"].includes(s));
  const rows = await prisma.accountRequest.findMany({
    where: statuses.length ? { status: { in: statuses } } : {},
    take: MAX_CONTACTS_PER_SOURCE,
    orderBy: { createdAt: "desc" },
    select: { email: true, fullName: true, company: true, activity: true, location: true },
  });
  return rows.map((r) => ({ email: r.email, name: r.fullName, company: r.company, fields: { actividad: r.activity, ubicacion: r.location ?? "" } }));
}

export async function loadQueryContacts(query: AudienceQuery): Promise<MailContact[]> {
  switch (query.source) {
    case "clients":
      return clientContacts(query.filters);
    case "portal_users":
      return portalUserContacts(query.filters);
    case "expo_leads":
      return expoContacts(query.filters);
    case "account_requests":
      return accountRequestContacts(query.filters);
  }
}

function fieldsOf(raw: Prisma.JsonValue | null): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v ?? "")]));
}

/** Contactos de una lista guardada (importada o filtro). */
export async function loadListContacts(listId: string): Promise<MailContact[] | null> {
  const list = await prisma.mailingList.findUnique({ where: { id: listId }, select: { kind: true, query: true } });
  if (!list) return null;
  if (list.kind === "DYNAMIC") {
    const query = readAudienceQuery(list.query);
    return query ? loadQueryContacts(query) : [];
  }
  const members = await prisma.mailingListMember.findMany({ where: { listId }, orderBy: { createdAt: "asc" }, select: { email: true, name: true, company: true, fields: true } });
  return members.map((m) => ({ email: m.email, name: m.name, company: m.company, fields: fieldsOf(m.fields) }));
}

export async function suppressedEmails(emails?: string[]): Promise<Set<string>> {
  const rows = await prisma.mailSuppression.findMany({ where: emails ? { email: { in: emails.map(normalizeEmail) } } : {}, select: { email: true } });
  return new Set(rows.map((r) => r.email));
}

/** Destinatarios reales de una campaña: suma de listas − excluidas − supresión, sin repetidos. */
export async function resolveCampaignAudience(audience: CampaignAudience): Promise<{ recipients: MailContact[]; stats: RecipientStats; missingLists: number }> {
  let missingLists = 0;
  const groups: MailContact[][] = [];
  for (const id of audience.include) {
    const contacts = await loadListContacts(id);
    if (contacts === null) missingLists += 1;
    else groups.push(contacts);
  }
  const exclude: string[] = [];
  for (const id of audience.exclude) {
    const contacts = await loadListContacts(id);
    if (contacts) for (const c of contacts) exclude.push(c.email);
  }
  const suppressed = await suppressedEmails();
  const { recipients, stats } = buildRecipients(groups, { exclude, suppressed });
  return { recipients, stats, missingLists };
}

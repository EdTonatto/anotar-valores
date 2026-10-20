import { isAppData, type AppData } from "./models";
import {
  isReference,
  normalizeName,
  formatReference,
} from "./peopleAndInvoices";
import { selectInvoiceSummary, formatCents, formatItemCount } from "./totals";
const nameKey = (name: string) =>
  normalizeName(name).toLocaleLowerCase("pt-BR");
/** Projeta somente campos conhecidos; não transporta atributos extras. */
export function canonicalData(data: AppData): AppData {
  return {
    schemaVersion: 1,
    people: data.people.map((p) => ({ id: p.id, name: normalizeName(p.name) })),
    cards: data.cards.map((c) => ({ id: c.id, name: normalizeName(c.name) })),
    invoices: data.invoices.map((f) => ({
      id: f.id,
      personId: f.personId,
      reference: f.reference,
      ...(f.updatedAt ? { updatedAt: f.updatedAt } : {}),
      ...(f.cardUpdatedAt ? { cardUpdatedAt: { ...f.cardUpdatedAt } } : {}),
    })),
    purchases: data.purchases.map((p) => ({
      ...(p.installmentSeriesId
        ? { installmentSeriesId: p.installmentSeriesId }
        : {}),
      id: p.id,
      invoiceId: p.invoiceId,
      cardId: p.cardId,
      description: normalizeName(p.description),
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
      ...(p.updatedAt ? { updatedAt: p.updatedAt } : {}),
      ...(p.reimbursed ? { reimbursed: true } : {}),
      ...(p.participants
        ? {
            participants: p.participants.map((participant) => ({
              ...participant,
            })),
          }
        : {}),
      amountCents: p.amountCents,
      installment: p.installment
        ? { current: p.installment.current, total: p.installment.total }
        : null,
    })),
  };
}
function uniqueNames(data: AppData) {
  for (const list of [data.people, data.cards])
    if (new Set(list.map((item) => nameKey(item.name))).size !== list.length)
      throw new Error(
        "Há nomes equivalentes com IDs diferentes. Ajuste os nomes ou IDs antes de importar.",
      );
}
export function parseImport(text: string): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON inválido ou incompleto. Confira o texto colado.");
  }
  if (!isAppData(parsed))
    throw new Error(
      "Formato incompatível: use schemaVersion 1, IDs únicos e vínculos válidos, competência AAAA-MM, centavos inteiros positivos e parcelas válidas.",
    );
  const result = canonicalData(parsed);
  uniqueNames(result);
  return result;
}
export function exportInvoice(
  data: AppData,
  personId: string,
  reference: string,
): string {
  const invoice = data.invoices.find(
    (f) => f.personId === personId && f.reference === reference,
  );
  const person = data.people.find((p) => p.id === personId);
  if (!person || !invoice)
    throw new Error(
      "Crie ou selecione uma fatura antes de exportar este JSON.",
    );
  return JSON.stringify(
    canonicalData({
      ...data,
      people: [person],
      invoices: [invoice],
      purchases: data.purchases.filter((p) => p.invoiceId === invoice.id),
    }),
    null,
    2,
  );
}
// Remove marcadores que poderiam alterar a estrutura da mensagem no WhatsApp.
const messageText = (text: string) =>
  normalizeName(text).replace(/[*_~`]/g, "");
export function whatsappReport(
  data: AppData,
  personId: string,
  reference: string,
): string {
  const person = data.people.find((p) => p.id === personId);
  if (!person || !isReference(reference))
    throw new Error("Selecione uma pessoa e competência válidas.");
  const summary = selectInvoiceSummary(data, personId, reference);
  const lines = [
    `*${messageText(person.name)}*`,
    `*Fatura: ${formatReference(reference)} (${reference})*`,
  ];
  for (const group of summary.groups) {
    if (!group.purchases.length) continue;
    lines.push("", `*${messageText(group.card.name)}*`);
    for (const p of group.purchases) {
      const share = p.participants?.find(
        (participant) => participant.personId === personId,
      )?.amountCents;
      const line = `• ${messageText(p.description)}${p.installment ? ` (${p.installment.current}/${p.installment.total})` : " (à vista)"} — ${formatCents(BigInt(share ?? p.amountCents))}`;
      lines.push(p.reimbursed ? `~${line} — reembolsada/estornada~` : line);
    }
    lines.push(
      `${formatItemCount(group.purchases.length)} · *Subtotal: ${formatCents(group.subtotalCents)}*`,
    );
  }
  if (!summary.purchaseCount) lines.push("", "Nenhuma compra nesta fatura.");
  lines.push("", `*Total geral: ${formatCents(summary.totalCents)}*`);
  return lines.join("\n");
}
export type ImportMode = "merge" | "replace";
export type NamePolicy = "local" | "incoming";
export function planImport(
  base: AppData,
  incoming: AppData,
  mode: ImportMode,
  names: NamePolicy,
) {
  if (!isAppData(base) || !isAppData(incoming))
    throw new Error("Dados inválidos. Nada foi alterado.");
  const conflicts: string[] = [];
  function mergeNames<T extends { id: string; name: string }>(
    local: T[],
    items: T[],
  ): T[] {
    const result = local.map((item) => ({ ...item }));
    for (const item of items) {
      const index = result.findIndex((old) => old.id === item.id);
      if (index < 0) result.push({ ...item });
      else if (result[index].name !== item.name) {
        conflicts.push(`${result[index].name} → ${item.name}`);
        if (names === "incoming") result[index] = { ...item };
      }
    }
    return result;
  }
  const next: AppData = {
    schemaVersion: 1,
    people: mergeNames(base.people, incoming.people),
    cards: mergeNames(base.cards, incoming.cards),
    invoices: base.invoices.map((f) => ({ ...f })),
    purchases: base.purchases.map((p) => ({ ...p })),
  };
  uniqueNames(next);
  const invoiceMap = new Map<string, string>();
  const targets = new Set<string>();
  for (const invoice of incoming.invoices) {
    const sameId = next.invoices.find((f) => f.id === invoice.id);
    if (
      sameId &&
      (sameId.personId !== invoice.personId ||
        sameId.reference !== invoice.reference)
    )
      throw new Error(
        "Conflito de ID de fatura com outra pessoa ou competência. Nada foi alterado.",
      );
    const existing = next.invoices.find(
      (f) =>
        f.personId === invoice.personId && f.reference === invoice.reference,
    );
    const id = existing?.id ?? invoice.id;
    invoiceMap.set(invoice.id, id);
    targets.add(id);
    if (!existing) next.invoices.push({ ...invoice });
  }
  const removed =
    mode === "replace"
      ? next.purchases.filter((p) => targets.has(p.invoiceId)).length
      : 0;
  if (mode === "replace")
    next.purchases = next.purchases.filter((p) => !targets.has(p.invoiceId));
  let added = 0,
    unchanged = 0;
  for (const purchase of incoming.purchases) {
    const item = {
      ...purchase,
      invoiceId: invoiceMap.get(purchase.invoiceId)!,
    };
    const existing = next.purchases.find((p) => p.id === item.id);
    if (existing) {
      if (!(
        existing.invoiceId === item.invoiceId &&
        existing.cardId === item.cardId &&
        existing.description === item.description &&
        existing.amountCents === item.amountCents &&
        existing.installment?.current === item.installment?.current &&
        existing.installment?.total === item.installment?.total &&
        existing.installmentSeriesId === item.installmentSeriesId &&
        existing.reimbursed === item.reimbursed
      ))
        throw new Error(
          "Conflito de ID de compra. Para atualizar compras das faturas importadas, escolha substituir. IDs de outras faturas precisam ser corrigidos.",
        );
      unchanged++;
      continue;
    }
    // Mesmo ID em histórico não relacionado nunca pode ser remapeado.
    const original = base.purchases.find((p) => p.id === item.id);
    if (original && original.invoiceId !== item.invoiceId)
      throw new Error(
        "ID de compra pertence a outra fatura. Nada foi alterado.",
      );
    next.purchases.push(item);
    added++;
  }
  if (!isAppData(next))
    throw new Error(
      "A importação geraria vínculos inválidos. Nada foi alterado.",
    );
  return {
    data: next,
    conflicts,
    added,
    unchanged,
    removed,
    invoiceCount: targets.size,
  };
}

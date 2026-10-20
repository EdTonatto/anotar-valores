import { selectInvoiceSummary } from "./totals";
export { formatCents } from "./totals";
import { createId, type AppData } from "./models";
import { normalizeName } from "./peopleAndInvoices";
export function saveCard(
  data: AppData,
  name: string,
  cardId?: string,
): AppData {
  const normalized = normalizeName(name);
  if (!normalized) throw new Error("Informe o nome do cartão.");
  if (cardId && !data.cards.some((c) => c.id === cardId))
    throw new Error("Cartão não encontrado.");
  if (
    data.cards.some(
      (c) =>
        c.id !== cardId &&
        normalizeName(c.name).toLocaleLowerCase("pt-BR") ===
          normalized.toLocaleLowerCase("pt-BR"),
    )
  )
    throw new Error("Já existe um cartão com esse nome.");
  return {
    ...data,
    cards: cardId
      ? data.cards.map((c) =>
          c.id === cardId ? { ...c, name: normalized } : c,
        )
      : [...data.cards, { id: createId(), name: normalized }],
  };
}
export function cardUsage(data: AppData, cardId: string) {
  const purchases = data.purchases.filter((p) => p.cardId === cardId);
  const invoices = data.invoices.filter((f) =>
    purchases.some((p) => p.invoiceId === f.id),
  );
  return {
    purchases: purchases.length,
    invoices: invoices.length,
    people: new Set(invoices.map((f) => f.personId)).size,
  };
}
export function deleteCard(data: AppData, cardId: string): AppData {
  if (!data.cards.some((c) => c.id === cardId))
    throw new Error("Cartão não encontrado.");
  if (cardUsage(data, cardId).purchases)
    throw new Error(
      "Este cartão possui compras no histórico e não pode ser excluído.",
    );
  return { ...data, cards: data.cards.filter((c) => c.id !== cardId) };
}
export function selectCardGroups(
  data: AppData,
  personId: string,
  reference: string,
) {
  return selectInvoiceSummary(data, personId, reference).groups;
}

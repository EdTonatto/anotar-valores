import type { AppData, Cartao, Compra } from "./models";
import { selectInvoice } from "./peopleAndInvoices";
export interface CardSummary {
  card: Cartao;
  purchases: Compra[];
  subtotalCents: bigint;
}
/** Fonte única para tela e relatórios: totais derivados, nunca persistidos. */
export function selectInvoiceSummary(
  data: AppData,
  personId: string,
  reference: string,
) {
  const { invoice, purchases } = selectInvoice(data, personId, reference);
  const groups: CardSummary[] = data.cards.map((card) => ({
    card,
    purchases: [],
    subtotalCents: 0n,
  }));
  const byCard = new Map(groups.map((group) => [group.card.id, group]));
  for (const purchase of purchases) {
    const group = byCard.get(purchase.cardId);
    if (!group) throw new Error("Compra vinculada a um cartão inexistente.");
    group.purchases.push(purchase);
    group.subtotalCents += BigInt(purchase.amountCents);
  }
  return {
    invoice,
    groups,
    purchaseCount: purchases.length,
    totalCents: groups.reduce((sum, group) => sum + group.subtotalCents, 0n),
  };
}
export function formatCents(cents: bigint): string {
  const reais = new Intl.NumberFormat("pt-BR").format(cents / 100n);
  return `R$ ${reais},${String(cents % 100n).padStart(2, "0")}`;
}

export function formatItemCount(count: number): string {
  return `${count} ${count === 1 ? "item" : "itens"}`;
}

/** Mesmo lançamento nas visões por pessoa e por cartão, sem cópias. */
export function selectCardInvoiceSummary(
  data: AppData,
  cardId: string,
  reference: string,
) {
  const invoices = new Map(
    data.invoices
      .filter((i) => i.reference === reference)
      .map((i) => [i.id, i]),
  );
  const people = new Map(data.people.map((p) => [p.id, p]));
  const purchases = data.purchases
    .filter((p) => p.cardId === cardId && invoices.has(p.invoiceId))
    .map((purchase) => ({
      purchase,
      person: people.get(invoices.get(purchase.invoiceId)!.personId)!,
    }));
  const groups = data.people
    .map((person) => {
      const rows = purchases.filter((row) => row.person.id === person.id);
      return {
        person,
        purchaseCount: rows.length,
        subtotalCents: rows.reduce(
          (sum, row) => sum + BigInt(row.purchase.amountCents),
          0n,
        ),
      };
    })
    .filter((group) => group.purchaseCount > 0);
  return {
    purchases,
    groups,
    purchaseCount: purchases.length,
    totalCents: groups.reduce((sum, group) => sum + group.subtotalCents, 0n),
  };
}

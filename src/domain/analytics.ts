import type { AppData, Compra } from "./models";

export interface DashboardFilters {
  from: string;
  to: string;
  people: string[];
  cards: string[];
  purchaseType: "all" | "single" | "installment";
  status: "active" | "all" | "reimbursed";
  minCents: number | null;
  maxCents: number | null;
}

export interface DashboardPurchase extends Compra {
  personId: string;
  personName: string;
  cardName: string;
  reference: string;
}

export interface AnalyticsRow {
  id: string;
  name: string;
  totalCents: bigint;
  purchaseCount: number;
  averageCents: bigint;
  sharePercent: number;
}

export const emptyDashboardFilters = (reference = ""): DashboardFilters => ({
  from: reference,
  to: reference,
  people: [],
  cards: [],
  purchaseType: "all",
  status: "active",
  minCents: null,
  maxCents: null,
});

function isReference(value: string) {
  return /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function listReferences(data: AppData): string[] {
  return [...new Set(data.invoices.map((invoice) => invoice.reference))].sort();
}

export function getDashboardPurchases(
  data: AppData,
  filters: DashboardFilters,
): DashboardPurchase[] {
  const invoices = new Map(data.invoices.map((invoice) => [invoice.id, invoice]));
  const people = new Map(data.people.map((person) => [person.id, person]));
  const cards = new Map(data.cards.map((card) => [card.id, card]));

  return data.purchases.flatMap((purchase) => {
    const invoice = invoices.get(purchase.invoiceId);
    const person = invoice && people.get(invoice.personId);
    const card = cards.get(purchase.cardId);
    if (!invoice || !person || !card) return [];
    if (isReference(filters.from) && invoice.reference < filters.from) return [];
    if (isReference(filters.to) && invoice.reference > filters.to) return [];
    if (filters.people.length && !filters.people.includes(person.id)) return [];
    if (filters.cards.length && !filters.cards.includes(card.id)) return [];
    if (filters.purchaseType === "single" && purchase.installment) return [];
    if (filters.purchaseType === "installment" && !purchase.installment) return [];
    if (filters.status === "active" && purchase.reimbursed) return [];
    if (filters.status === "reimbursed" && !purchase.reimbursed) return [];
    if (filters.minCents !== null && purchase.amountCents < filters.minCents) return [];
    if (filters.maxCents !== null && purchase.amountCents > filters.maxCents) return [];
    return [{
      ...purchase,
      personId: person.id,
      personName: person.name,
      cardName: card.name,
      reference: invoice.reference,
    }];
  });
}

function amountOf(purchases: DashboardPurchase[]) {
  return purchases.reduce(
    (sum, purchase) => sum + (purchase.reimbursed ? 0n : BigInt(purchase.amountCents)),
    0n,
  );
}

function rowsFor(
  purchases: DashboardPurchase[],
  dimension: "person" | "card",
): AnalyticsRow[] {
  const groups = new Map<string, { name: string; purchases: DashboardPurchase[] }>();
  for (const purchase of purchases) {
    const id = dimension === "person" ? purchase.personId : purchase.cardId;
    const name = dimension === "person" ? purchase.personName : purchase.cardName;
    const group = groups.get(id) ?? { name, purchases: [] };
    group.purchases.push(purchase);
    groups.set(id, group);
  }
  const total = amountOf(purchases);
  return [...groups.entries()].map(([id, group]) => {
    const value = amountOf(group.purchases);
    return {
      id,
      name: group.name,
      totalCents: value,
      purchaseCount: group.purchases.length,
      averageCents: group.purchases.length ? value / BigInt(group.purchases.length) : 0n,
      sharePercent: total ? Number((value * 10000n) / total) / 100 : 0,
    };
  });
}

export function getDashboardAnalytics(data: AppData, filters: DashboardFilters) {
  const purchases = getDashboardPurchases(data, filters);
  const activePurchases = purchases.filter((purchase) => !purchase.reimbursed);
  const totalCents = amountOf(purchases);
  const byPerson = rowsFor(purchases, "person").sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const byCard = rowsFor(purchases, "card").sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const personCard = byPerson.map((person) => ({
    person,
    cards: byCard.map((card) => ({
      card,
      totalCents: amountOf(purchases.filter((purchase) => purchase.personId === person.id && purchase.cardId === card.id)),
    })),
  }));
  const monthly = new Map<string, bigint>();
  for (const purchase of activePurchases)
    monthly.set(purchase.reference, (monthly.get(purchase.reference) ?? 0n) + BigInt(purchase.amountCents));
  const knownReferences = listReferences(data);
  const last = isReference(filters.to) ? filters.to : knownReferences.at(-1);
  let first = isReference(filters.from) ? filters.from : knownReferences[0];
  if (!filters.from && !filters.to && last) {
    const [latestYear, latestMonth] = last.split("-").map(Number);
    const start = Math.max(0, latestYear * 12 + latestMonth - 1 - 5);
    first = `${Math.floor(start / 12)}-${String((start % 12) + 1).padStart(2, "0")}`;
  }
  const months: { reference: string; totalCents: bigint }[] = [];
  if (first && last && first <= last) {
    let [year, month] = first.split("-").map(Number);
    const [lastYear, lastMonth] = last.split("-").map(Number);
    while (year < lastYear || (year === lastYear && month <= lastMonth)) {
      const reference = `${year}-${String(month).padStart(2, "0")}`;
      months.push({ reference, totalCents: monthly.get(reference) ?? 0n });
      month++;
      if (month === 13) { month = 1; year++; }
    }
  }
  const largestPurchase = activePurchases.reduce<DashboardPurchase | null>(
    (largest, purchase) => !largest || purchase.amountCents > largest.amountCents ? purchase : largest,
    null,
  );
  const leadingPerson = byPerson.filter((row) => row.totalCents > 0n).sort((a, b) => a.totalCents > b.totalCents ? -1 : 1)[0];
  const leadingCard = byCard.filter((row) => row.totalCents > 0n).sort((a, b) => a.totalCents > b.totalCents ? -1 : 1)[0];
  return {
    purchases,
    totalCents,
    purchaseCount: purchases.length,
    activeCount: activePurchases.length,
    peopleCount: new Set(activePurchases.map((purchase) => purchase.personId)).size,
    cardsCount: new Set(activePurchases.map((purchase) => purchase.cardId)).size,
    averageCents: activePurchases.length ? totalCents / BigInt(activePurchases.length) : 0n,
    leadingPerson,
    leadingCard,
    largestPurchase,
    byPerson,
    byCard,
    personCard,
    months,
    totalByCard: amountOf(activePurchases),
  };
}

export function sortAnalyticsRows(rows: AnalyticsRow[], sort: "value-desc" | "value-asc" | "count") {
  return [...rows].sort((a, b) => {
    if (sort === "count") return b.purchaseCount - a.purchaseCount || a.name.localeCompare(b.name, "pt-BR");
    if (a.totalCents === b.totalCents) return a.name.localeCompare(b.name, "pt-BR");
    return sort === "value-desc" ? (a.totalCents > b.totalCents ? -1 : 1) : (a.totalCents < b.totalCents ? -1 : 1);
  });
}

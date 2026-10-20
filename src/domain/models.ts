export const SCHEMA_VERSION = 1 as const;
export interface Pessoa {
  id: string;
  name: string;
}
export interface Cartao {
  id: string;
  name: string;
}
export interface Fatura {
  id: string;
  personId: string;
  reference: string;
  updatedAt?: string;
  cardUpdatedAt?: Record<string, string>;
}
export interface Compra {
  installmentSeriesId?: string;
  id: string;
  invoiceId: string;
  cardId: string;
  description: string;
  createdAt?: string;
  updatedAt?: string;
  /** Compra reembolsada/estornada: permanece no histórico, mas não compõe os totais. */
  reimbursed?: boolean;
  /** Partes exatas em centavos. Ausente em registros legados: 100% para a pessoa da fatura. */
  participants?: { personId: string; amountCents: number }[];
  /** Valor cobrado nesta fatura, nunca o total da compra parcelada. */
  amountCents: number;
  installment: { current: number; total: number } | null;
}
export interface AppData {
  schemaVersion: typeof SCHEMA_VERSION;
  people: Pessoa[];
  cards: Cartao[];
  invoices: Fatura[];
  purchases: Compra[];
}
export const createEmptyData = (): AppData => ({
  schemaVersion: SCHEMA_VERSION,
  people: [],
  cards: [],
  invoices: [],
  purchases: [],
});
export const createId = (): string => crypto.randomUUID();
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v);
const timestamp = (v: unknown) =>
  v === undefined ||
  (typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(v) &&
    Number.isFinite(Date.parse(v)));
export function isAppData(value: unknown): value is AppData {
  if (!record(value) || value.schemaVersion !== SCHEMA_VERSION) return false;
  const { people, cards, invoices, purchases } = value;
  if (![people, cards, invoices, purchases].every(Array.isArray)) return false;
  const ps = people as unknown[],
    cs = cards as unknown[],
    fs = invoices as unknown[],
    bs = purchases as unknown[];
  const validIds = (items: unknown[]) =>
    items.every((v) => record(v) && text(v.id)) &&
    new Set(items.map((v) => (v as Record<string, unknown>).id)).size ===
      items.length;
  if (![ps, cs, fs, bs].every(validIds)) return false;
  if (![...ps, ...cs].every((v) => record(v) && text(v.name))) return false;
  const personIds = new Set(ps.map((v) => (v as Pessoa).id));
  const cardIds = new Set(cs.map((v) => (v as Cartao).id));
  const invoiceIds = new Set(fs.map((v) => (v as Fatura).id));
  if (
    !fs.every(
      (v) =>
        record(v) &&
        timestamp(v.updatedAt) &&
        (v.cardUpdatedAt === undefined ||
          (record(v.cardUpdatedAt) &&
            Object.values(v.cardUpdatedAt).every(
              (date) => typeof date === "string" && timestamp(date),
            ))) &&
        text(v.personId) &&
        personIds.has(v.personId) &&
        typeof v.reference === "string" &&
        /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(v.reference),
    )
  )
    return false;
  if (
    new Set(
      fs.map((v) =>
        JSON.stringify([(v as Fatura).personId, (v as Fatura).reference]),
      ),
    ).size !== fs.length
  )
    return false;
  const seriesKeys = new Set<string>();
  return bs.every((v) => {
    if (
      !record(v) ||
      !timestamp(v.createdAt) ||
      !timestamp(v.updatedAt) ||
      !text(v.invoiceId) ||
      !invoiceIds.has(v.invoiceId) ||
      !text(v.cardId) ||
      !cardIds.has(v.cardId) ||
      !text(v.description) ||
      !integer(v.amountCents) ||
      v.amountCents <= 0
    )
      return false;
    if (v.reimbursed !== undefined && typeof v.reimbursed !== "boolean")
      return false;
    if (v.participants !== undefined) {
      if (
        !Array.isArray(v.participants) ||
        v.participants.length < 2 ||
        !v.participants.every(
          (participant) =>
            record(participant) &&
            text(participant.personId) &&
            personIds.has(participant.personId) &&
            integer(participant.amountCents) &&
            participant.amountCents > 0,
        ) ||
        new Set(v.participants.map((participant) => (participant as { personId: string }).personId)).size !== v.participants.length ||
        v.participants.reduce((sum, participant) => sum + (participant as { amountCents: number }).amountCents, 0) !== v.amountCents
      )
        return false;
    }
    const i = v.installment;
    if (v.installmentSeriesId !== undefined) {
      if (!text(v.installmentSeriesId) || !record(i)) return false;
      const key = JSON.stringify([v.installmentSeriesId, i.current]);
      if (seriesKeys.has(key)) return false;
      seriesKeys.add(key);
    }
    return (
      i === null ||
      (record(i) &&
        integer(i.current) &&
        integer(i.total) &&
        i.current >= 1 &&
        i.total >= i.current)
    );
  });
}

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { AppData, Compra } from "../domain/models";
import {
  amountInput,
  maskAmountInput,
  PurchaseError,
  savePurchase,
  type PurchaseDraft,
  type PurchaseField,
} from "../domain/purchases";
interface Props {
  data: AppData;
  update: (data: AppData) => boolean;
  writable: boolean;
  personId: string;
  reference: string;
  purchase?: Compra;
  onDone: () => void;
}
export function PurchaseEditor({
  data,
  update,
  writable,
  personId,
  reference,
  purchase,
  onDone,
}: Props) {
  const [draft, setDraft] = useState<PurchaseDraft>(() => ({
    description: purchase?.description ?? "",
    cardId: purchase?.cardId ?? data.cards[0]?.id ?? "",
    amount: purchase ? maskAmountInput(amountInput(purchase.amountCents)) : "",
    parcelled: !!purchase?.installment,
    current: purchase?.installment?.current.toString() ?? "",
    total: purchase?.installment?.total.toString() ?? "",
  }));
  const [error, setError] = useState<{
    field?: PurchaseField;
    message: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const descriptionRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const amountCursor = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (amountCursor.current !== null) {
      amountRef.current?.setSelectionRange(
        amountCursor.current,
        amountCursor.current,
      );
      amountCursor.current = null;
    }
  });
  const editingId = purchase?.id;
  useEffect(() => {
    if (editingId) {
      descriptionRef.current?.focus();
      descriptionRef.current?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "auto"
          : "smooth",
      });
    }
  }, [editingId]);
  function field<K extends keyof PurchaseDraft>(
    key: K,
    value: PurchaseDraft[K],
  ) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setNotice("");
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (
        !update(savePurchase(data, personId, reference, draft, purchase?.id))
      ) {
        setError({
          message:
            "Não foi possível salvar. Seus campos foram mantidos; confira o aviso de armazenamento.",
        });
        return;
      }
      if (purchase) {
        onDone();
        return;
      }
      setDraft((previous) => ({
        ...previous,
        description: "",
        amount: "",
        parcelled: false,
        current: "",
        total: "",
      }));
      setError(null);
      setNotice("Compra adicionada. Pode lançar a próxima no mesmo cartão.");
      descriptionRef.current?.focus();
    } catch (e) {
      if (e instanceof PurchaseError)
        event.currentTarget
          .querySelector<HTMLElement>(`#purchase-${e.field}`)
          ?.focus();
      setError({
        field: e instanceof PurchaseError ? e.field : undefined,
        message: e instanceof Error ? e.message : "Não foi possível salvar.",
      });
    }
  }
  function feedback(field: PurchaseField) {
    return error?.field === field ? (
      <span id={`purchase-${field}-error`} className="field-error">
        {error.message}
      </span>
    ) : null;
  }
  const aria = (field: PurchaseField) => ({
    "aria-invalid": error?.field === field,
    "aria-describedby":
      error?.field === field ? `purchase-${field}-error` : undefined,
  });
  return (
    <form className="purchase-editor" onSubmit={submit} noValidate>
      <div className="purchase-editor-heading">
        <h3>{purchase ? "Editar compra" : "Adicionar compra"}</h3>
        <span className="pill">Valor desta fatura</span>
      </div>
      <div className="purchase-fields">
        <div className="description-field">
          <label htmlFor="purchase-description">Descrição</label>
          <input
            ref={descriptionRef}
            id="purchase-description"
            value={draft.description}
            onChange={(e) => field("description", e.target.value)}
            placeholder="Ex.: Mercado Livre"
            {...aria("description")}
          />
          {feedback("description")}
        </div>
        <div>
          <label htmlFor="purchase-card">Cartão</label>
          <select
            id="purchase-card"
            value={draft.cardId}
            onChange={(e) => field("cardId", e.target.value)}
            {...aria("cardId")}
          >
            <option value="" disabled>
              Selecione
            </option>
            {data.cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {feedback("cardId")}
        </div>
        <div>
          <label htmlFor="purchase-amount">Valor na fatura (R$)</label>
          <input
            id="purchase-amount"
            ref={amountRef}
            inputMode="numeric"
            value={draft.amount}
            onChange={(e) => {
              const input = e.target;
              const rightDigits = input.value
                .slice(input.selectionStart ?? input.value.length)
                .replace(/\D/g, "").length;
              const formatted = maskAmountInput(input.value);
              let cursor = formatted.length;
              for (let remaining = rightDigits; cursor > 0 && remaining > 0;) {
                cursor -= 1;
                if (/\d/.test(formatted[cursor])) remaining -= 1;
              }
              amountCursor.current = cursor;
              field("amount", formatted);
            }}
            placeholder="0,00"
            {...aria("amount")}
          />
          {feedback("amount")}
        </div>
      </div>
      <fieldset className="installment-mode">
        <legend>Forma da compra</legend>
        <label>
          <input
            type="radio"
            name="payment-mode"
            checked={!draft.parcelled}
            onChange={() => field("parcelled", false)}
          />{" "}
          À vista
        </label>
        <label>
          <input
            type="radio"
            name="payment-mode"
            checked={draft.parcelled}
            onChange={() => field("parcelled", true)}
          />{" "}
          Parcelada
        </label>
      </fieldset>
      {draft.parcelled && (
        <div className="installment-fields">
          <div>
            <label htmlFor="purchase-current">Parcela atual</label>
            <input
              id="purchase-current"
              inputMode="numeric"
              value={draft.current}
              onChange={(e) => field("current", e.target.value)}
              placeholder="2"
              {...aria("current")}
            />
            {feedback("current")}
          </div>
          <div>
            <label htmlFor="purchase-total">Total de parcelas</label>
            <input
              id="purchase-total"
              inputMode="numeric"
              value={draft.total}
              onChange={(e) => field("total", e.target.value)}
              placeholder="5"
              {...aria("total")}
            />
            {feedback("total")}
          </div>
          <p>
            Informe somente o valor cobrado neste mês. As próximas parcelas não
            serão criadas automaticamente.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error.message}
        </p>
      )}
      <div className="purchase-form-actions">
        <button type="submit" className="primary" disabled={!writable}>
          {purchase ? "Salvar alterações" : "Adicionar compra"}
        </button>
        {purchase && (
          <button type="button" onClick={onDone}>
            Cancelar edição
          </button>
        )}
        <span role="status">{notice}</span>
      </div>
    </form>
  );
}

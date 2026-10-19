import { useImperativeHandle, useRef, useState, type Ref } from "react";
import type { AppData } from "../domain/models";
import {
  canonicalData,
  exportInvoice,
  parseImport,
  planImport,
  whatsappReport,
  type ImportMode,
  type NamePolicy,
} from "../domain/reports";
import { formatReference, isReference } from "../domain/peopleAndInvoices";
import { formatCents, selectInvoiceSummary } from "../domain/totals";
export type ReportAction =
  "whatsapp" | "copy-invoice" | "view-invoice" | "backup";
export interface ReportsHandle {
  run: (action: ReportAction) => void;
}
interface Props {
  ref?: Ref<ReportsHandle>;
  data: AppData;
  update: (data: AppData) => boolean;
  writable: boolean;
  personId: string;
  reference: string;
  onImported: (personId: string, reference: string) => void;
}
export function Reports({
  ref,
  data,
  update,
  writable,
  personId,
  reference,
  onImported,
}: Props) {
  const [output, setOutput] = useState<{ title: string; text: string } | null>(
    null,
  );
  const [source, setSource] = useState("");
  const [mode, setMode] = useState<ImportMode>("merge");
  const [names, setNames] = useState<NamePolicy>("local");
  const [preview, setPreview] = useState<{
    base: AppData;
    incoming: AppData;
    plan: ReturnType<typeof planImport>;
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const hasContext =
    data.people.some((p) => p.id === personId) && isReference(reference);
  const hasInvoice = data.invoices.some(
    (f) => f.personId === personId && f.reference === reference,
  );
  async function present(title: string, text: string, copy: boolean) {
    setOutput({ title, text });
    setError("");
    setNotice("");
    if (copy) {
      try {
        if (!navigator.clipboard?.writeText) throw new Error();
        await navigator.clipboard.writeText(text);
        setNotice(`${title} copiado.`);
      } catch {
        setError(
          "Não foi possível copiar automaticamente. Use “Selecionar texto” e copie manualmente (Ctrl+C ou o comando de copiar do celular).",
        );
      }
    }
  }
  function showInvoice(copy: boolean) {
    try {
      void present(
        "JSON da fatura",
        exportInvoice(data, personId, reference),
        copy,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível exportar.");
    }
  }
  useImperativeHandle(ref, () => ({
    run(action) {
      if (action === "whatsapp" && hasContext) {
        void present(
          "Relatório para WhatsApp",
          whatsappReport(data, personId, reference),
          true,
        );
      } else if (
        (action === "copy-invoice" || action === "view-invoice") &&
        hasInvoice
      ) {
        showInvoice(action === "copy-invoice");
      } else if (action === "backup") {
        void present(
          "Backup completo JSON",
          JSON.stringify(canonicalData(data), null, 2),
          true,
        );
      }
    },
  }));
  function review() {
    setPreview(null);
    setConfirmed(false);
    setError("");
    setNotice("");
    try {
      const incoming = parseImport(source);
      setPreview({
        base: data,
        incoming,
        plan: planImport(data, incoming, mode, names),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível validar.");
    }
  }
  function apply() {
    if (!preview || !confirmed) return;
    if (preview.base !== data) {
      setError(
        "Os dados mudaram após a prévia. Valide novamente antes de importar.",
      );
      setPreview(null);
      return;
    }
    if (update(preview.plan.data)) {
      const first = preview.incoming.invoices[0];
      if (first) onImported(first.personId, first.reference);
      setPreview(null);
      setSource("");
      setConfirmed(false);
      setNotice("Importação concluída. Dados e totais atualizados.");
    } else
      setError(
        "A importação não foi aplicada. O estado anterior foi mantido; confira o aviso de armazenamento.",
      );
  }
  function invalidate() {
    setPreview(null);
    setConfirmed(false);
    setError("");
    setNotice("");
  }
  return (
    <section className="reports-section" aria-labelledby="reports-title">
      <span className="eyebrow">COMPARTILHAR E RESTAURAR</span>
      <h2 id="reports-title" tabIndex={-1}>
        WhatsApp e JSON
      </h2>
      <p className="cards-description">
        Exporte a fatura selecionada ou guarde um backup completo. Nada é
        enviado automaticamente.
      </p>
      <div className="report-actions">
        <button
          disabled={!hasContext}
          className="primary"
          onClick={() =>
            void present(
              "Relatório para WhatsApp",
              whatsappReport(data, personId, reference),
              true,
            )
          }
        >
          Copiar para WhatsApp
        </button>
        <button disabled={!hasInvoice} onClick={() => showInvoice(true)}>
          Copiar JSON da fatura
        </button>
        <button disabled={!hasInvoice} onClick={() => showInvoice(false)}>
          Ver JSON da fatura
        </button>
        <button
          onClick={() =>
            void present(
              "Backup completo JSON",
              JSON.stringify(canonicalData(data), null, 2),
              true,
            )
          }
        >
          Copiar backup completo
        </button>
      </div>
      {!hasInvoice && (
        <p className="cards-description">
          Para exportar o JSON de uma fatura, crie ou selecione uma fatura
          existente.
        </p>
      )}
      {output && (
        <div className="report-output">
          <label htmlFor="report-output">{output.title}</label>
          <textarea
            id="report-output"
            ref={outputRef}
            readOnly
            value={output.text}
            rows={10}
          />
          <div className="report-actions">
            <button
              onClick={() => {
                outputRef.current?.focus();
                outputRef.current?.select();
                setNotice(
                  "Texto selecionado. Use o comando de copiar do seu dispositivo.",
                );
              }}
            >
              Selecionar texto
            </button>
            <button onClick={() => setOutput(null)}>Fechar prévia</button>
          </div>
        </div>
      )}
      <div className="import-panel">
        <h3>Importar JSON</h3>
        <label htmlFor="import-json">
          Cole o JSON de uma fatura ou backup completo
        </label>
        <textarea
          id="import-json"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            invalidate();
          }}
          rows={6}
          placeholder='{"schemaVersion": 1, ...}'
          spellCheck={false}
        />
        <div className="import-options">
          <div>
            <label htmlFor="import-mode">Compras das faturas importadas</label>
            <select
              id="import-mode"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as ImportMode);
                invalidate();
              }}
            >
              <option value="merge">
                Mesclar por ID (sem duplicar IDs iguais)
              </option>
              <option value="replace">
                Substituir somente as faturas importadas
              </option>
            </select>
          </div>
          <div>
            <label htmlFor="import-names">Se o mesmo ID tiver outro nome</label>
            <select
              id="import-names"
              value={names}
              onChange={(e) => {
                setNames(e.target.value as NamePolicy);
                invalidate();
              }}
            >
              <option value="local">Manter nomes atuais</option>
              <option value="incoming">
                Usar nomes do JSON em todo o histórico
              </option>
            </select>
          </div>
        </div>
        <p className="cards-description">
          Mesclar mantém compras atuais e adiciona IDs novos. Substituir remove
          as compras atuais apenas das pessoas/meses presentes no JSON. Outros
          períodos permanecem. Nomes iguais com IDs diferentes precisam ser
          corrigidos antes da importação.
        </p>
        <button disabled={!source.trim() || !writable} onClick={review}>
          Validar e visualizar impacto
        </button>
        {preview && (
          <div className="import-preview">
            <h3>Confira antes de confirmar</h3>
            <p>
              {preview.incoming.people.length} pessoa(s) ·{" "}
              {preview.incoming.cards.length} cartão(ões) ·{" "}
              {preview.plan.invoiceCount} fatura(s) ·{" "}
              {preview.incoming.purchases.length} compra(s) no JSON.
            </p>
            <p>
              {preview.plan.added} compra(s) a gravar · {preview.plan.unchanged}{" "}
              já idênticas · {preview.plan.removed} compra(s) atuais removidas
              pelo modo substituir.
            </p>
            <ul>
              {preview.incoming.invoices.map((f) => {
                const summary = selectInvoiceSummary(
                  preview.plan.data,
                  f.personId,
                  f.reference,
                );
                return (
                  <li key={f.id}>
                    {
                      preview.plan.data.people.find((p) => p.id === f.personId)
                        ?.name
                    }{" "}
                    · {formatReference(f.reference)} ({f.reference}):{" "}
                    {summary.purchaseCount} compra(s), total após importar{" "}
                    {formatCents(summary.totalCents)}
                  </li>
                );
              })}
            </ul>
            {preview.plan.conflicts.length > 0 && (
              <div>
                <strong>
                  Conflitos de nomes —{" "}
                  {names === "local"
                    ? "manter nomes atuais"
                    : "usar nomes do JSON globalmente"}
                  :
                </strong>
                <ul>
                  {preview.plan.conflicts.map((text, index) => (
                    <li key={index}>{text}</li>
                  ))}
                </ul>
              </div>
            )}
            <label className="import-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              Revisei as faturas, o modo de importação e o impacto sobre os
              nomes. Confirmo aplicar estas alterações.
            </label>
            <div className="report-actions">
              <button
                className="primary"
                disabled={!confirmed || !writable}
                onClick={apply}
              >
                Confirmar importação
              </button>
              <button
                onClick={() => {
                  setPreview(null);
                  setConfirmed(false);
                  setNotice("Importação cancelada. Nenhum dado foi alterado.");
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <p className="card-notice" role="status">
        {notice}
      </p>
    </section>
  );
}

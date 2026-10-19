import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement } from "react";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://anotar-valores.test",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle,
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});
Object.defineProperty(dom.window.HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => {},
});
// JSDOM does not implement dialog methods or the browser's native focus trap.
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
  this.querySelector<HTMLElement>("[autofocus]")?.focus();
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
  this.dispatchEvent(new dom.window.Event("close"));
};
const { render, screen, within, cleanup, fireEvent } =
  await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { App } = await import("../src/components/App");
const { STORAGE_KEY } = await import("../src/services/storage");
let copied = "";
const user = () => userEvent.setup({ document: dom.window.document });
beforeEach(() => {
  window.localStorage.clear();
  copied = "";
});
afterEach(() => cleanup());
async function start() {
  const u = user();
  render(createElement(App));
  await u.click(screen.getByRole("button", { name: "+ Nova pessoa" }));
  await u.type(screen.getByLabelText("Cadastrar pessoa"), "Ana");
  await u.click(screen.getByRole("button", { name: "Salvar" }));
  fireEvent.change(screen.getByLabelText("Mês da fatura"), {
    target: { value: "2026-10" },
  });
  await u.click(screen.getByRole("button", { name: "+ Novo cartão" }));
  await u.type(screen.getByLabelText("Nome ou apelido do cartão"), "Roxo");
  await u.click(screen.getByRole("button", { name: "Salvar cartão" }));
  return u;
}
async function add(
  u: ReturnType<typeof user>,
  description: string,
  amount: string,
) {
  await u.type(screen.getByLabelText("Descrição"), description);
  await u.type(screen.getByLabelText("Valor na fatura (R$)"), amount);
  await u.click(screen.getByRole("button", { name: "Adicionar compra" }));
}
test("fluxo completo da interface: cadastro, parcelas, renomeação, recarga, WhatsApp e restauração JSON", async () => {
  const u = await start();
  await u.type(screen.getByLabelText("Descrição"), "Mercado");
  await u.type(screen.getByLabelText("Valor na fatura (R$)"), "134,90");
  await u.click(screen.getByLabelText("Parcelada"));
  await u.type(screen.getByLabelText("Parcela atual"), "2");
  await u.type(screen.getByLabelText("Total de parcelas"), "5");
  await u.click(screen.getByRole("button", { name: "Adicionar compra" }));
  assert.equal(document.activeElement, screen.getByLabelText("Descrição"));
  assert.equal(
    (screen.getByLabelText("Descrição") as HTMLInputElement).value,
    "",
  );
  assert.equal(
    (screen.getByLabelText("Cartão", { exact: true }) as HTMLSelectElement)
      .selectedOptions[0].text,
    "Roxo",
  );
  await add(u, "Farmácia", "120,00");
  await u.click(screen.getByRole("button", { name: "Renomear cartão Roxo" }));
  await u.clear(screen.getByLabelText("Novo nome do cartão"));
  await u.type(screen.getByLabelText("Novo nome do cartão"), "Verde");
  await u.click(screen.getByRole("button", { name: "Salvar cartão" }));
  const saved = window.localStorage.getItem(STORAGE_KEY)!;
  cleanup();
  render(createElement(App));
  fireEvent.change(screen.getByLabelText("Mês da fatura"), {
    target: { value: "2026-10" },
  });
  assert.ok(screen.getByText("Parcela 2/5"));
  assert.ok(screen.getAllByText("R$ 254,90").length >= 1);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        copied = text;
      },
    },
  });
  await u.click(screen.getByRole("button", { name: "Copiar para WhatsApp" }));
  assert.ok(screen.getByText("Relatório para WhatsApp copiado."));
  assert.ok(
    copied.includes("*Verde*") &&
      copied.includes("(2/5)") &&
      copied.includes("*Total geral: R$ 254,90*"),
  );
  await u.click(screen.getByRole("button", { name: "Copiar JSON da fatura" }));
  const exported = copied;
  assert.equal(JSON.parse(exported).purchases.length, 2);
  cleanup();
  window.localStorage.clear();
  render(createElement(App));
  fireEvent.change(
    screen.getByLabelText("Cole o JSON de uma fatura ou backup completo"),
    { target: { value: exported } },
  );
  await u.click(
    screen.getByRole("button", { name: "Validar e visualizar impacto" }),
  );
  assert.equal(window.localStorage.getItem(STORAGE_KEY), null);
  await u.click(screen.getByRole("checkbox"));
  await u.click(screen.getByRole("button", { name: "Confirmar importação" }));
  assert.ok(
    screen.getByText("Importação concluída. Dados e totais atualizados."),
  );
  assert.deepEqual(
    JSON.parse(window.localStorage.getItem(STORAGE_KEY)!),
    JSON.parse(saved),
  );
});
test("editar e excluir com cancelamento preservam contexto e totais; filtros isolam meses", async () => {
  const u = await start();
  await add(u, "Teste", "10,00");
  assert.equal(
    document.querySelector(".card-item-count")?.textContent,
    "1 item",
  );
  const snapshot = window.localStorage.getItem(STORAGE_KEY);
  await u.click(screen.getByRole("button", { name: "Editar compra Teste" }));
  await u.clear(screen.getByLabelText("Descrição"));
  await u.type(screen.getByLabelText("Descrição"), "Cancelar");
  await u.click(screen.getByRole("button", { name: "Cancelar edição" }));
  assert.equal(window.localStorage.getItem(STORAGE_KEY), snapshot);
  await u.click(screen.getByRole("button", { name: "Editar compra Teste" }));
  await u.clear(screen.getByLabelText("Valor na fatura (R$)"));
  await u.type(screen.getByLabelText("Valor na fatura (R$)"), "0,30");
  await u.click(screen.getByRole("button", { name: "Salvar alterações" }));
  assert.ok(screen.getAllByText("R$ 0,30").length >= 1);
  fireEvent.change(screen.getByLabelText("Mês da fatura"), {
    target: { value: "2026-11" },
  });
  assert.equal(
    screen.queryByRole("button", { name: "Editar compra Teste" }),
    null,
  );
  assert.ok(screen.getAllByText("R$ 0,00").length >= 1);
  assert.equal(
    document.querySelector(".card-item-count")?.textContent,
    "0 itens",
  );
  fireEvent.change(screen.getByLabelText("Mês da fatura"), {
    target: { value: "2026-10" },
  });
  await u.click(screen.getByRole("button", { name: "Excluir compra Teste" }));
  await u.click(screen.getByRole("button", { name: "Cancelar" }));
  assert.ok(screen.getByText("Teste", { exact: true }));
  await u.click(screen.getByRole("button", { name: "Excluir compra Teste" }));
  await u.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
  assert.equal(
    JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).purchases.length,
    0,
  );
});
test("cartões respondem ao teclado e subtotal muda de posição sem mutar dados", async () => {
  const u = await start();
  await add(u, "Item", "0,30");
  const before = window.localStorage.getItem(STORAGE_KEY);
  const toggle = screen.getByRole("button", { name: /Roxo/, expanded: true });
  const panel = toggle.closest("article")!;
  assert.ok(within(panel).getByText("Subtotal"));
  assert.equal(panel.querySelector(".card-item-count")?.textContent, "1 item");
  toggle.focus();
  await u.keyboard("{Enter}");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(
    panel.querySelector(".card-header .card-item-count")?.textContent,
    "1 item",
  );
  assert.equal(
    panel.querySelector(".card-subtotal")!.closest("[hidden]") !== null,
    true,
  );
  assert.equal(
    panel.querySelector(".card-header .card-amount")?.textContent,
    "R$ 0,30",
  );
  await u.click(screen.getByRole("button", { name: "Expandir todos" }));
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(panel.querySelector(".card-header .card-amount"), null);
  assert.equal(window.localStorage.getItem(STORAGE_KEY), before);
});
test("validação foca campo inválido e bloqueia gravação; falha de clipboard oferece seleção manual", async () => {
  const u = await start();
  const before = window.localStorage.getItem(STORAGE_KEY);
  await u.click(screen.getByRole("button", { name: "Adicionar compra" }));
  assert.equal(document.activeElement, screen.getByLabelText("Descrição"));
  assert.equal(window.localStorage.getItem(STORAGE_KEY), before);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async () => {
        throw new Error("Denied");
      },
    },
  });
  await u.click(screen.getByRole("button", { name: "Copiar para WhatsApp" }));
  assert.ok(screen.getByText(/Não foi possível copiar automaticamente/));
  assert.equal(screen.queryByText("Relatório para WhatsApp copiado."), null);
  await u.click(screen.getByRole("button", { name: "Selecionar texto" }));
  const output = screen.getByLabelText(
    "Relatório para WhatsApp",
  ) as HTMLTextAreaElement;
  assert.equal(document.activeElement, output);
  assert.equal(output.selectionEnd, output.value.length);
});
test("cancelar importação e alterar prévia não aplicam dados; corrupção mantém bloqueio", async () => {
  const u = await start();
  await add(u, "Original", "1,00");
  const before = window.localStorage.getItem(STORAGE_KEY)!;
  fireEvent.change(
    screen.getByLabelText("Cole o JSON de uma fatura ou backup completo"),
    { target: { value: before } },
  );
  await u.click(
    screen.getByRole("button", { name: "Validar e visualizar impacto" }),
  );
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Confirmar importação",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  await u.click(screen.getByRole("button", { name: "Cancelar" }));
  assert.equal(window.localStorage.getItem(STORAGE_KEY), before);
  await u.click(
    screen.getByRole("button", { name: "Validar e visualizar impacto" }),
  );
  fireEvent.change(screen.getByLabelText("Se o mesmo ID tiver outro nome"), {
    target: { value: "incoming" },
  });
  assert.equal(
    screen.queryByRole("button", { name: "Confirmar importação" }),
    null,
  );
  cleanup();
  window.localStorage.setItem(STORAGE_KEY, "{broken");
  render(createElement(App));
  assert.ok(screen.getByRole("alert"));
  assert.equal(
    (screen.getByRole("button", { name: "+ Nova pessoa" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  assert.equal(window.localStorage.getItem(STORAGE_KEY), "{broken");
});
test("exclusão de cartão exige confirmação e bloqueia histórico de qualquer mês", async () => {
  const u = await start();
  await add(u, "Histórico", "0,01");
  fireEvent.change(screen.getByLabelText("Mês da fatura"), {
    target: { value: "2026-11" },
  });
  const before = window.localStorage.getItem(STORAGE_KEY);
  await u.click(screen.getByRole("button", { name: "Excluir cartão Roxo" }));
  assert.ok(screen.getByText(/Exclusão bloqueada:/));
  assert.equal(
    screen.queryByRole("button", { name: "Confirmar exclusão" }),
    null,
  );
  await u.click(screen.getByRole("button", { name: "Fechar" }));
  assert.equal(window.localStorage.getItem(STORAGE_KEY), before);
  await u.click(screen.getByRole("button", { name: "+ Novo cartão" }));
  await u.type(
    screen.getByLabelText("Nome ou apelido do cartão"),
    "Sem compras",
  );
  await u.click(screen.getByRole("button", { name: "Salvar cartão" }));
  await u.click(
    screen.getByRole("button", { name: "Excluir cartão Sem compras" }),
  );
  await u.click(screen.getByRole("button", { name: "Cancelar" }));
  assert.ok(screen.getByRole("button", { name: "Excluir cartão Sem compras" }));
  await u.click(
    screen.getByRole("button", { name: "Excluir cartão Sem compras" }),
  );
  await u.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
  assert.equal(
    screen.queryByRole("button", { name: "Excluir cartão Sem compras" }),
    null,
  );
  assert.equal(
    JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).purchases.length,
    1,
  );
});

test("tema: sistema, escolha manual, recarga e armazenamento indisponível", async () => {
  const { THEME_KEY } = await import("../src/components/ThemeSelector");
  const listeners = new Set<() => void>();
  const media = {
    matches: true,
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  };
  const original = window.matchMedia;
  window.matchMedia = (() => media) as unknown as typeof window.matchMedia;
  try {
    const u = user();
    render(createElement(App));
    assert.equal(document.documentElement.dataset.theme, "dark");
    const { act } = await import("@testing-library/react");
    act(() => {
      media.matches = false;
      listeners.forEach((listener) => listener());
    });
    assert.equal(document.documentElement.dataset.theme, "light");
    await u.click(screen.getByRole("button", { name: "Abrir menu" }));
    await u.selectOptions(screen.getByLabelText("Tema"), "dark");
    assert.equal(document.documentElement.dataset.theme, "dark");
    assert.equal(window.localStorage.getItem(THEME_KEY), "dark");
    act(() => listeners.forEach((listener) => listener()));
    assert.equal(document.documentElement.dataset.theme, "dark");
    cleanup();
    assert.equal(listeners.size, 0);
    render(createElement(App));
    await u.click(screen.getByRole("button", { name: "Abrir menu" }));
    assert.equal(
      (screen.getByLabelText("Tema") as HTMLSelectElement).value,
      "dark",
    );
    await u.selectOptions(screen.getByLabelText("Tema"), "system");
    assert.equal(document.documentElement.dataset.theme, "light");
    window.localStorage.setItem(THEME_KEY, "dark");
    act(() =>
      window.dispatchEvent(
        new window.StorageEvent("storage", { key: THEME_KEY }),
      ),
    );
    assert.equal(document.documentElement.dataset.theme, "dark");
    cleanup();
    const prototype = Object.getPrototypeOf(window.localStorage);
    const getItem = prototype.getItem;
    const setItem = prototype.setItem;
    prototype.getItem = () => {
      throw new Error("Blocked");
    };
    prototype.setItem = () => {
      throw new Error("Blocked");
    };
    try {
      render(createElement(App));
      await u.click(screen.getByRole("button", { name: "Abrir menu" }));
      await u.selectOptions(screen.getByLabelText("Tema"), "dark");
      assert.equal(document.documentElement.dataset.theme, "dark");
    } finally {
      prototype.getItem = getItem;
      prototype.setItem = setItem;
    }
  } finally {
    cleanup();
    window.matchMedia = original;
  }
});

test("menu: contexto, navegação, fechamento, restauração do foco e ações reais da fatura", async () => {
  const u = await start();
  await add(u, "Compra do menu", "15,00");
  const snapshot = window.localStorage.getItem(STORAGE_KEY);
  const trigger = screen.getByRole("button", { name: "Abrir menu" });
  await u.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Menu" });
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(document.body.style.overflow, "hidden");
  assert.ok(within(dialog).getByText("Ana · outubro de 2026"));
  await u.click(
    within(dialog).getByRole("button", { name: "Pessoas e faturas" }),
  );
  assert.equal(document.activeElement, screen.getByLabelText("Pessoa"));
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(document.body.style.overflow, "");
  await u.click(trigger);
  await u.click(screen.getByRole("button", { name: "Fechar menu" }));
  assert.equal(document.activeElement, trigger);
  await u.click(trigger);
  fireEvent(dialog, new dom.window.Event("cancel", { cancelable: true }));
  assert.equal(document.activeElement, trigger);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        copied = value;
      },
    },
  });
  await u.click(trigger);
  await u.click(
    within(dialog).getByRole("button", { name: "Copiar para WhatsApp" }),
  );
  assert.ok(copied.includes("Compra do menu") && copied.includes("15,00"));
  assert.ok(screen.getByText("Relatório para WhatsApp copiado."));
  await u.click(trigger);
  await u.click(
    within(dialog).getByRole("button", { name: "Copiar JSON da fatura" }),
  );
  assert.equal(JSON.parse(copied).purchases.length, 1);
  await u.click(trigger);
  await u.click(within(dialog).getByRole("button", { name: "Importar JSON" }));
  assert.equal(
    document.activeElement,
    screen.getByLabelText("Cole o JSON de uma fatura ou backup completo"),
  );
  assert.equal(window.localStorage.getItem(STORAGE_KEY), snapshot);
});

test("menu: opções sem contexto ficam desabilitadas e backup continua disponível", async () => {
  const u = user();
  render(createElement(App));
  await u.click(screen.getByRole("button", { name: "Abrir menu" }));
  const menu = within(screen.getByRole("dialog", { name: "Menu" }));
  for (const name of [
    "Histórico de faturas",
    "Copiar para WhatsApp",
    "Copiar JSON da fatura",
    "Ver JSON da fatura",
  ]) {
    assert.equal(
      (menu.getByRole("button", { name }) as HTMLButtonElement).disabled,
      true,
    );
  }
  assert.equal(
    (
      menu.getByRole("button", {
        name: "Copiar backup completo",
      }) as HTMLButtonElement
    ).disabled,
    false,
  );
});

test("atalho de nova compra encerra edição sem modificar a compra original", async () => {
  const u = await start();
  await add(u, "Original", "25,00");
  const snapshot = window.localStorage.getItem(STORAGE_KEY);
  await u.click(screen.getByRole("button", { name: "Editar compra Original" }));
  await u.clear(screen.getByLabelText("Descrição"));
  await u.type(screen.getByLabelText("Descrição"), "Rascunho não salvo");
  await u.click(screen.getByRole("button", { name: "+ Nova compra" }));
  assert.equal(document.activeElement, screen.getByLabelText("Descrição"));
  assert.equal(
    (screen.getByLabelText("Descrição") as HTMLInputElement).value,
    "",
  );
  assert.equal(window.localStorage.getItem(STORAGE_KEY), snapshot);
  assert.ok(screen.getByRole("button", { name: "Adicionar compra" }));
});

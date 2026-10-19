# Anotar Valores

Aplicação para registrar compras de outras pessoas em cartões compartilhados, com páginas separadas acessíveis pelo menu lateral. MVP v1.0 em React, TypeScript e Vite.

## Funcionalidades

- Cadastro e renomeação de pessoas e cartões com IDs estáveis.
- Faturas independentes por pessoa e mês/ano.
- Compras à vista ou parceladas, edição e exclusão confirmada.
- Cartões expansíveis, subtotais e total geral em centavos exatos.
- Relatório para copiar no WhatsApp.
- JSON da fatura ou backup completo, com importação validada e confirmação.
- Páginas independentes de Fatura, Pessoas, Cartões, Histórico, WhatsApp, Exportar JSON, Backup, Importar JSON e Aparência.

## Navegação

O menu abre a página escolhida e exibe apenas os controles daquela área. O cadastro de cartões fica em **Cartões**; os lançamentos, parcelas, contadores e totais ficam em **Fatura atual**. As páginas de WhatsApp e JSON têm botões próprios para copiar; abrir uma página não copia nem importa dados automaticamente.

As rotas usam `#/fatura`, `#/pessoas`, `#/cartoes`, `#/historico`, `#/whatsapp`, `#/exportar`, `#/backup`, `#/importar` e `#/aparencia`, compatíveis com GitHub Pages sem configuração adicional. Pessoa e competência selecionadas são preservadas nos parâmetros da rota (`pessoa` e `mes`), inclusive ao recarregar e usar Voltar/Avançar. Acessar um link em outro dispositivo não transfere os registros: use o backup JSON.

## Executar localmente

Requer Node.js 24 e npm.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
npm run format:check
```

O build produz `dist/`. Os testes incluem domínio, persistência, isolamento das páginas, rotas, histórico de navegação e interface React em DOM simulado. Revisão visual e permissões reais de clipboard devem ser verificadas no navegador.

## GitHub Pages

1. Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**.
2. Em **Actions → Testar e publicar no GitHub Pages**, use **Run workflow** caso a execução inicial tenha ocorrido antes da ativação do Pages.
3. Consulte o endereço publicado no ambiente `github-pages` da execução concluída.

O workflow instala dependências, verifica formatação, executa testes e compila antes de publicar `dist`. Pushes para `main` publicam automaticamente. Pull requests apenas verificam o projeto.

O Vite está configurado com `base: "/anotar-valores/"` para este repositório. Se mudar o nome ou hospedar na raiz de um domínio, ajuste `base` em `vite.config.ts`.

## Dados e backups

Os registros ficam no **localStorage do navegador**, sem servidor ou sincronização entre dispositivos. Não são enviados ao GitHub. Use uma aba por vez; limpar o navegador ou usar navegação privada pode causar perda dos dados.

Ao mudar de endereço, copie o **backup completo JSON** no site anterior e importe no novo site. O armazenamento é separado por origem (domínio/protocolo/porta), não por caminho. Outros projetos no mesmo domínio GitHub Pages compartilham a origem; não devem reutilizar a chave `anotar-valores:data`.

A importação oferece mesclagem por ID ou substituição somente das compras das faturas presentes no JSON. Outros meses e pessoas permanecem. Conflitos de nomes têm escolha explícita; IDs que misturam históricos são bloqueados. Falhas de validação ou gravação não aplicam alterações parciais. Dados corrompidos ou de versão desconhecida bloqueiam gravações sem apagar o conteúdo original.

## Modelo JSON v1

`schemaVersion: 1` e coleções `people`, `cards`, `invoices`, `purchases`. Pessoas/cartões possuem `id` e `name`. Faturas têm `id`, `personId`, `reference` (`AAAA-MM`). Compras têm `id`, `invoiceId`, `cardId`, `description`, `amountCents` e `installment` (`null` ou `{ current, total }`).

`amountCents` é inteiro positivo seguro, com o valor desta fatura. Parcelas futuras não são geradas automaticamente. Totais são derivados, nunca persistidos. Preserve IDs para mesclar backups sem duplicar registros.

## Estrutura

- `src/components`: interface.
- `src/domain`: modelos, regras, cálculos, relatórios e importação.
- `src/hooks`: estado React e persistência.
- `src/services`: armazenamento local.
- `tests`: testes unitários e de integração.

### Aparência

O seletor **Tema**, na página **Aparência** do menu lateral, oferece **Sistema**, **Claro**, **Escuro**, **Rosa** e **Rosa Escuro**.
Por padrão, a aparência acompanha o sistema, inclusive quando ele muda durante
o uso. A escolha manual fica salva neste navegador e é sincronizada entre abas.
O tema é aplicado antes da interface carregar para evitar um clarão inicial.
Se o navegador bloquear o armazenamento, a troca continua funcionando na sessão.
A preferência visual é independente dos dados das faturas e dos backups JSON.

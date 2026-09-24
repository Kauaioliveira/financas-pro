import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Gerador das capturas de tela do README (docs/screenshots).
 *
 * Roda só com `npm run screenshots`: fica fora do `npm run test:e2e` e da CI.
 * O fluxo é o mesmo de um usuário real — cadastra a conta de demonstração,
 * confirma as palavras do kit, importa o extrato e a fatura de exemplo — então
 * as imagens provam que os fluxos funcionam, não só que as telas renderizam.
 *
 * Todos os dados são fictícios (e2e-screenshots/exemplos). A conta é criada do
 * zero no navegador do Playwright e some junto com ele.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const EXEMPLOS = join(AQUI, 'exemplos');
const SAIDA = join(AQUI, '..', 'docs', 'screenshots');

const EXTRATO = join(EXEMPLOS, 'extrato-neon-exemplo.csv');
const FATURA = join(EXEMPLOS, 'fatura-neon-mais-exemplo.csv');

// Data fixa: o app olha "hoje" para dizer se a fatura já fechou, e as capturas
// não podem mudar de mês a cada rodada. Com o relógio preso, rodar o gerador
// hoje ou daqui a um ano dá a mesma imagem.
const HOJE = new Date('2026-09-18T12:00:00-03:00');
// Mês mostrado nos painéis: tem fatura fechada (ciclo de agosto) e compras que
// ainda não viraram gasto (ciclo de setembro, que só vence em outubro).
const MES_EM_FOCO = '2026-09';

const CONTA = 'Conta Demonstração';
const SENHA = 'demonstracao-2026';

const CARTAO = {
  nome: 'Neon Mais',
  fechamento: '28',
  vencimento: '8',
};

/** Lê as 12 palavras na tela e digita as 3 que o app pede. */
async function confirmarPalavrasDoKit(page: Page) {
  await expect(page.locator('[data-kit-word]')).toHaveCount(12, { timeout: 15_000 });
  const palavras = await page.locator('[data-kit-word]').allInnerTexts();

  await page.getByRole('button', { name: /confirmar palavras/i }).click();

  const campos = page.getByRole('textbox', { name: /palavra nº/i });
  await expect(campos).toHaveCount(3);
  for (const campo of await campos.all()) {
    const posicao = Number(await campo.getAttribute('data-position'));
    await campo.fill(palavras[posicao - 1]);
  }
  await page.getByRole('button', { name: /confirmar e entrar/i }).click();
}

async function irParaAba(page: Page, nome: RegExp) {
  await page.locator('aside').getByRole('button', { name: nome }).click();
}

/**
 * Rola até o bloco começar logo abaixo do cabeçalho do app.
 *
 * `scrollIntoView` sozinho erra por dois motivos: a página tem duas áreas
 * roláveis aninhadas, e medir um cartão no meio da animação de entrada devolve
 * a posição de quem ainda está crescendo. Por isso espera a animação, mede e
 * corrige até assentar.
 */
async function trazerParaOTopo(alvo: Locator, folga = 16) {
  await alvo.page().waitForTimeout(1_200);
  await alvo.evaluate((elemento, folgaPx) => {
    elemento.scrollIntoView({ block: 'start' });

    for (let tentativa = 0; tentativa < 4; tentativa += 1) {
      const cabecalho = document.querySelector('header');
      const limite = (cabecalho?.getBoundingClientRect().bottom ?? 0) + folgaPx;
      const sobra = elemento.getBoundingClientRect().top - limite;
      if (Math.abs(sobra) < 2) break;

      let rolavel = elemento.parentElement;
      while (rolavel && rolavel.scrollHeight <= rolavel.clientHeight) rolavel = rolavel.parentElement;
      if (rolavel) rolavel.scrollTop += sobra;
      else window.scrollBy(0, sobra);
    }
  }, folga);
}

/**
 * Marca como paga a fatura de um mês. O extrato de exemplo tem o débito do
 * pagamento nas mesmas datas, então as duas telas contam a mesma história.
 */
async function marcarFaturaPaga(page: Page, mesDaFatura: RegExp) {
  await page.getByRole('button').filter({ hasText: mesDaFatura }).click();
  await page.getByRole('button', { name: /marcar como paga/i }).click();
  await expect(page.getByRole('button', { name: /marcar como pendente/i })).toBeVisible();
}

/** Espera o que estiver animando (fade-in, gráfico) antes de fotografar. */
async function capturar(page: Page, arquivo: string) {
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: join(SAIDA, arquivo), animations: 'disabled' });
}

test.describe('Capturas do README', () => {
  test('gera as cinco imagens com a conta de demonstração', async ({ page }) => {
    await page.clock.setFixedTime(HOJE);
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // --- Cadastro da conta de demonstração ---
    await expect(page.getByRole('heading', { name: /criar conta/i })).toBeVisible();
    await page.getByPlaceholder(/ex:/i).fill(CONTA);
    await page.getByPlaceholder(/crie uma senha/i).fill(SENHA);
    await page.getByPlaceholder(/repita a senha/i).fill(SENHA);
    await page.getByRole('button', { name: /criar conta/i }).click();

    // A frase deste kit é gerada agora e morre com o navegador de teste.
    await expect(page.getByRole('heading', { name: /kit de recupera/i })).toBeVisible();
    await expect(page.locator('[data-kit-word]')).toHaveCount(12, { timeout: 15_000 });
    await capturar(page, 'recovery-kit.png');

    await confirmarPalavrasDoKit(page);
    await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 15_000 });

    // --- Importação do extrato bancário ---
    await irParaAba(page, /importar extrato/i);
    await page.getByTitle('Escolher banco').click();
    await page.getByTitle('Selecionar Neon').click();
    await page.locator('input[aria-label="Selecionar arquivo para importar"]').setInputFiles(EXTRATO);

    const previaExtrato = page.getByRole('heading', { name: /pré-visualização/i });
    await expect(previaExtrato).toBeVisible({ timeout: 15_000 });
    // A graça da tela é a tabela categorizada, não a área de upload.
    await trazerParaOTopo(page.locator('.glass').filter({ has: previaExtrato }));
    await capturar(page, 'import.png');

    await page.getByRole('button', { name: /^importar$/i }).click();
    await expect(page.getByRole('status')).toContainText(/transações importadas/i);

    // --- Cadastro do cartão e importação da fatura ---
    await irParaAba(page, /cartão de crédito/i);
    await page.getByRole('button', { name: /importar fatura/i }).click();
    await page.getByRole('button', { name: /cadastrar cartão/i }).click();

    await page.getByPlaceholder(/ex: neon principal/i).fill(CARTAO.nome);
    await page.getByLabel(/dia de fechamento/i).fill(CARTAO.fechamento);
    await page.getByLabel(/dia de vencimento/i).fill(CARTAO.vencimento);
    await page.getByRole('button', { name: /salvar cart/i }).click();

    await page.locator('input[type="file"]').first().setInputFiles(FATURA);
    const confirmarFatura = page.getByRole('button', { name: /confirmar importação/i });
    await expect(confirmarFatura).toBeVisible({ timeout: 15_000 });
    await confirmarFatura.click();
    await expect(page.getByRole('status')).toContainText(/compras importadas/i);

    await page.getByRole('button', { name: /fechar importação/i }).click();

    // Os três pagamentos que já aparecem no extrato importado.
    await marcarFaturaPaga(page, /fatura de julho de 2026/i);
    await marcarFaturaPaga(page, /fatura de agosto de 2026/i);
    await marcarFaturaPaga(page, /fatura de setembro de 2026/i);
    await page.getByRole('button').filter({ hasText: /fatura de setembro de 2026/i }).click();

    await page.locator('select.dashboard-select').selectOption(MES_EM_FOCO);
    await trazerParaOTopo(page.locator('section').filter({ hasText: /onde a fatura pesa/i }).first());
    await capturar(page, 'credit-card.png');

    // --- Painel ---
    await irParaAba(page, /dashboard/i);
    await page.locator('select.dashboard-select').selectOption(MES_EM_FOCO);
    await capturar(page, 'dashboard.png');

    // --- Login (a conta já existe, então a tela mostra o estado real) ---
    await page.getByTitle('Sair').click();
    await expect(page.getByRole('heading', { name: /entrar/i })).toBeVisible();
    await capturar(page, 'login.png');
  });
});

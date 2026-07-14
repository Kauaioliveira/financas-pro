export type BankCategory = 'Digitais' | 'Carteiras' | 'Tradicionais' | 'Outros';

export type BankInfo = {
  id: string;
  name: string;
  category: BankCategory;
  color: string;
  letter: string;
};

// Lista inicial. Você pode ir adicionando mais bancos aqui.
export const BANKS: BankInfo[] = [
  { id: 'neon', name: 'Neon', category: 'Digitais', color: '#00c8ff', letter: 'N' },
  { id: 'mercado_pago', name: 'Mercado Pago', category: 'Carteiras', color: '#009ee3', letter: 'MP' },
  { id: 'banrisul', name: 'Banrisul', category: 'Tradicionais', color: '#004a93', letter: 'B' },
  { id: 'nubank', name: 'Nubank', category: 'Digitais', color: '#8a05be', letter: 'Nu' },
  { id: 'itau', name: 'Itaú', category: 'Tradicionais', color: '#ff6a00', letter: 'I' },
  { id: 'bradesco', name: 'Bradesco', category: 'Tradicionais', color: '#cc092f', letter: 'Br' },
  { id: 'santander', name: 'Santander', category: 'Tradicionais', color: '#ec0000', letter: 'S' },
  { id: 'caixa', name: 'Caixa', category: 'Tradicionais', color: '#005ca9', letter: 'CX' },
  { id: 'bb', name: 'Banco do Brasil', category: 'Tradicionais', color: '#f2d600', letter: 'BB' },
];


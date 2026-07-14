import { useMemo, useState } from 'react';
import type { CategoryRule } from '../types';
import { useFinance } from '../context/useFinance';
import { Plus, Trash2, Save, RefreshCw, CheckCircle, AlertTriangle, Download } from 'lucide-react';

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const COMMON_CATEGORIES = [
  'Mercado',
  'Alimentação',
  'Transporte',
  'Saúde',
  'Moradia',
  'Internet',
  'Telefone',
  'Entretenimento',
  'Investimentos',
  'Entrada',
  'Outros',
];

const DEFAULT_RULES: Omit<CategoryRule, 'id'>[] = [
  { matchText: 'reserva por gastos emergências', category: 'Investimentos', enabled: true },
  { matchText: 'leka leleka', category: 'Mercado', enabled: true },
  { matchText: 'viezzer e cia', category: 'Mercado', enabled: true },
  { matchText: 'alsomartsupermerc', category: 'Mercado', enabled: true },
  { matchText: 'macromix', category: 'Mercado', enabled: true },
];

export function CategoryRules() {
  const { reapplyCategories, rules: contextRules, setRules: saveContextRules } = useFinance();
  const [rules, setRules] = useState<CategoryRule[]>(() => contextRules);
  const [savedMsg, setSavedMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const hasInvalid = useMemo(
    () => rules.some(r => r.enabled && (!r.matchText.trim() || !r.category.trim())),
    [rules]
  );

  function addRule() {
    setRules(prev => [
      {
        id: newId(),
        matchText: '',
        category: 'Mercado',
        enabled: true,
      },
      ...prev,
    ]);
    setSavedMsg('');
    setErrorMsg('');
  }

  function removeRule(id: string) {
    setRules(prev => prev.filter(r => r.id !== id));
    setSavedMsg('');
    setErrorMsg('');
  }

  function updateRule(id: string, patch: Partial<CategoryRule>) {
    setRules(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
    setSavedMsg('');
    setErrorMsg('');
  }

  function saveAll() {
    setSavedMsg('');
    setErrorMsg('');

    const cleaned = rules.map(r => ({
      ...r,
      matchText: r.matchText.trim(),
      category: r.category.trim(),
    }));

    if (cleaned.some(r => r.enabled && (!r.matchText || !r.category))) {
      setErrorMsg('Preencha “Texto para procurar” e “Categoria” nas regras ativas.');
      return;
    }

    saveContextRules(cleaned);
    setRules(cleaned);
    setSavedMsg('Regras salvas no cofre.');
    setTimeout(() => setSavedMsg(''), 2500);
  }

  function importDefaultRules() {
    setSavedMsg('');
    setErrorMsg('');

    const existing = rules;
    const existingMatches = new Set(
      existing.map(r => (r.matchText || '').toLowerCase().trim()).filter(Boolean)
    );

    const toAdd: CategoryRule[] = DEFAULT_RULES
      .filter(r => !existingMatches.has(r.matchText.toLowerCase().trim()))
      .map(r => ({ ...r, id: newId() }));

    const merged = [...toAdd, ...existing];
    saveContextRules(merged);
    setRules(merged);
    setSavedMsg(
      toAdd.length === 0
        ? 'As regras prontas já estavam cadastradas.'
        : `Regras prontas importadas (${toAdd.length}).`
    );
    setTimeout(() => setSavedMsg(''), 2500);
  }

  function applyRulesNow() {
    setSavedMsg('');
    setErrorMsg('');

    const cleaned = rules.map(r => ({
      ...r,
      matchText: r.matchText.trim(),
      category: r.category.trim(),
    }));

    if (cleaned.some(r => r.enabled && (!r.matchText || !r.category))) {
      setErrorMsg('Preencha "Texto para procurar" e "Categoria" nas regras ativas antes de aplicar.');
      return;
    }

    saveContextRules(cleaned);
    setRules(cleaned);
    reapplyCategories();
    setSavedMsg('Regras salvas e aplicadas nas transações existentes.');
    setTimeout(() => setSavedMsg(''), 2500);
  }

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-4 sm:mb-6 animate-fade-in">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800">Regras de Categoria</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Aqui você cadastra frases/palavras que, quando aparecem na descrição, definem a categoria automaticamente.
            Ex: <strong>“macromix”</strong> → <strong>Mercado</strong>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={importDefaultRules}
            className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl glass font-semibold cursor-pointer flex items-center gap-2 text-sm"
            title="Importar regras prontas"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Regras prontas</span>
            <span className="sm:hidden">Prontas</span>
          </button>
          <button
            onClick={addRule}
            className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-white font-semibold shadow-lg shadow-primary-500/20 hover:shadow-xl cursor-pointer flex items-center gap-2 text-sm"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            title="Adicionar regra"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova regra</span>
            <span className="sm:hidden">Nova</span>
          </button>
          <button
            onClick={saveAll}
            disabled={rules.length === 0 || hasInvalid}
            className="px-4 py-2.5 rounded-xl glass font-semibold cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Salvar regras"
          >
            <Save className="w-4 h-4 text-slate-500" />
            Salvar
          </button>
          <button
            onClick={applyRulesNow}
            disabled={rules.length === 0 || hasInvalid}
            className="px-4 py-2.5 rounded-xl glass font-semibold cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Salvar e aplicar nas transações já importadas"
          >
            <RefreshCw className="w-4 h-4 text-slate-500" />
            Aplicar
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="animate-scale-in rounded-2xl p-4 mb-5 flex items-start gap-3"
          style={{ background: 'linear-gradient(135deg, #fef2f2, #fee2e2)' }}
        >
          <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
          <p className="text-sm font-semibold text-red-700">{errorMsg}</p>
        </div>
      )}

      {savedMsg && (
        <div className="animate-scale-in rounded-2xl p-4 mb-5 flex items-start gap-3"
          style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)' }}
        >
          <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
          <p className="text-sm font-semibold text-emerald-700">{savedMsg}</p>
        </div>
      )}

      <div className="glass rounded-2xl overflow-hidden">
        {rules.length === 0 ? (
          <div className="p-6 sm:p-10 text-center text-slate-500">
            <p className="font-semibold">Nenhuma regra cadastrada ainda.</p>
            <p className="text-sm mt-1">Clique em “Nova regra” para começar.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100/60">
            {rules.map((rule, idx) => (
              <div key={rule.id} className="p-3 sm:p-5 hover:bg-white/20 transition-colors">
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-extrabold text-xs">
                    {idx + 1}
                  </div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-6">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                        Texto para procurar
                      </label>
                      <input
                        value={rule.matchText}
                        onChange={e => updateRule(rule.id, { matchText: e.target.value })}
                        placeholder='Ex: "macromix"'
                        className="mt-1 w-full px-4 py-2.5 rounded-xl bg-white/60 border border-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Dica: não precisa ser igualzinho — basta ser um pedaço do texto.
                      </p>
                    </div>
                    <div className="md:col-span-4">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                        Categoria
                      </label>
                      <input
                        list="categories"
                        value={rule.category}
                        onChange={e => updateRule(rule.id, { category: e.target.value })}
                        placeholder="Ex: Mercado"
                        className="mt-1 w-full px-4 py-2.5 rounded-xl bg-white/60 border border-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <datalist id="categories">
                        {COMMON_CATEGORIES.map(c => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                    <div className="md:col-span-2 flex items-end gap-2">
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={e => updateRule(rule.id, { enabled: e.target.checked })}
                          className="w-4 h-4 rounded"
                        />
                        Ativa
                      </label>
                    </div>
                  </div>
                  <button
                    onClick={() => removeRule(rule.id)}
                    className="p-2 rounded-xl glass text-slate-400 hover:text-red-500 cursor-pointer"
                    title="Remover regra"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 text-sm text-slate-500">
        <p className="font-semibold">Como funciona:</p>
        <ul className="mt-2 space-y-1">
          <li>- Se a descrição contiver o texto da regra (não diferencia maiúsculas/minúsculas), a categoria é aplicada.</li>
          <li>- As regras desta tela têm prioridade máxima, acima das regras automáticas.</li>
          <li>- Use “Aplicar” para recategorizar transações que já estão salvas.</li>
        </ul>
      </div>
    </div>
  );
}


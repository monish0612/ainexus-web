import { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Segmented } from '@/components/ui/primitives';
import { Bank, BankCardType, useSettingsStore } from '@/store/settingsStore';

const CARD_TYPE_OPTIONS: { value: BankCardType; label: string }[] = [
  { value: 'DB', label: 'Debit' },
  { value: 'CC', label: 'Credit' },
  { value: 'Cash', label: 'Cash' },
];

const CARD_TYPE_LABELS: Record<string, string> = {
  DB: 'Debit',
  CC: 'Credit',
  Cash: 'Cash',
};

function clampDay(v: number): number {
  if (!Number.isFinite(v)) return 1;
  if (v < 1) return 31;
  if (v > 31) return 1;
  return Math.trunc(v);
}

interface DraftState {
  id: string | null; // null = creating
  name: string;
  cardType: BankCardType;
  statementDay: number;
  dueDay: number;
}

function BankEditor({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: DraftState;
  onChange: (d: DraftState) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isCc = draft.cardType === 'CC';
  const nameInvalid = draft.name.trim() === '';
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-bg2 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-fg">
          {draft.id ? 'Edit card' : 'Add bank / card'}
        </p>
        <button
          onClick={onCancel}
          className="rounded-full p-1 text-fg3 hover:bg-bg3 hover:text-fg"
        >
          <X size={16} />
        </button>
      </div>

      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-fg3">Bank name</p>
        <input
          className="input"
          value={draft.name}
          placeholder="e.g. HDFC"
          autoFocus
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-fg3">Card type</p>
        <Segmented<BankCardType>
          value={draft.cardType}
          onChange={(v) => onChange({ ...draft, cardType: v })}
          options={CARD_TYPE_OPTIONS}
        />
      </div>

      {isCc && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs font-medium text-fg3">Statement day</p>
              <input
                type="number"
                min={1}
                max={31}
                className="input"
                value={draft.statementDay}
                onChange={(e) =>
                  onChange({ ...draft, statementDay: clampDay(Number(e.target.value)) })
                }
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-fg3">Due day</p>
              <input
                type="number"
                min={1}
                max={31}
                className="input"
                value={draft.dueDay}
                onChange={(e) =>
                  onChange({ ...draft, dueDay: clampDay(Number(e.target.value)) })
                }
              />
            </div>
          </div>
          <p className="text-xs text-fg4">
            Statement closes on the statement day; the bill is due on the due day of the
            following month.
          </p>
        </div>
      )}

      <button
        onClick={onSave}
        disabled={nameInvalid}
        className="mt-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {draft.id ? 'Save changes' : 'Add card'}
      </button>
    </div>
  );
}

function BankRow({
  bank,
  onEdit,
  onDelete,
}: {
  bank: Bank;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isCc = bank.cardType === 'CC';
  const cycle =
    isCc && bank.statementDay != null && bank.dueDay != null
      ? `Statement ${bank.statementDay} · Due ${bank.dueDay}`
      : isCc
        ? 'Set statement & due dates'
        : null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-bg2 px-3 py-2.5">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: bank.color }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-bold text-fg">{bank.name}</span>
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
              isCc ? 'bg-amber-500/20 text-amber-500' : 'bg-bg3 text-fg3'
            }`}
          >
            {CARD_TYPE_LABELS[bank.cardType ?? 'DB']}
          </span>
        </div>
        {cycle && <p className="truncate text-xs text-fg4">{cycle}</p>}
      </div>
      <button
        onClick={onEdit}
        className="rounded-lg p-1.5 text-fg3 hover:bg-bg3 hover:text-fg"
        aria-label="Edit"
      >
        <Pencil size={15} />
      </button>
      <button
        onClick={onDelete}
        className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-500/10"
        aria-label="Delete"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export function BanksSection() {
  const banks = useSettingsStore((s) => s.banks);
  const addBank = useSettingsStore((s) => s.addBank);
  const updateBank = useSettingsStore((s) => s.updateBank);
  const deleteBank = useSettingsStore((s) => s.deleteBank);
  const [draft, setDraft] = useState<DraftState | null>(null);

  function startAdd() {
    setDraft({ id: null, name: '', cardType: 'DB', statementDay: 1, dueDay: 1 });
  }

  function startEdit(b: Bank) {
    setDraft({
      id: b.id,
      name: b.name,
      cardType: b.cardType ?? 'DB',
      statementDay: b.statementDay ?? 1,
      dueDay: b.dueDay ?? 1,
    });
  }

  function save() {
    if (!draft || draft.name.trim() === '') return;
    const isCc = draft.cardType === 'CC';
    const opts = {
      cardType: draft.cardType,
      statementDay: isCc ? draft.statementDay : undefined,
      dueDay: isCc ? draft.dueDay : undefined,
    };
    if (draft.id) {
      updateBank(draft.id, { name: draft.name, ...opts });
    } else {
      addBank(draft.name, opts);
    }
    setDraft(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-fg3">Banks &amp; Cards</h3>
        <p className="mt-0.5 text-xs text-fg4">
          Manage the cards you log expenses against. Set each credit card&apos;s statement &amp;
          due dates to power the repayment forecast. Syncs across all your devices.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {banks.length === 0 && (
          <p className="py-1 text-sm text-fg4">No banks yet — add your first card below.</p>
        )}
        {banks.map((b) => (
          <BankRow
            key={b.id}
            bank={b}
            onEdit={() => startEdit(b)}
            onDelete={() => deleteBank(b.id)}
          />
        ))}
      </div>

      {draft ? (
        <BankEditor
          draft={draft}
          onChange={setDraft}
          onSave={save}
          onCancel={() => setDraft(null)}
        />
      ) : (
        <button
          onClick={startAdd}
          className="flex items-center justify-center gap-2 rounded-xl border border-accent/25 bg-accent/10 py-2.5 text-sm font-bold text-accent"
        >
          <Plus size={16} /> Add bank / card
        </button>
      )}
    </div>
  );
}

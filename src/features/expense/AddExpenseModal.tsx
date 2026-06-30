import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ScanLine, Sparkles, Upload } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, Segmented, Spinner } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import {
  CARD_TYPES,
  CARD_TYPE_LABELS,
  EXPENSE_BANKS,
  EXPENSE_CATEGORIES,
  categoryColor,
  categoryIcon,
} from '@/lib/constants';
import { toNaiveLocalIso, uuid, safeParseDate } from '@/lib/format';
import { apiErrorMessage } from '@/lib/api/client';
import { categorize, smartParseImage } from '@/lib/api/ai';
import { Expense } from '@/lib/api/expense';
import { useSettingsStore, type Bank } from '@/store/settingsStore';
import { cardBillTimingFor } from '@/lib/creditCardForecast';
import { CalendarClock } from 'lucide-react';
import { categorizeLocal } from './categorize';
import { fileToReceiptPayload } from './receipt';
import { useUpsertExpense } from './hooks';
import { teachLearnings } from '@/lib/api/expense';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Expense | null;
}

type Mode = 'manual' | 'scan';

function todayLocalDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function AddExpenseModal({ open, onClose, editing }: Props) {
  const upsert = useUpsertExpense();
  const banks = useSettingsStore((s) => s.banks);
  const bankNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const b of banks) {
      if (!seen.has(b.name)) {
        seen.add(b.name);
        out.push(b.name);
      }
    }
    return out.length ? out : [...EXPENSE_BANKS];
  }, [banks]);

  // Card types configured for a given bank name (falls back to the legacy rule
  // when the bank has no config: CASH ⇒ Cash only, otherwise DB/CC).
  const allowedCardTypes = useMemo(
    () =>
      (bankName: string): string[] => {
        const configs = banks.filter(
          (b) => b.name.toLowerCase() === bankName.toLowerCase(),
        );
        if (configs.length) {
          const set = new Set(configs.map((b) => b.cardType ?? 'DB'));
          return CARD_TYPES.filter((t) => set.has(t));
        }
        if (bankName.toUpperCase() === 'CASH') return ['Cash'];
        return ['DB', 'CC'];
      },
    [banks],
  );

  const [mode, setMode] = useState<Mode>('manual');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Others');
  const [bank, setBank] = useState<string>('HDFC');
  const [cardType, setCardType] = useState<string>('DB');
  const [date, setDate] = useState(todayLocalDate());
  const [comments, setComments] = useState('');
  const [manualCat, setManualCat] = useState(false);
  const [teachAi, setTeachAi] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [catLoading, setCatLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset / hydrate when opened.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setMode('manual');
      setAmount(String(editing.amount));
      setDescription(editing.description);
      setCategory(editing.category);
      setBank(editing.bank || 'HDFC');
      setCardType(editing.cardType || 'DB');
      setDate((editing.date || '').slice(0, 10) || todayLocalDate());
      setComments(editing.comments || '');
      setManualCat(!!editing.isManualCategory);
    } else {
      setMode('manual');
      setAmount('');
      setDescription('');
      setCategory('Others');
      setBank('HDFC');
      setCardType('DB');
      setDate(todayLocalDate());
      setComments('');
      setManualCat(false);
      setTeachAi(false);
    }
  }, [open, editing]);

  // Keep the selected payment type valid for the chosen bank: auto-select when
  // the bank exposes exactly one type, else fall back to a configured one.
  useEffect(() => {
    const allowed = allowedCardTypes(bank);
    if (allowed.length === 1) {
      if (cardType !== allowed[0]) setCardType(allowed[0]);
    } else if (!allowed.includes(cardType)) {
      setCardType(allowed.includes('DB') ? 'DB' : allowed[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank, banks]);

  // Live categorize (local first, debounced AI fallback) while typing.
  useEffect(() => {
    if (manualCat || editing) return;
    const local = categorizeLocal(description);
    if (local) {
      setCategory(local);
      return;
    }
    if (description.trim().length < 4) return;
    const handle = setTimeout(async () => {
      setCatLoading(true);
      try {
        const res = await categorize(description.trim());
        if (!manualCat && res.category) setCategory(res.category);
      } catch {
        /* keep current */
      } finally {
        setCatLoading(false);
      }
    }, 700);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, manualCat]);

  const valid = useMemo(
    () => parseFloat(amount) > 0 && description.trim().length > 0,
    [amount, description],
  );

  async function onScanFile(file: File) {
    setScanning(true);
    try {
      const payload = await fileToReceiptPayload(file);
      const result = await smartParseImage(payload.base64, payload.mediaType);
      setAmount(result.amount ? String(result.amount) : '');
      setDescription(result.description || '');
      if (result.category) setCategory(result.category);
      if (result.bank) setBank(result.bank.toUpperCase());
      if (result.cardType) setCardType(result.cardType);
      setMode('manual');
      toast.success('Receipt scanned — review and save');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not read the receipt'));
    } finally {
      setScanning(false);
    }
  }

  async function onSave() {
    if (!valid) return;
    const expense: Expense = {
      id: editing?.id ?? uuid(),
      amount: parseFloat(amount),
      description: description.trim(),
      category,
      bank,
      cardType,
      date: editing
        ? `${date}T${(editing.date || '').slice(11) || '00:00:00'}`
        : toNaiveLocalIso(new Date(`${date}T${new Date().toTimeString().slice(0, 8)}`)),
      isManualCategory: manualCat,
      comments: comments.trim(),
    };
    await upsert.mutateAsync(expense);
    if (teachAi && manualCat) {
      teachLearnings(expense.description, category).catch(() => {});
    }
    toast.success(editing ? 'Expense updated' : 'Expense added');
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Expense' : 'Add Expense'}
      variant="sheet"
      maxWidth="max-w-xl"
    >
      <div className="flex flex-col gap-5 p-5">
        {!editing && (
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'manual', label: 'Manual' },
              {
                value: 'scan',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <ScanLine size={15} /> Scan
                  </span>
                ),
              },
            ]}
          />
        )}

        {mode === 'scan' && !editing ? (
          <ScanDropzone scanning={scanning} onFile={onScanFile} fileRef={fileRef} />
        ) : (
          <>
            {/* Amount */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fg3">
                Amount
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-fg3">
                  ₹
                </span>
                <input
                  className="input py-4 pl-10 text-2xl font-bold"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  autoFocus
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fg3">
                Description
              </label>
              <input
                className="input"
                placeholder="e.g. Swiggy order, Uber ride"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Category */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-fg3">
                  Category
                </label>
                {catLoading && (
                  <span className="flex items-center gap-1.5 text-xs text-fg3">
                    <Spinner size={12} /> AI categorizing…
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {EXPENSE_CATEGORIES.map((c) => {
                  const active = c === category;
                  return (
                    <button
                      key={c}
                      onClick={() => {
                        setCategory(c);
                        setManualCat(true);
                      }}
                      className="relative flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-left text-sm font-medium transition"
                      style={{
                        borderColor: active ? categoryColor(c) : 'var(--border)',
                        background: active ? `${categoryColor(c)}22` : 'var(--bg2)',
                        color: active ? 'var(--text)' : 'var(--text2)',
                      }}
                    >
                      <span>{categoryIcon(c)}</span>
                      <span className="truncate">{c}</span>
                    </button>
                  );
                })}
              </div>
              {manualCat && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-fg2">
                  <input
                    type="checkbox"
                    checked={teachAi}
                    onChange={(e) => setTeachAi(e.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  <Sparkles size={14} className="text-accent" /> Teach AI this category
                </label>
              )}
            </div>

            {/* Bank + Card type */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fg3">
                  Bank / Source
                </label>
                <div className="flex flex-wrap gap-2">
                  {bankNames.map((b) => (
                    <button
                      key={b}
                      onClick={() => setBank(b)}
                      className={`pill border ${
                        bank === b
                          ? 'border-accent bg-accent/15 text-fg'
                          : 'border-line bg-bg2 text-fg2'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fg3">
                  Payment
                </label>
                <Segmented
                  value={cardType}
                  onChange={setCardType}
                  options={allowedCardTypes(bank).map((t) => ({
                    value: t,
                    label: CARD_TYPE_LABELS[t],
                  }))}
                />
              </div>
            </div>

            <CcRepaymentHint bank={bank} cardType={cardType} date={date} banks={banks} />

            {/* Date + comments */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fg3">
                  Date
                </label>
                <input
                  type="date"
                  className="input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fg3">
                  Note (optional)
                </label>
                <input
                  className="input"
                  placeholder="Add a note"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                />
              </div>
            </div>

            <motion.div layout className="flex gap-3 pt-1">
              <Button variant="ghost" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={onSave}
                loading={upsert.isPending}
                disabled={!valid}
                className="flex-1"
              >
                {editing ? 'Save changes' : 'Add expense'}
              </Button>
            </motion.div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** At log time, tells the user which salary repays a credit-card charge. */
function CcRepaymentHint({
  bank,
  cardType,
  date,
  banks,
}: {
  bank: string;
  cardType: string;
  date: string;
  banks: Bank[];
}) {
  if (cardType !== 'CC') return null;
  const cfg = banks.find(
    (b) =>
      b.name.toLowerCase() === bank.toLowerCase() &&
      b.cardType === 'CC' &&
      b.statementDay != null &&
      b.dueDay != null,
  );
  if (!cfg) return null;
  const parsed = safeParseDate(`${date}T00:00:00`) ?? new Date();
  const timing = cardBillTimingFor(parsed, cfg.statementDay as number, cfg.dueDay as number);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-violet-400/30 bg-violet-400/10 px-3.5 py-3">
      <CalendarClock size={18} className="mt-0.5 shrink-0 text-violet-400" />
      <div>
        <p className="text-sm font-bold text-violet-400">
          Repaid from your {timing.salaryMonthLabel} salary
        </p>
        <p className="text-xs text-fg3">
          {bank} statement closes {fmt(timing.statementClose)}, bill due {fmt(timing.dueDate)}.
        </p>
      </div>
    </div>
  );
}

function ScanDropzone({
  scanning,
  onFile,
  fileRef,
}: {
  scanning: boolean;
  onFile: (f: File) => void;
  fileRef: React.RefObject<HTMLInputElement>;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div className="py-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        onClick={() => !scanning && fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
          drag ? 'border-accent bg-accent/10' : 'border-line bg-bg2 hover:bg-bg3'
        }`}
      >
        {scanning ? (
          <>
            <div className="relative grid h-16 w-16 place-items-center">
              <div className="absolute inset-0 animate-ping rounded-2xl bg-accent/30" />
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white">
                <Sparkles size={28} />
              </div>
            </div>
            <div>
              <p className="font-semibold text-fg">Reading your receipt…</p>
              <p className="text-sm text-fg3">AI is extracting the amount & merchant</p>
            </div>
          </>
        ) : (
          <>
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-bg3 text-accent">
              <Upload size={28} />
            </div>
            <div>
              <p className="font-semibold text-fg">Drop a receipt or bill</p>
              <p className="text-sm text-fg3">
                Image or PDF — we’ll read the amount, merchant & category
              </p>
            </div>
            <span className="btn-accent pointer-events-none mt-1 px-5 py-2.5 text-sm">
              Choose file
            </span>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

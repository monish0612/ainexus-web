import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { PageHeader, SubTabs } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/primitives';
import { Expense } from '@/lib/api/expense';
import { TrackerTab } from './TrackerTab';
import { InsightsTab } from './InsightsTab';
import { AddExpenseModal } from './AddExpenseModal';
import { AskAiSheet } from './AskAiSheet';

type Tab = 'tracker' | 'insights';

export default function ExpensePage() {
  const [tab, setTab] = useState<Tab>('tracker');
  const [modalOpen, setModalOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (e: Expense) => {
    setEditing(e);
    setModalOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Expenses"
        subtitle="Track spending, scan receipts, see insights"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setAskOpen(true)}
              className="px-3 py-2 text-sm sm:px-4"
            >
              <Sparkles size={18} /> <span className="hidden sm:inline">Ask AI</span>
            </Button>
            <Button onClick={openAdd} className="px-3 py-2 text-sm sm:px-4">
              <Plus size={18} /> <span className="hidden sm:inline">Add</span>
            </Button>
          </div>
        }
        tabs={
          <SubTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'tracker', label: 'Tracker' },
              { value: 'insights', label: 'Insights' },
            ]}
          />
        }
      />

      <div className="flex-1">
        {tab === 'tracker' ? <TrackerTab onEdit={openEdit} /> : <InsightsTab />}
      </div>

      <AddExpenseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
      />

      <AskAiSheet open={askOpen} onClose={() => setAskOpen(false)} />
    </div>
  );
}

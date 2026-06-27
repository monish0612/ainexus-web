import { useState } from 'react';
import { PageHeader, SubTabs } from '@/components/layout/PageHeader';
import { InsightAITab } from './InsightAITab';
import { RephraseTab } from './RephraseTab';
import { CoachTab } from './CoachTab';
import { DictionaryTab } from './DictionaryTab';

type Tab = 'insight' | 'rephrase' | 'coach' | 'dictionary';

export default function TutorPage() {
  const [tab, setTab] = useState<Tab>('insight');

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="AI Tutor"
        subtitle="Research, rephrase, coach & dictionary"
        tabs={
          <SubTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'insight', label: 'InsightAI' },
              { value: 'rephrase', label: 'Rephrase' },
              { value: 'coach', label: 'Coach' },
              { value: 'dictionary', label: 'Dictionary' },
            ]}
          />
        }
      />
      <div className="flex-1 overflow-y-auto">
        {tab === 'insight' && <InsightAITab />}
        {tab === 'rephrase' && <RephraseTab />}
        {tab === 'coach' && <CoachTab />}
        {tab === 'dictionary' && <DictionaryTab />}
      </div>
    </div>
  );
}

import { ChipGroup } from '@/components/ui/SegmentedControl';

export type WhenOffset = '0' | '15' | '30' | '60' | '120';

const OPTIONS: { value: WhenOffset; label: string }[] = [
  { value: '0', label: 'Now' },
  { value: '15', label: '15 min ago' },
  { value: '30', label: '30 min ago' },
  { value: '60', label: '1 h ago' },
  { value: '120', label: '2 h ago' },
];

export function WhenPicker({ value, onChange }: { value: WhenOffset; onChange: (v: WhenOffset) => void }) {
  return <ChipGroup<WhenOffset> value={value} onChange={onChange} options={OPTIONS} />;
}

export const timestampFor = (offset: WhenOffset) => new Date(Date.now() - Number(offset) * 60000).toISOString();

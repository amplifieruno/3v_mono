import { FC } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { XIcon } from 'lucide-react';
import { RuleCondition } from '../lib/conditionsToWhere';
import { ruleFields } from '../data/ruleFields';

interface RuleRowProps {
  rule: RuleCondition;
  onChange: (rule: RuleCondition) => void;
  onRemove: () => void;
}

export const RuleRow: FC<RuleRowProps> = ({ rule, onChange, onRemove }) => {
  const fieldDef = ruleFields.find((f) => f.key === rule.field);
  const operators = fieldDef?.operators ?? [];
  const needsValue =
    rule.operator !== 'is_true' &&
    rule.operator !== 'is_false' &&
    rule.operator !== 'is_not_empty' &&
    rule.operator !== 'is_empty';

  return (
    <div className='flex items-center gap-2'>
      <Select
        value={rule.field}
        onValueChange={(v) => {
          const newFieldDef = ruleFields.find((f) => f.key === v);
          const newOp = newFieldDef?.operators[0]?.value ?? 'equals';
          onChange({ field: v, operator: newOp, value: null });
        }}
      >
        <SelectTrigger className='w-[160px]'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ruleFields.map((f) => (
            <SelectItem key={f.key} value={f.key}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={rule.operator}
        onValueChange={(v) => onChange({ ...rule, operator: v })}
      >
        <SelectTrigger className='w-[140px]'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {needsValue && (
        <>
          {fieldDef?.type === 'select' && fieldDef.options ? (
            <Select
              value={rule.value ?? ''}
              onValueChange={(v) => onChange({ ...rule, value: v })}
            >
              <SelectTrigger className='w-[140px]'>
                <SelectValue placeholder='Select...' />
              </SelectTrigger>
              <SelectContent>
                {fieldDef.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : fieldDef?.type === 'date' ? (
            <Input
              type={rule.operator === 'last_n_days' ? 'number' : 'date'}
              value={rule.value ?? ''}
              onChange={(e) => onChange({ ...rule, value: e.target.value })}
              className='w-[160px]'
              placeholder={rule.operator === 'last_n_days' ? 'Days' : ''}
            />
          ) : (
            <Input
              type='text'
              value={rule.value ?? ''}
              onChange={(e) => onChange({ ...rule, value: e.target.value })}
              className='w-[160px]'
              placeholder='Value'
            />
          )}
        </>
      )}

      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='h-8 w-8 shrink-0'
        onClick={onRemove}
      >
        <XIcon className='h-4 w-4' />
      </Button>
    </div>
  );
};

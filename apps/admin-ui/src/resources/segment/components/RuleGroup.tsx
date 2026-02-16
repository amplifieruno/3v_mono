import { FC } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PlusIcon, FolderPlusIcon, XIcon } from 'lucide-react';
import {
  RuleGroup as RuleGroupType,
  RuleCondition,
  isRuleGroup,
  createEmptyRule,
  createEmptyGroup,
} from '../lib/conditionsToWhere';
import { RuleRow } from './RuleRow';

interface RuleGroupProps {
  group: RuleGroupType;
  onChange: (group: RuleGroupType) => void;
  onRemove?: () => void;
  depth?: number;
}

export const RuleGroupComponent: FC<RuleGroupProps> = ({
  group,
  onChange,
  onRemove,
  depth = 0,
}) => {
  const updateRule = (index: number, updated: RuleCondition | RuleGroupType) => {
    const newRules = [...group.rules];
    newRules[index] = updated;
    onChange({ ...group, rules: newRules });
  };

  const removeRule = (index: number) => {
    const newRules = group.rules.filter((_, i) => i !== index);
    onChange({ ...group, rules: newRules });
  };

  const addRule = () => {
    onChange({ ...group, rules: [...group.rules, createEmptyRule()] });
  };

  const addGroup = () => {
    const newGroup = createEmptyGroup();
    newGroup.operator = group.operator === 'AND' ? 'OR' : 'AND';
    onChange({ ...group, rules: [...group.rules, newGroup] });
  };

  return (
    <Card className={depth > 0 ? 'border-dashed' : ''}>
      <CardContent className='pt-4 pb-3'>
        <div className='flex items-center gap-2 mb-3'>
          <Select
            value={group.operator}
            onValueChange={(v) =>
              onChange({ ...group, operator: v as 'AND' | 'OR' })
            }
          >
            <SelectTrigger className='w-[80px] h-7 text-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='AND'>AND</SelectItem>
              <SelectItem value='OR'>OR</SelectItem>
            </SelectContent>
          </Select>
          <span className='text-xs text-muted-foreground'>
            Match {group.operator === 'AND' ? 'all' : 'any'} of the following:
          </span>
          {onRemove && (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='h-6 w-6 ml-auto'
              onClick={onRemove}
            >
              <XIcon className='h-3 w-3' />
            </Button>
          )}
        </div>

        <div className='space-y-2'>
          {group.rules.map((rule, index) =>
            isRuleGroup(rule) ? (
              <RuleGroupComponent
                key={index}
                group={rule}
                onChange={(updated) => updateRule(index, updated)}
                onRemove={() => removeRule(index)}
                depth={depth + 1}
              />
            ) : (
              <RuleRow
                key={index}
                rule={rule}
                onChange={(updated) => updateRule(index, updated)}
                onRemove={() => removeRule(index)}
              />
            ),
          )}
        </div>

        <div className='flex gap-2 mt-3'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={addRule}
          >
            <PlusIcon className='h-3 w-3 mr-1' />
            Rule
          </Button>
          {depth < 2 && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={addGroup}
            >
              <FolderPlusIcon className='h-3 w-3 mr-1' />
              Group
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

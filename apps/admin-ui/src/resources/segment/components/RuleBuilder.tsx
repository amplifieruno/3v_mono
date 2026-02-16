import { FC } from 'react';
import { RuleGroup, createEmptyGroup } from '../lib/conditionsToWhere';
import { RuleGroupComponent } from './RuleGroup';

interface RuleBuilderProps {
  value: RuleGroup;
  onChange: (value: RuleGroup) => void;
}

export const RuleBuilder: FC<RuleBuilderProps> = ({ value, onChange }) => {
  const group = value?.rules ? value : createEmptyGroup();

  return (
    <div>
      <label className='text-sm font-medium mb-2 block'>Conditions</label>
      <RuleGroupComponent group={group} onChange={onChange} />
    </div>
  );
};

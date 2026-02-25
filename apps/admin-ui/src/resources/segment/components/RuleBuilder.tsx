import { FC } from 'react';
import { RuleGroup, createEmptyGroup } from '../lib/conditionsToWhere';
import { RuleGroupComponent } from './RuleGroup';
import { RuleFieldDef } from '../data/ruleFields';

interface RuleBuilderProps {
  value: RuleGroup;
  onChange: (value: RuleGroup) => void;
  fields?: RuleFieldDef[];
  label?: string;
}

export const RuleBuilder: FC<RuleBuilderProps> = ({ value, onChange, fields, label = 'Conditions' }) => {
  const group = value?.rules ? value : createEmptyGroup();

  return (
    <div>
      <label className='text-sm font-medium mb-2 block'>{label}</label>
      <RuleGroupComponent group={group} onChange={onChange} fields={fields} />
    </div>
  );
};

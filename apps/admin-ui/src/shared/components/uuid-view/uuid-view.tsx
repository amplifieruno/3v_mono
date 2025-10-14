import { useCopyToClipboard } from 'react-use';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CopyCheckIcon, CopyIcon } from 'lucide-react';
import { FC, MouseEvent, ReactNode, useEffect, useState } from 'react';

interface UuidViewProps {
  value?: string;
  render?: (value?: string) => ReactNode;
}

export const UuidView: FC<UuidViewProps> = (props) => {
  const { value, render } = props;
  const [copied, setCopied] = useState(false);
  const [, copyToClipboard] = useCopyToClipboard();

  const copy = (e: MouseEvent) => {
    e.stopPropagation();
    if (value) {
      copyToClipboard(value);
      setCopied(true);
    }
  };

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => {
        setCopied(false);
      }, 3000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [copied]);

  const Icon = copied ? CopyCheckIcon : CopyIcon;

  let short = value;
  if (value && value.length > 12) {
    short = `${value?.slice(0, 5)}...${value?.slice(-5)}`;
  }

  return (
    <Tooltip>
      <TooltipTrigger>{render ? render(short) : short}</TooltipTrigger>
      <TooltipContent side='right'>
        <div className='flex flex-row items-center gap-2'>
          <Icon size={14} className='cursor-pointer' onClick={copy} />
          {value}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

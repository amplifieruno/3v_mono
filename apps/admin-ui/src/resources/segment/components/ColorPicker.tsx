import { FC } from 'react';
import { presetColors } from '../data/enums';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export const ColorPicker: FC<ColorPickerProps> = ({ value, onChange }) => {
  return (
    <div>
      <label className='text-sm font-medium mb-2 block'>Color</label>
      <div className='flex gap-2 flex-wrap'>
        {presetColors.map((color) => (
          <button
            key={color}
            type='button'
            className='w-7 h-7 rounded-full border-2 transition-transform hover:scale-110'
            style={{
              backgroundColor: color,
              borderColor: value === color ? 'white' : 'transparent',
              boxShadow: value === color ? `0 0 0 2px ${color}` : 'none',
            }}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
    </div>
  );
};

import React, { useCallback } from 'react';

export interface CheckboxFieldProps {
  id: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export const CheckboxField: React.FC<CheckboxFieldProps> = ({
  id,
  label,
  value,
  onChange,
  description,
  disabled = false,
  className = '',
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.checked);
    },
    [onChange]
  );

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="flex items-center gap-2 cursor-pointer">
        <input
          id={id}
          type="checkbox"
          checked={value || false}
          onChange={handleChange}
          disabled={disabled}
          className="w-4 h-4 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-blue-500 focus:ring-blue-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      </label>
      {description && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 ml-6">{description}</p>
      )}
    </div>
  );
};

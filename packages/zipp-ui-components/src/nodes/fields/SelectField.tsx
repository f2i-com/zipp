import React, { useCallback } from 'react';

export interface SelectOption {
  value: string | number;
  label: string;
  description?: string;
}

export interface SelectFieldProps {
  id: string;
  label: string;
  value: string | number | undefined;
  onChange: (value: string | number) => void;
  options: SelectOption[];
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = 'Select...',
  description,
  disabled = false,
  required = false,
  className = '',
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedOption = options.find(opt => String(opt.value) === e.target.value);
      if (selectedOption) {
        onChange(selectedOption.value);
      }
    },
    [onChange, options]
  );

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
        {required && <span className="text-red-500 dark:text-red-400 ml-1">*</span>}
      </label>
      <select
        id={id}
        value={value !== undefined ? String(value) : ''}
        onChange={handleChange}
        disabled={disabled}
        className="w-full px-2 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {placeholder && (
          <option value="" className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)} className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">
            {option.label}
          </option>
        ))}
      </select>
      {description && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400">{description}</p>
      )}
    </div>
  );
};

import React, { useCallback } from 'react';

export interface MultiSelectOption {
    value: string | number;
    label: string;
    description?: string;
}

export interface MultiSelectFieldProps {
    id: string;
    label: string;
    value: (string | number)[] | undefined;
    onChange: (value: (string | number)[]) => void;
    options: MultiSelectOption[];
    placeholder?: string;
    description?: string;
    disabled?: boolean;
    required?: boolean;
    className?: string;
    rows?: number;
}

export const MultiSelectField: React.FC<MultiSelectFieldProps> = ({
    id,
    label,
    value,
    onChange,
    options,
    description,
    disabled = false,
    required = false,
    className = '',
    rows = 4,
}) => {
    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            const selectedValues = Array.from(e.target.selectedOptions).map(opt => opt.value);

            // Map back to original values to preserve types (number vs string)
            const newValues = options
                .filter(opt => selectedValues.includes(String(opt.value)))
                .map(opt => opt.value);

            onChange(newValues);
        },
        [onChange, options]
    );

    // Convert current values to strings for the select element
    const selectedStrings = (value || []).map(v => String(v));

    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            <label htmlFor={id} className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {label}
                {required && <span className="text-red-500 dark:text-red-400 ml-1">*</span>}
            </label>
            <select
                id={id}
                multiple
                value={selectedStrings}
                onChange={handleChange}
                disabled={disabled}
                size={rows}
                className="w-full px-2 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed custom-scrollbar"
            >
                {options.map((option) => (
                    <option key={String(option.value)} value={String(option.value)} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white py-1">
                        {option.label}
                    </option>
                ))}
            </select>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 italic">Hold Ctrl/Cmd to select multiple</div>
            {description && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400">{description}</p>
            )}
        </div>
    );
};

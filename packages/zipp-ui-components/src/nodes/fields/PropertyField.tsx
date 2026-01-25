import React, { useMemo } from 'react';
import type { PropertyDefinition, PropertyCondition } from 'zipp-core';
import { TextField } from './TextField';
import { TextAreaField } from './TextAreaField';
import { NumberField } from './NumberField';
import { SelectField } from './SelectField';
import { MultiSelectField } from './MultiSelectField';
import { CheckboxField } from './CheckboxField';
import { SecretField } from './SecretField';
import { CodeField } from './CodeField';

export interface PropertyFieldProps {
  property: PropertyDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  allValues?: Record<string, unknown>;
  className?: string;
}

/**
 * Check if a property should be visible based on its condition
 * Supports two formats:
 * 1. PropertyCondition: { property: 'mode', equals: 'external' }
 * 2. Simple object: { mode: 'external' } (key is property, value is expected value)
 */
function shouldShowProperty(
  condition: PropertyCondition | Record<string, unknown> | undefined,
  allValues: Record<string, unknown>
): boolean {
  if (!condition) return true;

  // Check if it's the PropertyCondition format (has 'property' key)
  if ('property' in condition && typeof condition.property === 'string') {
    const typedCondition = condition as PropertyCondition;
    const targetValue = allValues[typedCondition.property];

    if (typedCondition.equals !== undefined) {
      return targetValue === typedCondition.equals;
    }

    if (typedCondition.notEquals !== undefined) {
      return targetValue !== typedCondition.notEquals;
    }

    if (typedCondition.in !== undefined) {
      return typedCondition.in.includes(targetValue);
    }

    return true;
  }

  // Simple object format: { mode: 'external', voice: 'custom' }
  // All conditions must match (AND logic)
  for (const [propName, expectedValue] of Object.entries(condition)) {
    const actualValue = allValues[propName];
    if (actualValue !== expectedValue) {
      return false;
    }
  }

  return true;
}

/**
 * PropertyField - Renders the appropriate field component based on property type
 */
export const PropertyField: React.FC<PropertyFieldProps> = ({
  property,
  value,
  onChange,
  allValues = {},
  className = '',
}) => {
  // Check visibility condition
  const isVisible = useMemo(
    () => shouldShowProperty(property.showIf, allValues),
    [property.showIf, allValues]
  );

  if (!isVisible || property.hidden) {
    return null;
  }

  const commonProps = {
    id: property.id,
    label: property.name,
    description: property.description,
    disabled: property.disabled,
    required: property.required,
    placeholder: property.placeholder,
    className,
  };

  switch (property.type) {
    case 'string':
    case 'text':
      return (
        <TextField
          {...commonProps}
          value={String(value ?? property.default ?? '')}
          onChange={onChange}
        />
      );

    case 'textarea':
      return (
        <TextAreaField
          {...commonProps}
          value={String(value ?? property.default ?? '')}
          onChange={onChange}
          rows={property.rows}
        />
      );

    case 'number':
      return (
        <NumberField
          {...commonProps}
          value={(value ?? property.default) as number | undefined}
          onChange={onChange}
          min={property.min}
          max={property.max}
          step={property.step}
        />
      );

    case 'boolean':
      return (
        <CheckboxField
          {...commonProps}
          value={Boolean(value ?? property.default ?? false)}
          onChange={onChange}
        />
      );

    case 'select':
      return (
        <SelectField
          {...commonProps}
          value={(value ?? property.default) as string | number | undefined}
          onChange={onChange}
          options={
            property.options?.map((opt) => ({
              value: opt.value as string | number,
              label: opt.label,
              description: opt.description,
            })) ?? []
          }
        />
      );

    case 'secret':
      return (
        <SecretField
          {...commonProps}
          value={String(value ?? property.default ?? '')}
          onChange={onChange}
        />
      );

    case 'code':
      return (
        <CodeField
          {...commonProps}
          value={String(value ?? property.default ?? '')}
          onChange={onChange}
          language={property.language}
          rows={property.rows}
        />
      );

    case 'json':
      return (
        <CodeField
          {...commonProps}
          value={
            typeof value === 'string'
              ? value
              : JSON.stringify(value ?? property.default ?? {}, null, 2)
          }
          onChange={(val) => {
            try {
              onChange(JSON.parse(val));
            } catch {
              onChange(val);
            }
          }}
          language="json"
          rows={property.rows || 4}
        />
      );

    case 'multiselect':
      return (
        <MultiSelectField
          {...commonProps}
          value={
            Array.isArray(value ?? property.default)
              ? ((value ?? property.default) as (string | number)[])
              : []
          }
          onChange={onChange}
          options={
            property.options?.map((opt) => ({
              value: opt.value as string | number,
              label: opt.label,
              description: opt.description,
            })) ?? []
          }
        />
      );

    case 'color':
      return (
        <div className={`flex flex-col gap-1 ${className}`}>
          <label htmlFor={property.id} className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {property.name}
          </label>
          <input
            id={property.id}
            type="color"
            value={String(value ?? property.default ?? '#000000')}
            onChange={(e) => onChange(e.target.value)}
            disabled={property.disabled}
            className="w-full h-8 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded cursor-pointer disabled:opacity-50"
          />
          {property.description && (
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{property.description}</p>
          )}
        </div>
      );

    case 'file':
      return (
        <div className={`flex flex-col gap-1 ${className}`}>
          <label htmlFor={property.id} className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {property.name}
          </label>
          <input
            id={property.id}
            type="file"
            accept={property.accept}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onChange(file.name);
              }
            }}
            disabled={property.disabled}
            className="w-full text-xs text-slate-600 dark:text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-slate-200 dark:file:bg-slate-700 file:text-slate-700 dark:file:text-slate-300 hover:file:bg-slate-300 dark:hover:file:bg-slate-600"
          />
          {property.description && (
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{property.description}</p>
          )}
        </div>
      );

    case 'array':
    case 'keyvalue':
      // Complex types - render as JSON for now
      return (
        <CodeField
          {...commonProps}
          value={
            typeof value === 'string'
              ? value
              : JSON.stringify(value ?? property.default ?? [], null, 2)
          }
          onChange={(val) => {
            try {
              onChange(JSON.parse(val));
            } catch {
              onChange(val);
            }
          }}
          language="json"
          rows={property.rows || 4}
        />
      );

    default:
      // Fallback to text field
      return (
        <TextField
          {...commonProps}
          value={String(value ?? property.default ?? '')}
          onChange={onChange}
        />
      );
  }
};

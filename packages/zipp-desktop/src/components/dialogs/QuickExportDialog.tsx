import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Flow } from 'zipp-core';
import type { FlowExportAnalysis } from 'zipp-core/src/package/flow-analyzer';

interface QuickExportDialogProps {
  isOpen: boolean;
  flow: Flow | null;
  analysis: FlowExportAnalysis | null;
  availableMacros?: Flow[];
  onExport: (options: ExportOptions) => Promise<void>;
  onCancel: () => void;
}

export interface ExportOptions {
  name: string;
  version: string;
  description: string;
  author: string;
  includeMacros: boolean;
  embedAssets: boolean;
  selectedMacros: string[];
  tags: string[];
}

export default function QuickExportDialog({
  isOpen,
  flow,
  analysis,
  availableMacros = [],
  onExport,
  onCancel,
}: QuickExportDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [includeMacros, setIncludeMacros] = useState(true);
  const [embedAssets, setEmbedAssets] = useState(true);
  const [selectedMacros, setSelectedMacros] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when flow changes
  useEffect(() => {
    if (flow && isOpen) {
      setName(flow.name || 'Untitled Package');
      setDescription(flow.macroMetadata?.description || '');
      setVersion('1.0.0');
      setError(null);

      // Pre-select all referenced macros
      if (analysis?.dependencies.macros) {
        const macroIds = new Set(analysis.dependencies.macros.map(m => m.id));
        setSelectedMacros(macroIds);
      }
    }
  }, [flow, analysis, isOpen]);

  // Focus name input when dialog opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExporting) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExporting, onCancel]);

  // Compute referenced macros from analysis
  const referencedMacros = useMemo(() => {
    if (!analysis) return [];
    return analysis.dependencies.macros.map(dep => {
      const macro = availableMacros.find(m => m.id === dep.id);
      return {
        id: dep.id,
        name: dep.name || macro?.name || dep.id,
        available: dep.available,
        usedBy: dep.usedBy,
      };
    });
  }, [analysis, availableMacros]);

  // Toggle macro selection
  const toggleMacro = (macroId: string) => {
    setSelectedMacros(prev => {
      const next = new Set(prev);
      if (next.has(macroId)) {
        next.delete(macroId);
      } else {
        next.add(macroId);
      }
      return next;
    });
  };

  // Handle export
  const handleExport = async () => {
    if (!name.trim()) {
      setError('Package name is required');
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      await onExport({
        name: name.trim(),
        version: version.trim() || '1.0.0',
        description: description.trim(),
        author: author.trim(),
        includeMacros,
        embedAssets,
        selectedMacros: Array.from(selectedMacros),
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen || !flow) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={isExporting ? undefined : onCancel}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-scaleIn"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex-shrink-0 p-2 rounded-full bg-purple-500/20">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div>
            <h3 id="export-dialog-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Export as Package
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create a distributable .zipp package from this flow
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
          {/* Package Name */}
          <div>
            <label htmlFor="package-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Package Name <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameInputRef}
              id="package-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Workflow Package"
              className="input w-full"
              disabled={isExporting}
            />
          </div>

          {/* Version */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="package-version" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Version
              </label>
              <input
                id="package-version"
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                className="input w-full"
                disabled={isExporting}
              />
            </div>
            <div>
              <label htmlFor="package-author" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Author
              </label>
              <input
                id="package-author"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Your name"
                className="input w-full"
                disabled={isExporting}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="package-description" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              id="package-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this workflow do?"
              rows={2}
              className="input w-full resize-none"
              disabled={isExporting}
            />
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="package-tags" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tags
            </label>
            <input
              id="package-tags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="ai, automation, image-processing"
              className="input w-full"
              disabled={isExporting}
            />
            <p className="text-xs text-slate-400 mt-1">Comma-separated keywords for discovery</p>
          </div>

          {/* Options */}
          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={embedAssets}
                onChange={(e) => setEmbedAssets(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500"
                disabled={isExporting}
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Embed local assets (images, files)
              </span>
              {analysis && analysis.assets.length > 0 && (
                <span className="text-xs px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-slate-500 dark:text-slate-400">
                  {analysis.assets.filter(a => !a.isRemote).length} files
                </span>
              )}
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeMacros}
                onChange={(e) => setIncludeMacros(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500"
                disabled={isExporting}
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Include referenced macros
              </span>
              {referencedMacros.length > 0 && (
                <span className="text-xs px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-slate-500 dark:text-slate-400">
                  {referencedMacros.length} macros
                </span>
              )}
            </label>
          </div>

          {/* Macro Selection */}
          {includeMacros && referencedMacros.length > 0 && (
            <div className="ml-7 space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Select which macros to include:
              </p>
              {referencedMacros.map((macro) => (
                <label key={macro.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMacros.has(macro.id)}
                    onChange={() => toggleMacro(macro.id)}
                    className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500"
                    disabled={isExporting || !macro.available}
                  />
                  <span className={`text-sm ${macro.available ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 line-through'}`}>
                    {macro.name}
                  </span>
                  {!macro.available && (
                    <span className="text-xs px-1.5 py-0.5 bg-red-500/20 rounded text-red-400">
                      Not found
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}

          {/* Warnings */}
          {analysis && analysis.warnings.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm font-medium text-amber-400">Warnings</span>
              </div>
              <ul className="space-y-1">
                {analysis.warnings.slice(0, 3).map((warning, i) => (
                  <li key={i} className="text-xs text-amber-300/80">
                    {warning.message}
                  </li>
                ))}
                {analysis.warnings.length > 3 && (
                  <li className="text-xs text-amber-400">
                    +{analysis.warnings.length - 3} more warnings
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Stats */}
          {analysis && (
            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
              <span>{analysis.stats.nodeCount} nodes</span>
              <span>{analysis.stats.edgeCount} connections</span>
              {analysis.stats.loopCount > 0 && <span>{analysis.stats.loopCount} loops</span>}
              <span className={`px-1.5 py-0.5 rounded ${
                analysis.stats.complexity === 'high' ? 'bg-red-500/20 text-red-400' :
                analysis.stats.complexity === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                'bg-green-500/20 text-green-400'
              }`}>
                {analysis.stats.complexity} complexity
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onCancel}
            className="btn btn-secondary btn-md"
            disabled={isExporting}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || !name.trim()}
            className="btn btn-primary btn-md flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export Package
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

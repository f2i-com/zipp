/**
 * Services Tab Component
 *
 * Manages local Python/Node.js services that provide specialized functionality.
 * Extracted from SettingsPanel.tsx for maintainability.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import type { ProjectConstant, ProjectSettings } from 'zipp-core';
import { useServices, useServiceOutput } from '../../../hooks/useServices';
import { CopyButton } from '../../ui/CopyButton';

// Service icon components (inline SVGs)
function ServiceIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const props = { className: className || 'w-5 h-5', style, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' };

  switch (name) {
    case 'music':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      );
    case 'mic':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      );
    case 'video':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case 'download':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      );
    case 'speech':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      );
  }
}

interface ServicesTabProps {
  isOpen: boolean;
  settings: ProjectSettings;
  constants: ProjectConstant[];
  onUpdateSettings: (updates: Partial<ProjectSettings>) => void;
}

const SERVICES_PER_PAGE = 5;

export default function ServicesTab({ isOpen, settings, constants, onUpdateSettings }: ServicesTabProps) {
  const {
    services,
    statuses,
    loading: servicesLoading,
    starting: servicesStarting,
    stopping: servicesStopping,
    updating: servicesUpdating,
    runningCount,
    startService,
    stopService,
    updateAllServices,
    loadServices,
  } = useServices({ autoRefresh: isOpen, refreshInterval: 3000 });

  // Update all services state
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{ current: string; index: number; total: number } | null>(null);
  const [updateResults, setUpdateResults] = useState<{ service_id: string; success: boolean; skipped: boolean; message: string }[] | null>(null);

  // Service output viewer state
  const [viewingOutputServiceId, setViewingOutputServiceId] = useState<string | null>(null);
  const { lines: outputLines, clearOutput, isStreaming } = useServiceOutput(viewingOutputServiceId);
  const outputContainerRef = useRef<HTMLDivElement>(null);

  // Services search and pagination state
  const [servicesSearchQuery, setServicesSearchQuery] = useState('');
  const [servicesPage, setServicesPage] = useState(1);

  // Filter services based on search
  const filteredServices = services.filter(service => {
    if (!servicesSearchQuery.trim()) return true;
    const query = servicesSearchQuery.toLowerCase();
    return (
      service.name.toLowerCase().includes(query) ||
      service.description.toLowerCase().includes(query) ||
      service.id.toLowerCase().includes(query)
    );
  });

  // Paginate filtered services
  const servicesTotalPages = Math.ceil(filteredServices.length / SERVICES_PER_PAGE);
  const paginatedServices = filteredServices.slice(
    (servicesPage - 1) * SERVICES_PER_PAGE,
    servicesPage * SERVICES_PER_PAGE
  );

  // Reset page when search changes
  useEffect(() => {
    setServicesPage(1);
  }, [servicesSearchQuery]);

  // Build environment variables from constants for services
  const serviceEnvVars = useMemo(() => {
    const envVars: Record<string, string> = {};
    for (const constant of constants) {
      // Include api_key constants (HF_TOKEN, etc.) as env vars for services
      if (constant.category === 'api_key' && constant.value) {
        envVars[constant.key] = constant.value;
      }
    }
    return envVars;
  }, [constants]);

  const handleUpdateAll = async () => {
    setIsUpdatingAll(true);
    setUpdateResults(null);
    setUpdateProgress(null);
    try {
      const results = await updateAllServices((serviceId, index, total) => {
        const service = services.find(s => s.id === serviceId);
        setUpdateProgress({ current: service?.name || serviceId, index, total });
      });
      setUpdateResults(results);
      setUpdateProgress(null);
    } finally {
      setIsUpdatingAll(false);
    }
  };

  // Auto-scroll output to bottom when new lines appear
  useEffect(() => {
    if (outputContainerRef.current && viewingOutputServiceId) {
      outputContainerRef.current.scrollTop = outputContainerRef.current.scrollHeight;
    }
  }, [outputLines, viewingOutputServiceId]);

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-slate-100/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-slate-400 text-sm">
            Services are local Python or Node.js servers that provide specialized functionality like speech-to-text,
            video processing, and more. Start a service to enable its features in your workflows.
          </p>
        </div>
      </div>

      {/* Header with Search and Refresh */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
            Available Services ({services.length})
            {runningCount > 0 && (
              <span className="px-1.5 py-0.5 bg-green-600/30 text-green-400 text-xs rounded-full ml-1">
                {runningCount} running
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleUpdateAll}
              disabled={isUpdatingAll || servicesLoading}
              className="btn btn-sm bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-600/30 flex items-center gap-2 disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${isUpdatingAll ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {isUpdatingAll ? 'Updating...' : 'Update All'}
            </button>
            <button
              onClick={loadServices}
              disabled={servicesLoading}
              className="btn btn-secondary btn-sm flex items-center gap-2"
            >
              <svg className={`w-4 h-4 ${servicesLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {servicesLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Search Box */}
        {services.length > 3 && (
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={servicesSearchQuery}
              onChange={(e) => setServicesSearchQuery(e.target.value)}
              placeholder="Search services..."
              className="w-full pl-10 pr-10 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            {servicesSearchQuery && (
              <button
                type="button"
                onClick={() => setServicesSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-400"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Update Progress / Results */}
      {(updateProgress || updateResults) && (
        <div className="bg-slate-100/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg p-4">
          {updateProgress && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <svg className="w-4 h-4 animate-spin text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Updating <strong>{updateProgress.current}</strong> ({updateProgress.index + 1}/{updateProgress.total})</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${((updateProgress.index) / updateProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          {updateResults && !updateProgress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  {updateResults.every(r => r.success) ? (
                    <>
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-green-400">All services updated successfully</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <span className="text-yellow-400">
                        {updateResults.filter(r => r.success).length}/{updateResults.length} updated,{' '}
                        {updateResults.filter(r => !r.success).length} failed
                      </span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setUpdateResults(null)}
                  className="text-slate-500 hover:text-slate-400 text-xs"
                >
                  Dismiss
                </button>
              </div>
              {updateResults.some(r => !r.success && !r.skipped) && (
                <div className="text-xs text-red-400 space-y-1 mt-1">
                  {updateResults.filter(r => !r.success && !r.skipped).map(r => (
                    <div key={r.service_id}>
                      <span className="font-medium">{r.service_id}:</span> {r.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Services List */}
      {services.length === 0 && !servicesLoading ? (
        <div className="bg-slate-100/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
          <svg className="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
          </svg>
          <p className="text-slate-400">No services found</p>
          <p className="text-slate-500 text-sm mt-1">
            Services are discovered from the plugins directory
          </p>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="bg-slate-100/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg p-6 text-center">
          <svg className="w-10 h-10 text-slate-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-slate-400">No services match "{servicesSearchQuery}"</p>
          <button
            onClick={() => setServicesSearchQuery('')}
            className="text-blue-400 hover:text-blue-300 text-sm mt-2"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedServices.map((service) => {
            const status = statuses[service.id];
            const isHealthy = status?.healthy ?? false;
            const isStarting = servicesStarting[service.id] ?? false;
            const isStopping = servicesStopping[service.id] ?? false;

            return (
              <div
                key={service.id}
                className={`rounded-lg p-4 border transition-colors ${
                  isHealthy
                    ? 'bg-green-100/50 dark:bg-green-900/20 border-green-500/30 dark:border-green-600/30'
                    : 'bg-slate-100/50 dark:bg-slate-700/30 border-slate-300 dark:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${service.color}20` }}
                    >
                      <ServiceIcon name={service.icon} className="w-5 h-5" style={{ color: service.color }} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-slate-700 dark:text-slate-200">{service.name}</h4>
                        {isHealthy && (
                          <span className="px-2 py-0.5 bg-green-600/30 text-green-400 text-xs rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                            Running
                          </span>
                        )}
                        {isStarting && !isHealthy && (
                          <span className="px-2 py-0.5 bg-yellow-600/30 text-yellow-400 text-xs rounded-full flex items-center gap-1">
                            <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Starting...
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">{service.description}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
                        <span className="font-mono">Port: {service.port}</span>
                        {isHealthy && (
                          <span className="font-mono text-green-400">
                            http://127.0.0.1:{status?.port}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex-shrink-0 ml-4 flex gap-2">
                    {/* View Logs Button */}
                    <button
                      onClick={() => setViewingOutputServiceId(
                        viewingOutputServiceId === service.id ? null : service.id
                      )}
                      className={`btn btn-sm ${
                        viewingOutputServiceId === service.id
                          ? 'bg-blue-100 dark:bg-blue-600/30 text-blue-600 dark:text-blue-400 border-blue-400 dark:border-blue-500'
                          : 'bg-slate-200/50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-slate-300/50 dark:hover:bg-slate-600/50 border-slate-300 dark:border-slate-600'
                      } border`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Logs
                    </button>

                    {/* Start/Stop Button */}
                    {isHealthy || isStopping ? (
                      <button
                        onClick={() => stopService(service.id)}
                        disabled={isStopping}
                        className="btn btn-sm bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30"
                      >
                        {isStopping ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                          </svg>
                        )}
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={() => startService(service.id, serviceEnvVars)}
                        disabled={isStarting}
                        className="btn btn-sm bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-600/30"
                      >
                        {isStarting ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                        )}
                        Start
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {servicesTotalPages > 1 && (
        <div className="flex items-center justify-between py-3 px-1">
          <span className="text-sm text-slate-500">
            Showing {(servicesPage - 1) * SERVICES_PER_PAGE + 1}-{Math.min(servicesPage * SERVICES_PER_PAGE, filteredServices.length)} of {filteredServices.length} service{filteredServices.length !== 1 ? 's' : ''}
            {servicesSearchQuery && ` matching "${servicesSearchQuery}"`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setServicesPage(p => Math.max(1, p - 1))}
              disabled={servicesPage === 1}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm text-slate-400 min-w-[80px] text-center">
              Page {servicesPage} of {servicesTotalPages}
            </span>
            <button
              onClick={() => setServicesPage(p => Math.min(servicesTotalPages, p + 1))}
              disabled={servicesPage === servicesTotalPages}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Service Output Viewer */}
      {viewingOutputServiceId && (
        <div className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-200/50 dark:bg-slate-800/50 border-b border-slate-300 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {services.find(s => s.id === viewingOutputServiceId)?.name || viewingOutputServiceId} - Logs
              </span>
              {isStreaming && (
                <span className="px-2 py-0.5 bg-green-600/30 text-green-400 text-xs rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <CopyButton
                text={outputLines.join('\n')}
                label="Copy"
                size="sm"
                className="bg-slate-200/50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-300/50 dark:hover:bg-slate-600/50 border border-slate-300 dark:border-slate-600"
              />
              <button
                onClick={clearOutput}
                className="btn btn-sm bg-slate-200/50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-300/50 dark:hover:bg-slate-600/50 border border-slate-300 dark:border-slate-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear
              </button>
              <button
                onClick={() => setViewingOutputServiceId(null)}
                className="btn btn-sm bg-slate-200/50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-300/50 dark:hover:bg-slate-600/50 border border-slate-300 dark:border-slate-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {/* Output Content */}
          <div
            ref={outputContainerRef}
            className="p-4 font-mono text-xs h-64 overflow-auto bg-slate-100 dark:bg-slate-950"
          >
            {outputLines.length === 0 ? (
              <div className="text-slate-500 text-center py-8">
                No output yet. Start the service to see logs here.
              </div>
            ) : (
              outputLines.map((line, index) => {
                // Determine color based on content
                let colorClass = 'text-slate-400';
                if (line.includes('ERROR') || line.includes('Error') || line.includes('error:') || line.includes('Traceback')) {
                  colorClass = 'text-red-400';
                } else if (line.includes('WARNING') || line.includes('Warning') || line.includes('UserWarning')) {
                  colorClass = 'text-yellow-400';
                } else if (line.includes('INFO')) {
                  colorClass = 'text-blue-400';
                }

                return (
                  <div key={index} className={`py-0.5 ${colorClass}`}>
                    {line}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Service Lifecycle Settings */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Lifecycle Settings
        </h3>
        <p className="text-slate-500 text-xs">
          Configure automatic starting and stopping of services. Services can auto-start when needed by workflows
          and auto-stop after being idle to free resources.
        </p>

        <div className="space-y-4">
          {/* Idle Timeout */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 text-xs block mb-1">
                Idle Timeout (minutes)
              </label>
              <input
                type="number"
                min="0"
                max="1440"
                value={Math.round((settings.serviceIdleTimeoutSecs ?? 900) / 60)}
                onChange={(e) => {
                  const minutes = Math.max(0, parseInt(e.target.value) || 0);
                  onUpdateSettings({ serviceIdleTimeoutSecs: minutes * 60 });
                }}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
              />
              <p className="text-slate-500 text-xs mt-1">
                0 = never auto-stop
              </p>
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">
                Startup Timeout (seconds)
              </label>
              <input
                type="number"
                min="10"
                max="300"
                value={settings.serviceStartupTimeoutSecs ?? 60}
                onChange={(e) => {
                  const secs = Math.max(10, Math.min(300, parseInt(e.target.value) || 60));
                  onUpdateSettings({ serviceStartupTimeoutSecs: secs });
                }}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
              />
              <p className="text-slate-500 text-xs mt-1">
                Max wait for service health check
              </p>
            </div>
          </div>

          {/* Per-service overrides info */}
          <div className="bg-slate-100/50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-slate-400 text-xs">
                Services automatically start when workflows need them (e.g., Playwright for browser automation).
                After the idle timeout, unused services are stopped to free system resources.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Tips */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          Tips
        </h3>
        <ul className="text-slate-400 text-sm space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-slate-500">•</span>
            Services run as separate processes on your machine
          </li>
          <li className="flex items-start gap-2">
            <span className="text-slate-500">•</span>
            First start may take longer while dependencies are installed
          </li>
          <li className="flex items-start gap-2">
            <span className="text-slate-500">•</span>
            Services auto-start when workflows need them and auto-stop when idle
          </li>
        </ul>
      </div>
    </div>
  );
}

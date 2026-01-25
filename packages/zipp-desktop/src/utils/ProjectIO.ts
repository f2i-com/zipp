/**
 * Project I/O Utilities
 *
 * Handles project import/export with secret sanitization.
 * Extracted from useProject.ts for maintainability.
 */

import type {
  ZippProject,
  ProjectConstant,
  WorkflowGraph,
  LogEntry,
} from 'zipp-core';
import { getModuleLoader } from 'zipp-core';
import {
  defaultLLMEndpoints,
  defaultImageGenEndpoints,
  defaultHttpPresets,
  defaultConstants,
  defaultSettings,
  createEmptyProject,
} from './ProjectDefaults';

/**
 * Check if a value looks like a secret (API key, token, etc.)
 */
export const looksLikeSecret = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  // Common API key patterns
  const secretPatterns = [
    /^sk-[A-Za-z0-9]{20,}$/,           // OpenAI keys
    /^sk-ant-[A-Za-z0-9-]{20,}$/,      // Anthropic keys
    /^AIza[A-Za-z0-9_-]{35}$/,         // Google API keys
    /^ghp_[A-Za-z0-9]{36}$/,           // GitHub tokens
    /^gho_[A-Za-z0-9]{36}$/,           // GitHub OAuth tokens
    /^xoxb-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24}$/,  // Slack bot tokens
    /^Bearer\s+[A-Za-z0-9._-]{20,}$/i, // Bearer tokens
    /^[A-Za-z0-9]{32,}$/,              // Generic long alphanumeric (potential keys)
  ];
  return secretPatterns.some(pattern => pattern.test(value));
};

/**
 * Sanitize node data by removing sensitive fields and secret-looking values.
 * Accepts schema-defined secret fields from node definitions.
 */
export const sanitizeNodeData = (
  data: Record<string, unknown>,
  knownSecrets: Set<string>,
  schemaSecretFields?: Set<string>
): Record<string, unknown> => {
  const sensitiveFields = ['apiKey', 'password', 'token', 'secret', 'key', 'credential', 'auth'];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    // Skip temporary fields
    if (key.startsWith('_')) continue;

    // SCHEMA-DRIVEN: If the node schema defines this field as 'secret' type, always redact it
    if (schemaSecretFields?.has(key)) {
      continue;
    }

    // Skip fields with sensitive names (case-insensitive)
    if (sensitiveFields.some(sf => key.toLowerCase().includes(sf))) {
      continue;
    }

    // Skip values that look like secrets
    if (typeof value === 'string' && (looksLikeSecret(value) || knownSecrets.has(value))) {
      continue;
    }

    // Recursively sanitize nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeNodeData(value as Record<string, unknown>, knownSecrets, schemaSecretFields);
    } else {
      result[key] = value;
    }
  }

  return result;
};

/**
 * Get secret field names from node definition schema
 */
const getSchemaSecretFields = (nodeType: string): Set<string> => {
  const secretFields = new Set<string>();
  const loader = getModuleLoader();
  const def = loader.getNodeDefinition(nodeType);
  if (def?.properties) {
    for (const prop of def.properties) {
      if (prop.type === 'secret') {
        secretFields.add(prop.id);
      }
    }
  }
  return secretFields;
};

/**
 * Sanitize a workflow graph by removing secrets from all node data
 */
export const sanitizeWorkflowGraph = (
  graph: WorkflowGraph,
  knownSecrets: Set<string>
): WorkflowGraph => {
  return {
    ...graph,
    nodes: graph.nodes.map(node => {
      const schemaSecretFields = getSchemaSecretFields(node.type);
      return {
        ...node,
        data: sanitizeNodeData(
          node.data as Record<string, unknown>,
          knownSecrets,
          schemaSecretFields
        ),
      };
    }),
  };
};

/**
 * Create a sanitized copy of a project for export
 * Removes all secrets from node data and clears secret constant values
 */
export const sanitizeProjectForExport = (project: ZippProject): ZippProject => {
  // Collect all known secret values from project constants
  const knownSecrets = new Set<string>();
  for (const constant of project.constants || []) {
    if (constant.isSecret && constant.value) {
      knownSecrets.add(constant.value);
    }
  }

  return {
    ...project,
    // Sanitize flows - remove secrets from node data using both schema and heuristics
    flows: project.flows.map(flow => ({
      ...flow,
      graph: sanitizeWorkflowGraph(flow.graph, knownSecrets),
    })),
    // Clear secret constant values on export
    constants: (project.constants || []).map(c => ({
      ...c,
      value: c.isSecret ? '' : c.value,
    })),
  };
};

/**
 * Export a project to JSON blob and trigger download
 */
export const exportProjectToFile = (project: ZippProject): void => {
  const sanitizedProject = sanitizeProjectForExport(project);
  const blob = new Blob([JSON.stringify(sanitizedProject, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zipp-project-${project.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Parse and validate an imported project file
 * Returns merged project with defaults for any missing fields
 */
export const parseImportedProject = (content: string): ZippProject => {
  const imported = JSON.parse(content) as ZippProject;

  // Validate basic structure
  if (!imported.flows || !Array.isArray(imported.flows)) {
    throw new Error('Invalid project: missing flows array');
  }

  // Merge with defaults for any missing fields
  return {
    ...createEmptyProject(),
    ...imported,
    // Preserve user's custom endpoints, add defaults if missing
    llmEndpoints: [
      ...defaultLLMEndpoints,
      ...(imported.llmEndpoints || []).filter(
        (e) => !defaultLLMEndpoints.find((d) => d.id === e.id)
      ),
    ],
    imageGenEndpoints: [
      ...defaultImageGenEndpoints,
      ...(imported.imageGenEndpoints || []).filter(
        (e) => !defaultImageGenEndpoints.find((d) => d.id === e.id)
      ),
    ],
    httpPresets: [
      ...defaultHttpPresets,
      ...(imported.httpPresets || []).filter(
        (p) => !defaultHttpPresets.find((d) => d.id === p.id)
      ),
    ],
    // Merge constants - preserve imported values for matching keys
    constants: defaultConstants.map((dc) => {
      const imported_c = (imported.constants || []).find((c) => c.key === dc.key);
      return imported_c ? { ...dc, value: imported_c.value } : dc;
    }).concat(
      (imported.constants || []).filter(
        (c) => !defaultConstants.find((d) => d.key === c.key)
      )
    ),
    // Merge settings
    settings: {
      ...defaultSettings,
      ...imported.settings,
    },
  };
};

/**
 * Import a project from a File object
 * Returns a promise that resolves to the merged project
 */
export const importProjectFromFile = (file: File): Promise<ZippProject> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const merged = parseImportedProject(content);
        resolve(merged);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
};

/**
 * Redact secrets from run history logs
 */
export const redactRunHistorySecrets = (logs: LogEntry[]): LogEntry[] => {
  return logs.map((log) => ({
    ...log,
    message: log.message
      .replace(/Bearer\s+[A-Za-z0-9_-]+/gi, 'Bearer [REDACTED]')
      .replace(/sk-[A-Za-z0-9]+/g, 'sk-[REDACTED]'),
  }));
};

/**
 * Redact secrets from project constants before localStorage save
 */
export const redactConstantsForStorage = (constants: ProjectConstant[]): ProjectConstant[] => {
  return constants.map((c) => ({
    ...c,
    value: c.isSecret ? '' : c.value,
  }));
};

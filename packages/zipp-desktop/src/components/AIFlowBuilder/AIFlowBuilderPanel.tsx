import { useState, useRef, useEffect, useCallback, Fragment } from 'react';
import type { ChatMessage, AIFlowBuilderSettings } from '../../hooks/useAIFlowBuilder';
import type { AgentLoopState, AgentConfig, AgentAttachment } from '../../hooks/useAgentLoop';
import AIFlowBuilderSettingsPopover from './AIFlowBuilderSettings';
import { AgentPanel } from '../AgentLoop';

interface AIFlowBuilderPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  settings: AIFlowBuilderSettings;
  onSendMessage: (message: string) => void;
  onApplyFlowPlan: (messageId: string) => void;
  onUpdateSettings: (updates: Partial<AIFlowBuilderSettings>) => void;
  onClearChat: () => void;
  onCancelRequest: () => void;
  providers: readonly { id: string; name: string; endpoint: string; model: string }[];
  // Agent mode props
  agentState?: AgentLoopState;
  agentConfig?: AgentConfig;
  agentIsRunning?: boolean;
  onAgentStart?: (goal: string, attachments?: AgentAttachment[]) => void;
  onAgentStop?: () => void;
  onAgentApprove?: () => void;
  onAgentReject?: (reason?: string) => void;
  onAgentUpdateConfig?: (updates: Partial<AgentConfig>) => void;
  onAgentReset?: () => void;
  agentPendingAttachments?: AgentAttachment[];
  onAgentAddAttachment?: (attachment: AgentAttachment) => void;
  onAgentRemoveAttachment?: (path: string) => void;
  onAgentClearAttachments?: () => void;
}

export default function AIFlowBuilderPanel({
  isOpen,
  onClose,
  messages,
  isLoading,
  error,
  settings,
  onSendMessage,
  onApplyFlowPlan,
  onUpdateSettings,
  onClearChat,
  onCancelRequest,
  providers,
  // Agent mode props
  agentState,
  agentConfig,
  agentIsRunning,
  onAgentStart,
  onAgentStop,
  onAgentApprove,
  onAgentReject,
  onAgentUpdateConfig,
  onAgentReset,
  agentPendingAttachments,
  onAgentAddAttachment,
  onAgentRemoveAttachment,
  onAgentClearAttachments,
}: AIFlowBuilderPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isAgentMode, setIsAgentMode] = useState(false);

  // Check if agent mode is available (all required props provided)
  const agentModeAvailable = !!(
    agentState &&
    agentConfig &&
    onAgentStart &&
    onAgentStop &&
    onAgentApprove &&
    onAgentReject &&
    onAgentUpdateConfig
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (!isOpen) return;
    const timeoutId = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timeoutId);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showSettings) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showSettings, onClose]);

  // Handle send
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
  }, [inputValue, isLoading, onSendMessage]);

  // Handle key press
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Render message content with code blocks
  const renderMessageContent = useCallback((content: string) => {
    // Split by code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        // Extract language and code
        const match = part.match(/```(\w*)?\n?([\s\S]*?)```/);
        if (match) {
          const [, lang, code] = match;
          return (
            <pre key={i} className="bg-slate-100 dark:bg-zinc-900 rounded-lg p-3 my-2 overflow-x-auto text-xs">
              {lang && <div className="text-slate-500 dark:text-zinc-500 text-xs mb-1">{lang}</div>}
              <code className="text-slate-700 dark:text-zinc-300">{code.trim()}</code>
            </pre>
          );
        }
      }
      // Regular text - split by newlines for paragraphs
      return (
        <Fragment key={i}>
          {part.split('\n').map((line, j, arr) => (
            <Fragment key={j}>
              {line}
              {j < arr.length - 1 && <br />}
            </Fragment>
          ))}
        </Fragment>
      );
    });
  }, []);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI Flow Builder"
        className={`fixed top-0 right-0 h-full w-full md:w-[420px] bg-white dark:bg-zinc-900 border-l border-slate-200 dark:border-zinc-700 z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-700 bg-gradient-to-r ${
          isAgentMode ? 'from-amber-600/20 to-orange-600/20' : 'from-violet-600/20 to-fuchsia-600/20'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shadow-lg bg-gradient-to-br ${
              isAgentMode ? 'from-amber-500 to-orange-500' : 'from-violet-500 to-fuchsia-500'
            }`}>
              {isAgentMode ? (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {isAgentMode ? 'AI Agent' : 'AI Flow Builder'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {isAgentMode ? 'Autonomous workflow automation' : 'Describe what you want to build'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Mode toggle */}
            {agentModeAvailable && (
              <button
                onClick={() => setIsAgentMode(!isAgentMode)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isAgentMode
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-700'
                }`}
                title={isAgentMode ? 'Switch to Manual mode' : 'Switch to Agent mode'}
              >
                {isAgentMode ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Agent
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Manual
                  </>
                )}
              </button>
            )}
            {/* Settings button */}
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                title="Settings"
              >
                <svg className="w-5 h-5 text-slate-500 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              {showSettings && (
                <AIFlowBuilderSettingsPopover
                  settings={settings}
                  onUpdateSettings={onUpdateSettings}
                  onClose={() => setShowSettings(false)}
                  providers={providers}
                />
              )}
            </div>
            {/* Clear button */}
            {messages.length > 0 && (
              <button
                onClick={onClearChat}
                className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                title="Clear chat"
              >
                <svg className="w-5 h-5 text-slate-500 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title="Close"
            >
              <svg className="w-5 h-5 text-slate-500 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Conditional content: Agent mode or Chat mode */}
        {isAgentMode && agentState && agentConfig ? (
          <AgentPanel
            state={agentState}
            config={agentConfig}
            isRunning={agentIsRunning || false}
            onStart={onAgentStart!}
            onStop={onAgentStop!}
            onApprove={onAgentApprove!}
            onReject={onAgentReject!}
            onUpdateConfig={onAgentUpdateConfig!}
            onReset={onAgentReset || (() => {})}
            pendingAttachments={agentPendingAttachments || []}
            onAddAttachment={onAgentAddAttachment || (() => {})}
            onRemoveAttachment={onAgentRemoveAttachment || (() => {})}
            onClearAttachments={onAgentClearAttachments || (() => {})}
          />
        ) : (
          <>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-slate-700 dark:text-zinc-300 mb-2">Start a conversation</h3>
              <p className="text-sm text-slate-500 dark:text-zinc-500 max-w-xs mx-auto">
                Describe the workflow you want to create, or ask to modify the current flow.
              </p>
              <div className="mt-6 space-y-2">
                <p className="text-xs text-slate-400 dark:text-zinc-600 uppercase tracking-wide">Examples</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    'Create a flow that describes images',
                    'Generate an image from text',
                    'Add a template node before the output',
                  ].map((example, i) => (
                    <button
                      key={i}
                      onClick={() => setInputValue(example)}
                      className="px-3 py-1.5 text-xs bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-400 rounded-full transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100'
                }`}
              >
                <div className="text-sm leading-relaxed">
                  {renderMessageContent(message.content)}
                </div>

                {/* Apply button for messages with FlowPlan */}
                {message.role === 'assistant' && message.flowPlan && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-700">
                    <button
                      onClick={() => onApplyFlowPlan(message.id)}
                      disabled={message.isApplied}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        message.isApplied
                          ? 'bg-green-600/20 text-green-400 cursor-default'
                          : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white'
                      }`}
                    >
                      {message.isApplied ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Applied
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Apply to Flow
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Timestamp */}
                <div className={`text-xs mt-2 ${message.role === 'user' ? 'text-blue-200' : 'text-slate-500 dark:text-zinc-500'}`}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 rounded-2xl px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-slate-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-slate-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-slate-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-sm">Thinking...</span>
                <button
                  onClick={onCancelRequest}
                  className="ml-2 text-xs text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && !isLoading && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-slate-200 dark:border-zinc-700 p-4">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to build..."
              className="flex-1 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-none"
              rows={2}
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className="px-5 py-3 h-[60px] bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 disabled:from-slate-300 dark:disabled:from-zinc-700 disabled:to-slate-300 dark:disabled:to-zinc-700 disabled:cursor-not-allowed text-white rounded-xl transition-all flex items-center justify-center"
              title="Send message"
              aria-label="Send message"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-600 mt-2">
            Press Enter to send, Shift+Enter for new line
          </div>
        </div>
          </>
        )}
      </div>
    </>
  );
}

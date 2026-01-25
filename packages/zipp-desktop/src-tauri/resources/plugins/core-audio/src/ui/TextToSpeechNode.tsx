import { memo, useRef, useEffect, useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { Position } from '@xyflow/react';
import { CollapsibleNodeWrapper, type HandleConfig } from 'zipp-ui-components';


interface TextToSpeechNodeData {
    text?: string;
    service?: string; // Service ID or "custom"
    apiUrl?: string;
    responseFormat?: 'json' | 'pcm16_stream' | 'audio_file';
    description?: string;
    descriptionInput?: string;
    speaker?: string;
    language?: string;
    outputFormat?: 'wav' | 'mp3';
    filename?: string;
    audioPath?: string;
    _status?: 'running' | 'completed' | 'error';
    _collapsed?: boolean;
    showBodyProperties?: boolean;
    // Generic onChange handler (used by ZippBuilder)
    onChange?: (field: string, value: unknown) => void;
    onCollapsedChange?: (value: boolean) => void;
}

interface TextToSpeechNodeProps {
    data: TextToSpeechNodeData;
}

// TTS services with their default ports and endpoints
const TTS_SERVICES = [
    { id: 'chatterbox-tts', name: 'Chatterbox TTS', port: 8765, endpoint: '/tts' },
    { id: 'qwen3-tts', name: 'Qwen3 TTS', port: 8772, endpoint: '/tts' },
    { id: 'custom', name: 'Custom URL', port: 0, endpoint: '' },
];

const TTSIcon = (
    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
);

function TextToSpeechNode({ data }: TextToSpeechNodeProps) {
    const onCollapsedChangeRef = useRef(data.onCollapsedChange);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        onCollapsedChangeRef.current = data.onCollapsedChange;
    });

    const handleCollapsedChange = useCallback((collapsed: boolean) => {
        onCollapsedChangeRef.current?.(collapsed);
    }, []);

    // Generic change handler that uses data.onChange
    const handleChange = useCallback((field: string, value: unknown) => {
        data.onChange?.(field, value);
    }, [data]);

    const service = data.service || 'chatterbox-tts';
    const selectedService = TTS_SERVICES.find(s => s.id === service) || TTS_SERVICES[0];
    const isCustom = service === 'custom';

    // Update apiUrl when service changes
    const handleServiceChange = useCallback((newService: string) => {
        handleChange('service', newService);
        const svc = TTS_SERVICES.find(s => s.id === newService);
        if (svc && svc.id !== 'custom') {
            handleChange('apiUrl', `http://127.0.0.1:${svc.port}${svc.endpoint}`);
        }
    }, [handleChange]);

    const collapsedPreview = (
        <div className="text-slate-600 dark:text-slate-400 text-[10px]">
            <span className="text-teal-400">{selectedService.name}</span>
        </div>
    );

    const inputHandles = useMemo<HandleConfig[]>(() => {
        const handles: HandleConfig[] = [
            { id: 'text', type: 'target', position: Position.Left, color: '!bg-amber-500', size: 'lg', label: 'text' },
            { id: 'descriptionInput', type: 'target', position: Position.Left, color: '!bg-purple-500', size: 'md', label: 'desc' },
            { id: 'audioPrompt', type: 'target', position: Position.Left, color: '!bg-teal-500', size: 'md', label: 'voice' },
        ];
        return handles;
    }, []);

    const outputHandles = useMemo<HandleConfig[]>(() => [
        { id: 'audio', type: 'source', position: Position.Right, color: '!bg-teal-500', size: 'lg', label: 'audio' },
    ], []);

    const handlePlayPause = () => {
        if (!data.audioPath) return;

        if (!audioRef.current) {
            audioRef.current = new Audio(data.audioPath);
            audioRef.current.onended = () => setIsPlaying(false);
        }

        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play();
            setIsPlaying(true);
        }
    };

    return (
        <CollapsibleNodeWrapper
            title="Text to Speech"
            color="teal"
            icon={TTSIcon}
            width={300}
            collapsedWidth={140}
            status={data._status}
            isCollapsed={data._collapsed}
            onCollapsedChange={handleCollapsedChange}
            collapsedPreview={collapsedPreview}
            inputHandles={inputHandles}
            outputHandles={outputHandles}
        >
            {data.showBodyProperties !== false && (
                <>
                    {/* Service Selection */}
                    <div>
                        <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">TTS Service</label>
                        <select
                            className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                            value={service}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => handleServiceChange(e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            {TTS_SERVICES.map(svc => (
                                <option key={svc.id} value={svc.id}>{svc.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Custom API URL (only for custom service) */}
                    {isCustom && (
                        <div>
                            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">API URL</label>
                            <input
                                type="text"
                                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                                placeholder="http://127.0.0.1:8765/tts"
                                value={data.apiUrl || 'http://127.0.0.1:8765/tts'}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('apiUrl', e.target.value)}
                                onMouseDown={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}

                    {/* Response Format */}
                    <div>
                        <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Response Format</label>
                        <select
                            className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                            value={data.responseFormat || 'json'}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => handleChange('responseFormat', e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <option value="json">JSON (with audio_path)</option>
                            <option value="pcm16_stream">PCM16 Stream (raw audio)</option>
                            <option value="audio_file">Audio File (MP3/WAV download)</option>
                        </select>
                    </div>

                    {/* Voice Description */}
                    <div>
                        <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Voice Description</label>
                        <textarea
                            className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 resize-none"
                            placeholder="Natural voice, clear and expressive tone..."
                            rows={2}
                            value={data.description || ''}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => handleChange('description', e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    </div>

                    {/* Speaker (for Qwen3-TTS) */}
                    <div>
                        <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Speaker</label>
                        <input
                            type="text"
                            className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                            placeholder="e.g., Vivian, Ryan (for Qwen3-TTS)"
                            value={data.speaker || ''}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('speaker', e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    </div>

                    {/* Language */}
                    <div>
                        <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Language</label>
                        <select
                            className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                            value={data.language || 'Auto'}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => handleChange('language', e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <option value="Auto">Auto Detect</option>
                            <option value="Chinese">Chinese</option>
                            <option value="English">English</option>
                            <option value="Japanese">Japanese</option>
                            <option value="Korean">Korean</option>
                            <option value="French">French</option>
                            <option value="German">German</option>
                            <option value="Spanish">Spanish</option>
                            <option value="Italian">Italian</option>
                            <option value="Portuguese">Portuguese</option>
                            <option value="Russian">Russian</option>
                        </select>
                    </div>

                    {/* Audio Prompt Info */}
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-teal-900/20 border border-teal-800/30 rounded text-xs text-teal-300">
                        <svg className="w-4 h-4 text-teal-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        <span>Connect audio to "voice" for cloning</span>
                    </div>

                    {/* Output Format */}
                    <div>
                        <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Format</label>
                        <select
                            className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                            value={data.outputFormat || 'wav'}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => handleChange('outputFormat', e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <option value="wav">WAV (lossless)</option>
                            <option value="mp3">MP3 (compressed)</option>
                        </select>
                    </div>

                    {/* Filename */}
                    <div>
                        <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Filename</label>
                        <input
                            type="text"
                            className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                            placeholder="tts_output"
                            value={data.filename || 'tts_output'}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('filename', e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    </div>

                    {/* Audio Preview */}
                    {data.audioPath && (
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-teal-900/20 border border-teal-800/30 rounded">
                            <button
                                type="button"
                                className="p-1.5 rounded bg-teal-600 hover:bg-teal-500 transition-colors"
                                onClick={handlePlayPause}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                {isPlaying ? (
                                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                    </svg>
                                ) : (
                                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                )}
                            </button>
                            <span className="text-xs text-teal-300 truncate flex-1">Audio generated</span>
                        </div>
                    )}

                    {/* Service Info */}
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-100/50 dark:bg-slate-900/50 rounded text-xs text-slate-600 dark:text-slate-400">
                        <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{isCustom ? 'Using custom TTS API' : `Using ${selectedService.name}`}</span>
                    </div>
                </>
            )}
        </CollapsibleNodeWrapper>
    );
}

export default memo(TextToSpeechNode);

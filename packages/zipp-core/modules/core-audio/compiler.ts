/**
 * Core Audio Module Compiler
 *
 * Compiles audio processing nodes into FormLogic code.
 */

import type { ModuleCompiler, ModuleCompilerContext } from 'zipp-core';

const CoreAudioCompiler: ModuleCompiler = {
    name: 'Audio',

    getNodeTypes() {
        return ['text_to_speech', 'save_audio', 'music_gen', 'audio_append', 'speech_to_text', 'audio_fade'];
    },

    compileNode(nodeType: string, ctx: ModuleCompilerContext): string | null {
        const { node, inputs, outputVar, skipVarDeclaration, escapeString } = ctx;
        const data = node.data;
        const letOrAssign = skipVarDeclaration ? '' : 'let ';

        if (nodeType === 'text_to_speech') {
            // Get text input from connected handle or default from data
            const textVar = inputs.get('text') || `"${escapeString(String(data.text || ''))}"`;

            // Get description from input handle or property
            const descriptionInput = inputs.get('descriptionInput');
            const descriptionProp = `"${escapeString(String(data.description || ''))}"`;
            const description = descriptionInput
                ? `${descriptionInput} || ${descriptionProp}`
                : descriptionProp;

            // Get audio prompt from input handle (optional, for voice cloning)
            const audioPromptInput = inputs.get('audioPrompt');
            let audioPromptPath: string;
            if (audioPromptInput) {
                // Handle both string paths and objects with .path property (from audio nodes)
                audioPromptPath = `(typeof ${audioPromptInput} === 'object' && ${audioPromptInput}.path ? ${audioPromptInput}.path : ${audioPromptInput})`;
            } else {
                audioPromptPath = '""';
            }

            // Service selection and API URL
            const service = String(data.service || 'chatterbox-tts');
            let apiUrl: string;
            let serviceId: string;

            // Map service to API URL and service ID for auto-start
            if (service === 'qwen3-tts') {
                apiUrl = 'http://127.0.0.1:8772/tts';
                serviceId = 'qwen3-tts';
            } else if (service === 'custom') {
                apiUrl = escapeString(String(data.apiUrl || 'http://127.0.0.1:8765/tts'));
                serviceId = ''; // No auto-start for custom URLs
            } else {
                // Default to chatterbox-tts
                apiUrl = 'http://127.0.0.1:8765/tts';
                serviceId = 'chatterbox-tts';
            }

            const responseFormat = escapeString(String(data.responseFormat || 'json'));

            // Common settings
            const outputFormat = escapeString(String(data.outputFormat || 'wav'));
            const filename = escapeString(String(data.filename || 'tts_output'));

            // Qwen3-TTS specific settings
            const speaker = escapeString(String(data.speaker || ''));
            const language = escapeString(String(data.language || 'Auto'));

            // Generate code that calls the TTS function with all parameters
            // Use resolveServiceUrl to auto-start service if needed (unless custom URL)
            const resolveServiceCall = serviceId
                ? `await Audio.resolveServiceUrl("${serviceId}", "${apiUrl}")`
                : `"${apiUrl}"`;

            let code = `
  // --- Node: ${node.id} (text_to_speech) ---
  const ${outputVar}_apiUrl = ${resolveServiceCall};
  ${letOrAssign}${outputVar} = await Audio.textToSpeech(
    ${textVar},
    ${outputVar}_apiUrl,
    "${responseFormat}",
    ${description},
    "${outputFormat}",
    "${filename}",
    "${node.id}",
    ${audioPromptPath},
    "${speaker}",
    "${language}"
  );
  // Create suffixed output variables for multi-output node pattern
  // Always use 'let' for suffix variables as they are only created here (not pre-declared by main compiler)
  let ${outputVar}_audio = ${outputVar}.audio || ${outputVar};
  let ${outputVar}_path = ${outputVar}.path || ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;

            return code;
        }

        if (nodeType === 'save_audio') {
            // Get audio input from connected handle
            // Audio nodes return { audio: "media URL", path: "file path" }
            // For file operations, we need the .path (actual file path), not .audio (media URL)
            let audioVar = inputs.get('audio') || '""';

            // The compiler creates suffix variables like node_xxx_out_audio from node_xxx_out.audio
            // So node_xxx_out_audio contains the URL string directly, not the object
            // We need to get the parent object (node_xxx_out) to access .path
            if (audioVar.includes('_out_audio')) {
                // Strip _audio suffix to get the base output object, then access .path
                const baseVar = audioVar.replace(/_audio$/, '');
                audioVar = `(${baseVar}.path || ${audioVar})`;
            } else if (audioVar.includes('_out') && !audioVar.includes('.path')) {
                // Fallback for other _out variables - try to access .path if it's an object
                audioVar = `(typeof ${audioVar} === 'object' && ${audioVar}.path ? ${audioVar}.path : ${audioVar})`;
            }

            // Get save settings
            const filename = escapeString(String(data.filename || 'audio_output'));
            const directory = escapeString(String(data.directory || ''));
            const format = escapeString(String(data.format || 'wav'));
            const overwrite = Boolean(data.overwrite);

            // Generate code that calls the save audio function
            let code = `
  // --- Node: ${node.id} (save_audio) ---
  ${letOrAssign}${outputVar} = await Audio.saveAudio(
    ${audioVar},
    "${filename}",
    "${directory}",
    "${format}",
    ${overwrite},
    "${node.id}"
  );
  workflow_context["${node.id}"] = ${outputVar};`;

            return code;
        }

        if (nodeType === 'music_gen') {
            // Get service type (ace-step or heartmula)
            const service = escapeString(String(data.service || 'ace-step'));

            // Get prompt from input handle or property
            const promptInput = inputs.get('prompt');
            const promptProp = `"${escapeString(String(data.prompt || 'pop, energetic, catchy melody'))}"`;
            const prompt = promptInput
                ? `${promptInput} || ${promptProp}`
                : promptProp;

            // Get lyrics from input handle or property
            const lyricsInput = inputs.get('lyrics');
            const lyricsProp = `"${escapeString(String(data.lyrics || ''))}"`;
            const lyrics = lyricsInput
                ? `${lyricsInput} || ${lyricsProp}`
                : lyricsProp;

            // Get duration from input handle or property
            const durationInput = inputs.get('duration');
            const durationProp = Number(data.duration) || 60;
            // If duration input is connected, use it (with fallback to property)
            const durationExpr = durationInput
                ? `(typeof ${durationInput} === 'number' ? ${durationInput} : (parseFloat(${durationInput}) || ${durationProp}))`
                : String(durationProp);

            // API settings - default based on service
            const defaultApiUrl = service === 'heartmula'
                ? 'http://127.0.0.1:8767/generate'
                : 'http://127.0.0.1:8766/generate';
            const apiUrl = escapeString(String(data.apiUrl || defaultApiUrl));

            // ACE-Step specific settings
            const inferSteps = Number(data.inferSteps) || 27;
            const guidanceScale = Number(data.guidanceScale) || 15.0;

            // HeartMuLa specific settings
            const temperature = Number(data.temperature) || 1.0;
            const topk = Number(data.topk) || 50;
            const cfgScale = Number(data.cfgScale) || 1.5;

            // Common settings
            const seed = Number(data.seed) || -1;
            const filename = escapeString(String(data.filename || 'music_output'));

            // Generate code that calls the music generation function
            let code = `
  // --- Node: ${node.id} (music_gen) ---
  ${letOrAssign}${outputVar} = await Audio.generateMusic(
    ${prompt},
    ${lyrics},
    "${apiUrl}",
    ${durationExpr},
    "${service}",
    { inferSteps: ${inferSteps}, guidanceScale: ${guidanceScale}, temperature: ${temperature}, topk: ${topk}, cfgScale: ${cfgScale} },
    ${seed},
    "${filename}",
    "${node.id}"
  );
  // Create suffixed output variables for multi-output node pattern
  // Always use 'let' for suffix variables as they are only created here (not pre-declared by main compiler)
  let ${outputVar}_audio = ${outputVar}.audio || ${outputVar};
  let ${outputVar}_path = ${outputVar}.path || ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;

            return code;
        }

        if (nodeType === 'audio_append') {
            // Get audio array from input handle
            const audiosVar = inputs.get('audios') || '[]';

            // Get settings
            const filename = escapeString(String(data.filename || 'concatenated_audio'));
            const format = escapeString(String(data.format || 'wav'));

            // Generate code that calls the append audio function
            let code = `
  // --- Node: ${node.id} (audio_append) ---
  ${letOrAssign}${outputVar} = await Audio.appendAudio(
    ${audiosVar},
    "${filename}",
    "${format}",
    "${node.id}"
  );
  // Create suffixed output variables for multi-output node pattern
  // Always use 'let' for suffix variables as they are only created here (not pre-declared by main compiler)
  let ${outputVar}_audio = ${outputVar}.audio || ${outputVar};
  let ${outputVar}_path = ${outputVar}.path || ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;

            return code;
        }

        if (nodeType === 'speech_to_text') {
            // Get media input from connected handle
            let mediaVar = inputs.get('media') || '""';
            // Handle both string paths and objects with .path property
            if (!mediaVar.includes('.path') && !mediaVar.startsWith('"')) {
                mediaVar = `(typeof ${mediaVar} === 'object' && (${mediaVar}.path || ${mediaVar}.video || ${mediaVar}.audio) ? (${mediaVar}.path || ${mediaVar}.video || ${mediaVar}.audio) : ${mediaVar})`;
            }

            // Get optional time range inputs
            const startTimeInput = inputs.get('startTime');
            const endTimeInput = inputs.get('endTime');
            const startTime = startTimeInput || 'null';
            const endTime = endTimeInput || 'null';

            // API settings - use user-provided URL or default
            const apiUrl = escapeString(String(data.apiUrl || 'http://127.0.0.1:8770/transcribe'));
            const language = escapeString(String(data.language || ''));

            // Feature flags
            const enableWordTimestamps = data.enableWordTimestamps !== false;
            const enableDiarization = Boolean(data.enableDiarization);
            const minSpeakers = data.minSpeakers != null ? Number(data.minSpeakers) : 'null';
            const maxSpeakers = data.maxSpeakers != null ? Number(data.maxSpeakers) : 'null';

            // HuggingFace token for diarization (from constants)
            const hfTokenConstant = data.hfTokenConstant ? escapeString(String(data.hfTokenConstant)) : '';

            // Generate code that calls the speech-to-text function
            // Use resolveServiceUrl to auto-start service if needed
            let code = `
  // --- Node: ${node.id} (speech_to_text) ---
  const ${outputVar}_apiUrl = await Audio.resolveServiceUrl("whisperx", "${apiUrl}");
  ${letOrAssign}${outputVar} = await Audio.speechToText(
    ${mediaVar},
    ${outputVar}_apiUrl,
    ${language ? `"${language}"` : 'null'},
    ${enableWordTimestamps},
    ${enableDiarization},
    ${minSpeakers},
    ${maxSpeakers},
    ${startTime},
    ${endTime},
    "${node.id}",
    ${hfTokenConstant ? `"${hfTokenConstant}"` : 'null'}
  );
  // Create suffixed output variables for multi-output node pattern
  let ${outputVar}_text = ${outputVar}.text || "";
  let ${outputVar}_segments = ${outputVar}.segments || [];
  let ${outputVar}_language = ${outputVar}.language || "unknown";
  let ${outputVar}_duration = ${outputVar}.duration || 0;
  workflow_context["${node.id}"] = ${outputVar};`;

            return code;
        }

        if (nodeType === 'audio_fade') {
            // Get video input from connected handle
            let videoVar = inputs.get('video') || '""';
            // Handle both string paths and objects with .path or .video property
            if (!videoVar.includes('.path') && !videoVar.includes('.video') && !videoVar.startsWith('"')) {
                videoVar = `(typeof ${videoVar} === 'object' && (${videoVar}.path || ${videoVar}.video) ? (${videoVar}.path || ${videoVar}.video) : ${videoVar})`;
            }

            // Fade settings
            const fadeDuration = Number(data.fadeDuration) || 10;
            const fadeType = escapeString(String(data.fadeType || 'exponential'));
            const fadeDirection = escapeString(String(data.fadeDirection || 'out'));
            const filename = escapeString(String(data.filename || 'audio_faded'));

            // Generate code that calls the fade audio function
            let code = `
  // --- Node: ${node.id} (audio_fade) ---
  ${letOrAssign}${outputVar} = await Audio.fadeAudio(
    ${videoVar},
    ${fadeDuration},
    "${fadeType}",
    "${fadeDirection}",
    "${filename}",
    "${node.id}"
  );
  // Create suffixed output variables for multi-output node pattern
  let ${outputVar}_video = ${outputVar}.video || ${outputVar};
  let ${outputVar}_path = ${outputVar}.path || ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;

            return code;
        }

        return null
    },
};

export default CoreAudioCompiler;

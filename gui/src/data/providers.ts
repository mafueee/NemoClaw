// Shared inference provider definitions used by both OnboardWizard and InferenceConfig.

export interface ProviderDef {
    key: string;
    icon: string;
    title: string;
    desc: string;
    models: string[];
    endpointEditable: boolean;
    defaultEndpoint: string;
    apiKeyEnv: string;
    apiKeyPlaceholder: string;
    apiKeyHelp?: string;
    apiKeyHelpUrl?: string;
}

export const PROVIDERS: ProviderDef[] = [
    {
        key: 'cloud',
        icon: '☁️',
        title: 'NVIDIA Cloud API',
        desc: 'Use models hosted on build.nvidia.com',
        models: [
            'nvidia/llama-3.3-nemotron-super-49b-v1',
            'nvidia/llama-3.1-nemotron-ultra-253b-v1',
            'meta/llama-3.3-70b-instruct',
            'deepseek/deepseek-r1',
        ],
        endpointEditable: false,
        defaultEndpoint: 'https://integrate.api.nvidia.com/v1',
        apiKeyEnv: 'NVIDIA_API_KEY',
        apiKeyPlaceholder: 'nvapi-...',
        apiKeyHelp: 'Get your API key at',
        apiKeyHelpUrl: 'https://build.nvidia.com',
    },
    {
        key: 'ollama',
        icon: '🦙',
        title: 'Ollama',
        desc: 'Connect to an Ollama server (local or remote)',
        models: [
            'llama3.3:latest',
            'qwen2.5:32b',
            'gemma3:27b',
            'mistral:latest',
            'deepseek-r1:latest',
        ],
        endpointEditable: true,
        defaultEndpoint: 'http://localhost:11434/v1',
        apiKeyEnv: 'OLLAMA_API_KEY',
        apiKeyPlaceholder: 'Optional — leave blank for local',
        apiKeyHelp: 'Only needed if your Ollama server requires auth',
    },
    {
        key: 'openrouter',
        icon: '🌐',
        title: 'OpenRouter',
        desc: '200+ models via openrouter.ai',
        models: [
            'anthropic/claude-sonnet-4',
            'google/gemini-2.5-pro',
            'google/gemini-3-flash',
            'openai/gpt-4.1',
            'deepseek/deepseek-r1',
            'meta-llama/llama-4-maverick',
        ],
        endpointEditable: false,
        defaultEndpoint: 'https://openrouter.ai/api/v1',
        apiKeyEnv: 'OPENROUTER_API_KEY',
        apiKeyPlaceholder: 'sk-or-v1-...',
        apiKeyHelp: 'Get your API key at',
        apiKeyHelpUrl: 'https://openrouter.ai/keys',
    },
    {
        key: 'gemini',
        icon: '💎',
        title: 'Google Gemini',
        desc: 'Gemini models via Google AI Studio',
        models: [
            'gemini-3-flash',
            'gemini-2.5-pro',
            'gemini-2.5-flash',
            'gemini-2.0-flash',
        ],
        endpointEditable: false,
        defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKeyEnv: 'GEMINI_API_KEY',
        apiKeyPlaceholder: 'AIza...',
        apiKeyHelp: 'Get your API key at',
        apiKeyHelpUrl: 'https://aistudio.google.com/apikey',
    },
    {
        key: 'vllm',
        icon: '⚡',
        title: 'Local vLLM',
        desc: 'High-performance inference with vLLM server',
        models: ['Auto-detected from running server'],
        endpointEditable: true,
        defaultEndpoint: 'http://localhost:8000/v1',
        apiKeyEnv: 'OPENAI_API_KEY',
        apiKeyPlaceholder: 'Optional',
    },
    {
        key: 'nim-local',
        icon: '🖥️',
        title: 'Local GPU (NIM)',
        desc: 'On-premise NIM container inference',
        models: [
            'nvidia/nemotron-3-super-120b-a12b',
            'nvidia/nemotron-3-nano-30b-a3b',
        ],
        endpointEditable: true,
        defaultEndpoint: 'http://nim-service.local:8000/v1',
        apiKeyEnv: 'NIM_API_KEY',
        apiKeyPlaceholder: 'Optional',
    },
];

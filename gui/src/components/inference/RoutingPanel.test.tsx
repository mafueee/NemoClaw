import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RoutingPanel } from './RoutingPanel';

vi.mock('../../api/client', () => ({
    api: {
        getInferenceRoutes: vi.fn().mockResolvedValue({
            ok: true,
            routes: [
                {
                    name: 'nvidia-cloud',
                    baseUrl: 'https://integrate.api.nvidia.com/v1',
                    protocols: ['openai'],
                    hasCredential: true,
                    credentialMasked: 'nvapi-•••xyz',
                    modelId: 'meta/llama-3.1-8b-instruct',
                    providerType: 'nvidia',
                },
                {
                    name: 'ollama-local',
                    baseUrl: 'http://localhost:11434/v1',
                    protocols: ['openai', 'rest'],
                    hasCredential: false,
                    credentialMasked: '',
                    modelId: 'llama3.2',
                    providerType: 'ollama',
                },
            ],
            revision: 'abc123',
            generatedAt: '2026-03-25T10:00:00Z',
        }),
    },
}));

describe('RoutingPanel', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('renders resolved routes', async () => {
        render(<RoutingPanel />);
        await waitFor(() => {
            expect(screen.getByText('nvidia-cloud')).toBeInTheDocument();
            expect(screen.getByText('ollama-local')).toBeInTheDocument();
        });
    });

    it('shows credential status', async () => {
        render(<RoutingPanel />);
        await waitFor(() => {
            expect(screen.getByText('🔑 Credential Active')).toBeInTheDocument();
            expect(screen.getByText('⚠️ No Credential')).toBeInTheDocument();
        });
    });

    it('renders protocol badges', async () => {
        render(<RoutingPanel />);
        await waitFor(() => {
            expect(screen.getByText('openai')).toBeInTheDocument();
            expect(screen.getByText('rest')).toBeInTheDocument();
        });
    });

    it('shows revision and timestamp', async () => {
        render(<RoutingPanel />);
        await waitFor(() => {
            expect(screen.getByText(/Revision: abc123/)).toBeInTheDocument();
        });
    });
});

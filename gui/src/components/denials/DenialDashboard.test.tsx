import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DenialDashboard } from './DenialDashboard';

vi.mock('../../api/client', () => ({
    api: {
        listSandboxes: vi.fn().mockResolvedValue({
            sandboxes: [
                { name: 'test-sandbox', status: 'running', phase: '' },
            ],
        }),
        getDraftChunks: vi.fn().mockResolvedValue({
            ok: true,
            chunks: [
                {
                    id: 'chunk-001-full-id',
                    status: 'pending',
                    ruleName: 'allow-npm-registry',
                    proposedRule: null,
                    rationale: 'NPM package installs are blocked but required for development.',
                    securityNotes: 'Low risk \u2014 public registry access only.',
                    confidence: 0.85,
                    denialSummaryIds: ['den-1'],
                    createdAt: '2026-03-25T08:00:00Z',
                    decidedAt: null,
                    stage: 'initial',
                    supersedesChunkId: '',
                    hitCount: 12,
                    firstSeen: '2026-03-24T00:00:00Z',
                    lastSeen: '2026-03-25T08:00:00Z',
                    binary: 'npm',
                },
            ],
            rollingSummary: 'Agent detected 12 blocked npm install attempts',
            draftVersion: '3',
            lastAnalyzedAt: '2026-03-25T08:00:00Z',
        }),
        getDraftHistory: vi.fn().mockResolvedValue({
            ok: true,
            entries: [
                { timestamp: '2026-03-25T07:00:00Z', eventType: 'denial_detected', description: 'NPM blocked', chunkId: 'chunk-001-full-id' },
            ],
        }),
        approveDraft: vi.fn().mockResolvedValue({ ok: true, policyVersion: 4, policyHash: 'abc' }),
        rejectDraft: vi.fn().mockResolvedValue({ ok: true }),
    },
}));

describe('DenialDashboard', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('renders and loads draft chunks', async () => {
        render(<DenialDashboard />);
        expect(screen.getByText('\u2696\ufe0f Denial Dashboard')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByText('allow-npm-registry')).toBeInTheDocument();
        });
    });

    it('shows rolling analysis summary', async () => {
        render(<DenialDashboard />);
        await waitFor(() => {
            expect(screen.getByText(/Agent detected 12 blocked npm install attempts/)).toBeInTheDocument();
        });
    });

    it('shows confidence score', async () => {
        render(<DenialDashboard />);
        await waitFor(() => {
            expect(screen.getByText('85% confidence')).toBeInTheDocument();
        });
    });

    it('shows rationale and security notes', async () => {
        render(<DenialDashboard />);
        await waitFor(() => {
            expect(screen.getByText(/NPM package installs are blocked/)).toBeInTheDocument();
            expect(screen.getByText(/Low risk/)).toBeInTheDocument();
        });
    });

    it('displays approve and reject buttons', async () => {
        render(<DenialDashboard />);
        await waitFor(() => {
            expect(screen.getByTestId('approve-chunk-001-full-id')).toBeInTheDocument();
            expect(screen.getByTestId('reject-chunk-001-full-id')).toBeInTheDocument();
        });
    });

    it('switches to history tab', async () => {
        render(<DenialDashboard />);
        await waitFor(() => {
            expect(screen.getByTestId('tab-history')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId('tab-history'));
        await waitFor(() => {
            expect(screen.getByText('NPM blocked')).toBeInTheDocument();
        });
    });
});

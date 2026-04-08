import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PolicyEditor } from './PolicyEditor';

vi.mock('../../api/client', () => ({
    api: {
        listSandboxes: vi.fn().mockResolvedValue({
            sandboxes: [
                { name: 'test-sandbox', status: 'running', phase: '' },
            ],
        }),
        getPresetsWithStatus: vi.fn().mockResolvedValue({
            ok: true,
            presets: [
                { name: 'strict', description: 'Strict network policy', applied: true },
                { name: 'permissive', description: 'Open access', applied: false },
            ],
        }),
        getSandboxPolicyYaml: vi.fn().mockResolvedValue({
            ok: true,
            yaml: 'sandbox:\n  network:\n    allowOutbound: true\n',
            version: 5,
            policyHash: 'deadbeef',
            policySource: 'sandbox',
        }),
        saveSandboxPolicyYaml: vi.fn().mockResolvedValue({
            ok: true,
            version: 6,
            policyHash: 'cafebabe',
            warnings: [],
        }),
        validatePolicy: vi.fn().mockResolvedValue({
            valid: true,
            errors: [],
            warnings: ['Consider restricting port range'],
        }),
        applyPolicy: vi.fn().mockResolvedValue({ ok: true, message: 'Applied strict' }),
        removePolicy: vi.fn().mockResolvedValue({ ok: true, message: 'Removed strict' }),
    },
}));

describe('PolicyEditor', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('renders with preset tab showing presets', async () => {
        render(<PolicyEditor />);
        expect(screen.getByText('\ud83d\udee1\ufe0f Security Policies')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByText('strict')).toBeInTheDocument();
            expect(screen.getByText('permissive')).toBeInTheDocument();
        });
    });

    it('shows active badge on applied presets', async () => {
        render(<PolicyEditor />);
        await waitFor(() => {
            expect(screen.getByText('Active')).toBeInTheDocument();
        });
    });

    it('switches to YAML editor tab', async () => {
        render(<PolicyEditor />);
        fireEvent.click(screen.getByTestId('tab-editor'));
        await waitFor(() => {
            expect(screen.getByTestId('yaml-editor')).toBeInTheDocument();
        });
    });

    it('loads YAML content in editor', async () => {
        render(<PolicyEditor />);
        fireEvent.click(screen.getByTestId('tab-editor'));
        await waitFor(() => {
            const editor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;
            expect(editor.value).toContain('allowOutbound');
        });
    });

    it('switches to validation tab', async () => {
        render(<PolicyEditor />);
        fireEvent.click(screen.getByTestId('tab-validation'));
        expect(screen.getByText(/OPA Rule Validation/)).toBeInTheDocument();
    });

    it('shows three tab buttons', () => {
        render(<PolicyEditor />);
        expect(screen.getByTestId('tab-presets')).toBeInTheDocument();
        expect(screen.getByTestId('tab-editor')).toBeInTheDocument();
        expect(screen.getByTestId('tab-validation')).toBeInTheDocument();
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CustomImageBuilder } from './CustomImageBuilder';

vi.mock('../../api/client', () => ({
    api: {
        listImages: vi.fn().mockResolvedValue({
            ok: true,
            images: [
                { id: 'abc123', tags: ['nemoclaw/custom:latest'], size: 52428800, sizeHuman: '50.0 MB', created: '2026-01-15T10:00:00Z' },
                { id: 'def456', tags: ['nemoclaw/base:v2'], size: 104857600, sizeHuman: '100.0 MB', created: '2026-01-10T10:00:00Z' },
            ],
        }),
        removeImage: vi.fn().mockResolvedValue({ ok: true, message: 'Removed' }),
    },
    streamImageBuild: vi.fn().mockReturnValue(() => {}),
}));

describe('CustomImageBuilder', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('renders build tab by default with Dockerfile editor', async () => {
        render(<CustomImageBuilder />);
        expect(screen.getByText('🐳 Container Images')).toBeInTheDocument();
        expect(screen.getByTestId('dockerfile-editor')).toBeInTheDocument();
        expect(screen.getByTestId('image-tag-input')).toBeInTheDocument();
        expect(screen.getByTestId('build-btn')).toBeInTheDocument();
    });

    it('switches to image library tab and shows images', async () => {
        render(<CustomImageBuilder />);
        fireEvent.click(screen.getByTestId('tab-images'));
        await waitFor(() => {
            expect(screen.getByText('nemoclaw/custom:latest')).toBeInTheDocument();
            expect(screen.getByText('nemoclaw/base:v2')).toBeInTheDocument();
        });
    });

    it('renders build arguments section', () => {
        render(<CustomImageBuilder />);
        expect(screen.getByText('Build Arguments')).toBeInTheDocument();
        fireEvent.click(screen.getByText('+ Add Arg'));
        const inputs = screen.getAllByPlaceholderText('ARG_NAME');
        expect(inputs).toHaveLength(1);
    });

    it('disables build button when dockerfile is empty', () => {
        render(<CustomImageBuilder />);
        const editor = screen.getByTestId('dockerfile-editor');
        fireEvent.change(editor, { target: { value: '' } });
        expect(screen.getByTestId('build-btn')).toBeDisabled();
    });
});

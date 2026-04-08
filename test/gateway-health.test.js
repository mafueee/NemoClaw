// Unit tests for gui/server/lib/gatewayHealth.js — configuration detection.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', async () => {
    const actual = await vi.importActual('fs');
    return { ...actual, readFileSync: vi.fn(), existsSync: vi.fn() };
});
vi.mock('../../gui/server/lib/grpcClient.js', () => ({ checkConnection: vi.fn() }));

import { readFileSync, existsSync } from 'fs';
import { isGatewayConfigured } from '../../gui/server/lib/gatewayHealth.js';

describe('gatewayHealth', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    describe('isGatewayConfigured', () => {
        it('returns false when active_cluster file does not exist', () => {
            existsSync.mockReturnValue(false);
            expect(isGatewayConfigured()).toBe(false);
        });
        it('returns false when active_cluster file is empty', () => {
            existsSync.mockReturnValue(true);
            readFileSync.mockReturnValue('   \n');
            expect(isGatewayConfigured()).toBe(false);
        });
        it('returns false when metadata file does not exist', () => {
            existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);
            readFileSync.mockReturnValue('nemoclaw');
            expect(isGatewayConfigured()).toBe(false);
        });
        it('returns true when both active_cluster and metadata exist', () => {
            existsSync.mockReturnValue(true);
            readFileSync.mockReturnValue('nemoclaw');
            expect(isGatewayConfigured()).toBe(true);
        });
        it('returns false when readFileSync throws', () => {
            existsSync.mockReturnValue(true);
            readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
            expect(isGatewayConfigured()).toBe(false);
        });
    });
});

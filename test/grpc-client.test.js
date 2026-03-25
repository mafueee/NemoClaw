// Unit tests for gui/server/lib/grpcClient.js — helper functions and DTO mappings.
// Tests only the pure helper functions (no gRPC connection required).

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';

const grpcClientPath = join(process.cwd(), 'gui', 'server', 'lib', 'grpcClient.js');
const { mapPhaseToStatus, sandboxToDto } = await import(pathToFileURL(grpcClientPath).href);

describe('grpcClient', () => {
    describe('mapPhaseToStatus', () => {
        it('maps READY to running', () => {
            expect(mapPhaseToStatus('SANDBOX_PHASE_READY')).toBe('running');
        });
        it('maps PROVISIONING to creating', () => {
            expect(mapPhaseToStatus('SANDBOX_PHASE_PROVISIONING')).toBe('creating');
        });
        it('maps ERROR to error', () => {
            expect(mapPhaseToStatus('SANDBOX_PHASE_ERROR')).toBe('error');
        });
        it('maps DELETING to stopped', () => {
            expect(mapPhaseToStatus('SANDBOX_PHASE_DELETING')).toBe('stopped');
        });
        it('maps UNKNOWN to unknown', () => {
            expect(mapPhaseToStatus('SANDBOX_PHASE_UNKNOWN')).toBe('unknown');
        });
        it('maps UNSPECIFIED to unknown', () => {
            expect(mapPhaseToStatus('SANDBOX_PHASE_UNSPECIFIED')).toBe('unknown');
        });
        it('maps undefined to unknown', () => {
            expect(mapPhaseToStatus(undefined)).toBe('unknown');
        });
    });

    describe('sandboxToDto', () => {
        it('converts a full proto Sandbox to frontend DTO', () => {
            const sandbox = {
                name: 'my-agent', id: 'sandbox-123',
                phase: 'SANDBOX_PHASE_READY', createdAtMs: '1711300000000',
                namespace: 'openshell', currentPolicyVersion: 3,
                spec: { template: { image: 'nemoclaw:latest' }, providers: ['nvidia-cloud'] },
                status: { conditions: [{ type: 'Ready', status: 'True', reason: 'Running', message: '' }] },
            };
            const dto = sandboxToDto(sandbox);
            expect(dto.name).toBe('my-agent');
            expect(dto.status).toBe('running');
            expect(dto.image).toBe('nemoclaw:latest');
            expect(dto.policyVersion).toBe(3);
            expect(dto.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
        });
        it('handles minimal sandbox', () => {
            const dto = sandboxToDto({ name: 'bare', id: 'sandbox-456', phase: 'SANDBOX_PHASE_PROVISIONING' });
            expect(dto.name).toBe('bare');
            expect(dto.status).toBe('creating');
            expect(dto.image).toBe('');
        });
        it('handles empty sandbox object', () => {
            const dto = sandboxToDto({});
            expect(dto.name).toBe('');
            expect(dto.status).toBe('unknown');
        });
    });
});

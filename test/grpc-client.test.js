// Unit tests for gui/server/lib/grpcClient.js — helper functions and DTO mappings.
// Tests only the pure helper functions (no gRPC connection required).

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';

// Dynamic import using absolute path to avoid ESM resolution issues from test/ dir
const grpcClientPath = join(process.cwd(), 'gui', 'server', 'lib', 'grpcClient.js');
const mod = await import(pathToFileURL(grpcClientPath).href);
const { mapPhaseToStatus, sandboxToDto, mapProviderToGrpcType } = mod;

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
                name: 'my-agent',
                id: 'sandbox-123',
                phase: 'SANDBOX_PHASE_READY',
                createdAtMs: '1711300000000',
                namespace: 'openshell',
                currentPolicyVersion: 3,
                spec: {
                    template: { image: 'nemoclaw:latest' },
                    providers: ['nvidia-cloud'],
                },
                status: {
                    conditions: [
                        { type: 'Ready', status: 'True', reason: 'Running', message: '' },
                    ],
                },
            };

            const dto = sandboxToDto(sandbox);

            expect(dto.name).toBe('my-agent');
            expect(dto.id).toBe('sandbox-123');
            expect(dto.status).toBe('running');
            expect(dto.phase).toBe('SANDBOX_PHASE_READY');
            expect(dto.image).toBe('nemoclaw:latest');
            expect(dto.namespace).toBe('openshell');
            expect(dto.policyVersion).toBe(3);
            expect(dto.providers).toEqual(['nvidia-cloud']);
            expect(dto.conditions).toHaveLength(1);
            expect(dto.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
        });

        it('handles minimal sandbox with missing optional fields', () => {
            const dto = sandboxToDto({
                name: 'bare',
                id: 'sandbox-456',
                phase: 'SANDBOX_PHASE_PROVISIONING',
            });

            expect(dto.name).toBe('bare');
            expect(dto.status).toBe('creating');
            expect(dto.image).toBe('');
            expect(dto.createdAt).toBe('');
            expect(dto.policyVersion).toBe(0);
            expect(dto.providers).toEqual([]);
            expect(dto.conditions).toEqual([]);
        });

        it('handles empty sandbox object', () => {
            const dto = sandboxToDto({});
            expect(dto.name).toBe('');
            expect(dto.id).toBe('');
            expect(dto.status).toBe('unknown');
        });
    });

    describe('exported gRPC wrappers', () => {
        it('exports all expected wrapper functions', () => {
            const expectedFunctions = [
                // Sandbox lifecycle
                'listSandboxes', 'getSandbox', 'createSandbox', 'deleteSandbox',
                'watchSandbox', 'execSandbox', 'getSandboxLogs',
                // Provider CRUD
                'listProviders', 'getProvider', 'createProvider', 'updateProvider', 'deleteProvider',
                // Inference
                'getClusterInference', 'setClusterInference', 'getInferenceBundle',
                // Policy / Config
                'getSandboxConfig', 'getGatewayConfig', 'updateConfig', 'createSshSession',
                'getDraftPolicy', 'approveDraftChunk', 'rejectDraftChunk',
                // Connection
                'getGrpcClients', 'resetGrpcClients', 'checkConnection', 'health',
                // Helpers
                'mapPhaseToStatus', 'sandboxToDto',
            ];

            for (const fn of expectedFunctions) {
                expect(typeof mod[fn]).toBe('function');
            }
        });

        it('exports updateProvider as a function', () => {
            expect(typeof mod.updateProvider).toBe('function');
        });

        it('exports updateConfig as a function', () => {
            expect(typeof mod.updateConfig).toBe('function');
        });

        it('exports getGatewayConfig as a function', () => {
            expect(typeof mod.getGatewayConfig).toBe('function');
        });

        it('exports createSshSession as a function', () => {
            expect(typeof mod.createSshSession).toBe('function');
        });
    });

    describe('mapProviderToGrpcType', () => {
        it('maps NVIDIA cloud to nvidia', () => {
            expect(mapProviderToGrpcType('cloud')).toBe('nvidia');
        });

        it('maps NIM local to nvidia', () => {
            expect(mapProviderToGrpcType('nim-local')).toBe('nvidia');
        });

        it('maps OpenRouter to openai', () => {
            expect(mapProviderToGrpcType('openrouter')).toBe('openai');
        });

        it('maps Gemini to openai', () => {
            expect(mapProviderToGrpcType('gemini')).toBe('openai');
        });

        it('maps Ollama to openai', () => {
            expect(mapProviderToGrpcType('ollama')).toBe('openai');
        });

        it('maps vLLM to openai', () => {
            expect(mapProviderToGrpcType('vllm')).toBe('openai');
        });

        it('defaults unknown providers to openai', () => {
            expect(mapProviderToGrpcType('some-custom-provider')).toBe('openai');
        });
    });
});

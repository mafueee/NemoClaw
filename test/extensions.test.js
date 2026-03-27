// Unit tests for the NemoClaw Extensions system.
// Tests the extension registry integrity and API route validation.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const REGISTRY_PATH = join(ROOT, 'nemoclaw-blueprint', 'extensions', 'registry.json');
const PRESETS_DIR = join(ROOT, 'nemoclaw-blueprint', 'policies', 'presets');

describe('Extension Registry', () => {
    it('registry.json exists and is valid JSON', () => {
        expect(existsSync(REGISTRY_PATH)).toBe(true);
        const raw = readFileSync(REGISTRY_PATH, 'utf-8');
        const extensions = JSON.parse(raw);
        expect(Array.isArray(extensions)).toBe(true);
        expect(extensions.length).toBeGreaterThan(0);
    });

    it('all extensions have required fields', () => {
        const extensions = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
        const requiredFields = ['id', 'name', 'description', 'icon', 'category', 'policyPreset'];

        for (const ext of extensions) {
            for (const field of requiredFields) {
                expect(ext).toHaveProperty(field);
                expect(ext[field]).toBeTruthy();
            }
        }
    });

    it('all extension IDs are unique', () => {
        const extensions = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
        const ids = extensions.map(e => e.id);
        const uniqueIds = [...new Set(ids)];
        expect(ids.length).toBe(uniqueIds.length);
    });

    it('all referenced policy presets exist on disk', () => {
        const extensions = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
        for (const ext of extensions) {
            const presetPath = join(PRESETS_DIR, `${ext.policyPreset}.yaml`);
            expect(existsSync(presetPath)).toBe(true);
        }
    });

    it('categories are from the allowed set', () => {
        const extensions = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
        const allowedCategories = ['messaging', 'devtools', 'registry', 'productivity'];
        for (const ext of extensions) {
            expect(allowedCategories).toContain(ext.category);
        }
    });

    it('credentialKey is either null or a non-empty string', () => {
        const extensions = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
        for (const ext of extensions) {
            if (ext.credentialKey !== null) {
                expect(typeof ext.credentialKey).toBe('string');
                expect(ext.credentialKey.length).toBeGreaterThan(0);
            }
        }
    });

    it('installCommands is an array', () => {
        const extensions = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
        for (const ext of extensions) {
            expect(Array.isArray(ext.installCommands)).toBe(true);
        }
    });

    it('includes known extensions: discord, telegram, slack', () => {
        const extensions = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
        const ids = extensions.map(e => e.id);
        expect(ids).toContain('discord');
        expect(ids).toContain('telegram');
        expect(ids).toContain('slack');
    });

    it('discord extension has correct structure', () => {
        const extensions = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
        const discord = extensions.find(e => e.id === 'discord');
        expect(discord).toBeDefined();
        expect(discord.policyPreset).toBe('discord');
        expect(discord.credentialKey).toBe('DISCORD_BOT_TOKEN');
        expect(discord.category).toBe('messaging');
        expect(discord.installCommands.length).toBeGreaterThan(0);
    });
});

// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInterface } from './ChatInterface';

describe('ChatInterface', () => {
    it('renders the page header', () => {
        render(<ChatInterface />);
        expect(screen.getAllByText('💬 Agent Chat').length).toBeGreaterThan(0);
    });

    it('shows the welcome message', () => {
        render(<ChatInterface />);
        expect(screen.getAllByText(/Welcome to the OpenClaw Agent Chat/).length).toBeGreaterThan(0);
    });

    it('renders the input area', () => {
        render(<ChatInterface />);
        const textareas = screen.getAllByPlaceholderText(/Type a message/);
        expect(textareas.length).toBeGreaterThan(0);
    });

    it('renders the send button', () => {
        render(<ChatInterface />);
        expect(screen.getAllByText('Send').length).toBeGreaterThan(0);
    });

    it('send button is disabled when input is empty', () => {
        render(<ChatInterface />);
        const sendBtns = screen.getAllByText('Send');
        expect(sendBtns[0]).toBeDisabled();
    });

    it('send button is enabled when input has text', async () => {
        const user = userEvent.setup();
        render(<ChatInterface />);
        const textareas = screen.getAllByPlaceholderText(/Type a message/);
        await user.type(textareas[0], 'Hello!');
        const sendBtns = screen.getAllByText('Send');
        expect(sendBtns[0]).not.toBeDisabled();
    });

});

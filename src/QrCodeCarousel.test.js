import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import * as fs from 'fs';
import yaml from 'js-yaml';
import QrCodeCarousel from './QrCodeCarousel';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,mock-qr-code')),
}));

// Polyfill TextEncoder and TextDecoder (DEFINITELY before any qrcode usage)
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Mock both fs and window.showOpenFilePicker
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

// Mock window.showOpenFilePicker
const mockShowOpenFilePicker = jest.fn();
global.window = Object.create(window);
global.window.showOpenFilePicker = mockShowOpenFilePicker;

describe('QrCodeCarousel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShowOpenFilePicker.mockReset();
    global.window = Object.create(window);
    global.window.showOpenFilePicker = mockShowOpenFilePicker;
    localStorage.clear();
  });

  // Helper function to mock file selection
  const mockFileSelection = (data) => {
    mockShowOpenFilePicker.mockResolvedValue([{ getFile: () => ({ text: () => Promise.resolve(yaml.dump(data)) }) }]);
  };

  test('renders fallback button when File System Access API is unavailable', async () => {
    // Mock the absence of the File System Access API
    delete window.showOpenFilePicker;

    await act(async () => {
      render(<QrCodeCarousel />);
    });

    expect(screen.getByText('No qrcode data available. Please select a file.')).toBeInTheDocument();
    expect(screen.getByText('Select qrdata.yaml').closest('button')).toBeTruthy();
  });

  test('renders File System Access API button when available', async () => {
    // Mock the presence of the File System Access API
    window.showOpenFilePicker = jest.fn();

    await act(async () => {
      render(<QrCodeCarousel />);
    });

    expect(screen.getByText('No qrcode data available. Please select a file.')).toBeInTheDocument();
    expect(screen.getByText('Select qrdata.yaml').closest('button')).toBeTruthy();
  });

  test('loads contacts from localStorage if available', async () => {
    const mockContacts = [{ url: 'https://example.com', description: 'Example' }];
    localStorage.setItem('QrData', JSON.stringify(mockContacts)); // Updated key

    await act(async () => {
      render(<QrCodeCarousel />);
    });

    // Check for the description from the mock data
    expect(screen.getByText('Example')).toBeInTheDocument();
  });

  test('handles invalid localStorage data gracefully', async () => {
    localStorage.setItem('QrData', 'invalid-json'); // Updated key

    await act(async () => {
      render(<QrCodeCarousel />);
    });

    // Check for the actual rendered message
    expect(screen.getByText('Error: Invalid data in localStorage')).toBeInTheDocument();
  });

  test('renders error message when an error occurs', async () => {
    // Mock the File System Access API to throw an error
    mockShowOpenFilePicker.mockImplementation(() => {
      throw new Error('File picker error');
    });

    // Mock console.error
    const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      render(<QrCodeCarousel />);
    });

    // Simulate clicking the "Select qrdata.yaml" button
    const selectFileButton = screen.getByText('Select qrdata.yaml');
    await act(async () => {
      fireEvent.click(selectFileButton);
    });

    // Check for the actual rendered error message
    await waitFor(() => {
      expect(screen.getByText('Error: File picker error')).toBeInTheDocument();
    });

    // Assert that console.error was called
    expect(consoleErrorMock).toHaveBeenCalledWith(
      'Error loading qrdata.yaml:',
      expect.any(Error)
    );

    // Restore console.error
    consoleErrorMock.mockRestore();
  });

  test('renders carousel controls and allows navigation', async () => {
    const mockContacts = [
      { url: 'https://example1.com', description: 'Example 1' },
      { url: 'https://example2.com', description: 'Example 2' },
    ];
    localStorage.setItem('QrData', JSON.stringify(mockContacts)); // Updated key

    await act(async () => {
      render(<QrCodeCarousel />);
    });

    expect(screen.getByRole('button', { name: 'Previous slide' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next slide' })).toBeInTheDocument();

    // Navigate to the next slide and check for the updated description
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    });
    expect(screen.getByText('Example 2')).toBeInTheDocument();
  });

  test('loads contacts from a selected file', async () => {
    // Mock the file selection and file content
    const mockContactsData = [
      { url: 'https://example.com/test', description: 'Test Description' },
    ];
    mockFileSelection(mockContactsData);

    await act(async () => {
      render(<QrCodeCarousel />);
    });

    const selectFileButton = screen.getByRole('button', { name: /Select qrdata.yaml/i });
    await act(async () => {
      fireEvent.click(selectFileButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Test Description')).toBeInTheDocument();
    });
  });

  test('renders the first contact on initial render', async () => {
    // Mock the localStorage data to simulate existing contacts
    const mockContactsData = [
      { url: 'https://example.com/test', description: 'Test Description' },
    ];
    localStorage.setItem('QrData', JSON.stringify(mockContactsData)); // Updated key

    await act(async () => {
      render(<QrCodeCarousel />);
    });

    // Wait for the first contact to be rendered
    await waitFor(() => {
      expect(screen.getByText('Test Description')).toBeInTheDocument();
    });
  });

  test('displays the next contact when the "Next" button is clicked', async () => {
    // Mock the localStorage data to simulate existing contacts
    const mockContactsData = [
      { url: 'https://example.com/test1', description: 'Test Description 1' },
      { url: 'https://example.com/test2', description: 'Test Description 2' },
    ];
    localStorage.setItem('QrData', JSON.stringify(mockContactsData)); // Updated key

    await act(async () => {
      render(<QrCodeCarousel />);
    });

    // Ensure the first contact is displayed
    expect(screen.getByText('Test Description 1')).toBeInTheDocument();

    // Click the "Next slide" button and check for the second contact
    const nextButton = screen.getByRole('button', { name: /Next slide/i });
    await act(async () => {
      fireEvent.click(nextButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Test Description 2')).toBeInTheDocument();
    });
  });

  test('displays the previous contact when the "Previous" button is clicked', async () => {
    // Mock the localStorage data to simulate existing contacts
    const mockContactsData = [
      { url: 'https://example.com/test1', description: 'Test Description 1' },
      { url: 'https://example.com/test2', description: 'Test Description 2' },
    ];
    localStorage.setItem('QrData', JSON.stringify(mockContactsData)); // Updated key

    await act(async () => {
      render(<QrCodeCarousel />);
    });

    // Ensure the second contact is displayed after navigating forward
    const nextButton = screen.getByRole('button', { name: /Next slide/i });
    await act(async () => {
      fireEvent.click(nextButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Test Description 2')).toBeInTheDocument();
    });

    // Click the "Previous slide" button and check for the first contact
    const prevButton = screen.getByRole('button', { name: /Previous slide/i });
    await act(async () => {
      fireEvent.click(prevButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Test Description 1')).toBeInTheDocument();
    });
  });

  test('wraps around to the first contact from the last', async () => {
    // Mock the localStorage data to simulate multiple contacts
    const mockContactsData = [
      { url: 'https://example.com/test1', description: 'Test Description 1' },
      { url: 'https://example.com/test2', description: 'Test Description 2' },
      { url: 'https://example.com/test3', description: 'Test Description 3' },
    ];
    localStorage.setItem('QrData', JSON.stringify(mockContactsData)); // Updated key

    await act(async () => {
      render(<QrCodeCarousel />);
    });

    // Navigate to the last contact
    const nextButton = screen.getByRole('button', { name: /Next slide/i });
    for (let i = 0; i < mockContactsData.length - 1; i++) {
      await act(async () => {
        fireEvent.click(nextButton);
      });
    }

    // Ensure the last contact is displayed
    await waitFor(() => {
      expect(screen.getByText('Test Description 3')).toBeInTheDocument();
    });

    // Click next to wrap around to the first contact
    await act(async () => {
      fireEvent.click(nextButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Test Description 1')).toBeInTheDocument();
    });
  });

  test('wraps around to the last contact from the first', async () => {
    // Mock the localStorage data to simulate multiple contacts
    const mockContactsData = [
      { url: 'https://example.com/test1', description: 'Test Description 1' },
      { url: 'https://example.com/test2', description: 'Test Description 2' },
      { url: 'https://example.com/test3', description: 'Test Description 3' },
    ];
    localStorage.setItem('QrData', JSON.stringify(mockContactsData)); // Updated key

    await act(async () => {
      render(<QrCodeCarousel />);
    });

    // Ensure the first contact is displayed
    expect(screen.getByText('Test Description 1')).toBeInTheDocument();

    // Click the "Previous slide" button to wrap around to the last contact
    const prevButton = screen.getByRole('button', { name: /Previous slide/i });
    await act(async () => {
      fireEvent.click(prevButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Test Description 3')).toBeInTheDocument();
    });
  });
});

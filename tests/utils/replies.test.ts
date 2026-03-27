import { describe, expect, it, vi } from 'vitest';
import {
  buildErrorMessage,
  buildWeatherReply,
  escapeHtml,
} from '../../utils/bot/replies';

vi.mock('../../bot', () => ({
  rule: {
    nextInvocationDate: vi.fn(),
  },
  job: {
    nextInvocation: vi.fn(() => new Date('2026-03-10T09:50:00+08:00')),
  },
}));

describe('replies', () => {
  it('builds weather reply with both sites and latest update time', () => {
    const message = buildWeatherReply(
      {
        heatStress: 'Low',
        wbgt: '29.1',
        airTemp: 31.4,
        emoji: '🟢',
        dateTime: '2026-03-02T10:00:00+08:00',
      },
      {
        heatStress: 'Moderate',
        wbgt: '30.4',
        airTemp: 32.1,
        emoji: '🟡',
        dateTime: '2026-03-02T10:00:00+08:00',
      },
    );

    expect(message).toContain('<b>CDA</b>:');
    expect(message).toContain('Heat Stress: Low 🟢');
    expect(message).toContain('<b>HTTC</b>:');
    expect(message).toContain('Heat Stress: Moderate 🟡');
  });

  it('adds job and next update lines when optional dates are provided', () => {
    const message = buildWeatherReply(
      {
        heatStress: 'Low',
        wbgt: '29.1',
        airTemp: 31.4,
        emoji: '🟢',
        dateTime: '2026-03-02T10:00:00+08:00',
      },
      {
        heatStress: 'Low',
        wbgt: '29.1',
        airTemp: 31.4,
        emoji: '🟢',
        dateTime: '2026-03-02T10:00:00+08:00',
      },
      {
        jobDate: new Date('2026-03-02T11:50:00+08:00'),
        nextUpdate: new Date('2026-03-02T13:50:00+08:00'),
      },
    );

    expect(message).toContain('Updated:');
    expect(message).toContain('Next update:');
  });

  it('escapes HTML special characters used by the bot', () => {
    const escaped = escapeHtml('A & B <value>');
    expect(escaped).toBe('A &amp; B &lt;value&gt;');
  });

  it('builds error message with status code and message from axios-like error', () => {
    const message = buildErrorMessage({
      type: 'weather fetch failure',
      message: 'Failed to fetch weather data',
      error: {
        response: {
          status: 503,
          data: {
            message: 'Service unavailable',
          },
        },
      },
    });

    expect(message).toContain('Status code: 503');
    expect(message).toContain('Error: Service unavailable');
    expect(message).toContain('Failed to fetch weather data');
  });

  it('builds error message for runtime errors without status code', () => {
    const message = buildErrorMessage({
      type: 'weather fetch failure',
      message: 'Something went wrong',
      error: new SyntaxError('Unexpected token } in JSON at position 4'),
    });

    expect(message).toContain('Status code: UNKNOWN');
    expect(message).toContain(
      'Error: Unexpected token } in JSON at position 4',
    );
    expect(message).toContain('Something went wrong');
  });

  it('escapes dynamic HTML in weather replies without affecting headings', () => {
    const message = buildWeatherReply(
      {
        heatStress: 'Low & steady',
        wbgt: '29.1',
        airTemp: 31.4,
        emoji: '<ok>',
        dateTime: '2026-03-02T10:00:00+08:00',
      },
      {
        heatStress: 'Moderate',
        wbgt: '30.4',
        airTemp: 32.1,
        emoji: '🟡',
        dateTime: '2026-03-02T10:00:00+08:00',
      },
      { isCached: true },
    );

    expect(message).toContain('<b>CDA</b>:');
    expect(message).toContain('Low &amp; steady');
    expect(message).toContain('&lt;ok&gt;');
    expect(message).toContain('⚡ Cache hit');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildWeatherFetchFailedMessage,
  buildWeatherReply,
  escapeMarkdownV2,
} from '../../utils/bot/replies';

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

    expect(message).toContain('*CDA*:');
    expect(message).toContain('Heat Stress: Low 🟢');
    expect(message).toContain('*HTTC*:');
    expect(message).toContain('Heat Stress: Moderate 🟡');
    expect(message).toContain('Last updated:');
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

    expect(message).toContain('Job date:');
    expect(message).toContain('Next Update:');
  });

  it('escapes markdown v2 special characters used by the bot', () => {
    const escaped = escapeMarkdownV2('A.test (value)');
    expect(escaped).toBe('A\\.test \\(value\\)');
  });

  it('builds weather fetch error message with status code and message from axios-like error', () => {
    const message = buildWeatherFetchFailedMessage({
      response: {
        status: 503,
        data: {
          message: 'Service unavailable',
        },
      },
    });

    expect(message).toContain('Status code: 503');
    expect(message).toContain('Error: Service unavailable');
    expect(message).toContain('Please try /weather again in a few moments.');
  });

  it('builds weather fetch error message for runtime errors without status code', () => {
    const message = buildWeatherFetchFailedMessage(
      new SyntaxError('Unexpected token } in JSON at position 4'),
    );

    expect(message).toContain('Status code: UNKNOWN');
    expect(message).toContain(
      'Error: Unexpected token } in JSON at position 4',
    );
    expect(message).toContain('Please try /weather again in a few moments.');
  });
});

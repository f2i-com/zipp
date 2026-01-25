/**
 * Logger Tests
 *
 * Tests for the structured logging utility.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Logger, createLogger, type LogEntry, type LogHandler } from '../logger';

describe('Logger', () => {
  describe('Basic Logging', () => {
    let logger: Logger;
    let mockHandler: jest.Mock<LogHandler>;

    beforeEach(() => {
      logger = new Logger('TestSource', { minLevel: 'debug' });
      mockHandler = jest.fn();
      logger.addHandler(mockHandler);
    });

    it('should log info messages', () => {
      logger.info('test message');

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          source: 'TestSource',
          message: 'test message',
        })
      );
    });

    it('should log error messages', () => {
      logger.error('error occurred');

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          source: 'TestSource',
          message: 'error occurred',
        })
      );
    });

    it('should log warn messages', () => {
      logger.warn('warning message');

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          source: 'TestSource',
          message: 'warning message',
        })
      );
    });

    it('should log debug messages when level is debug', () => {
      logger.debug('debug info');

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
          source: 'TestSource',
          message: 'debug info',
        })
      );
    });

    it('should include timestamp in log entries', () => {
      logger.info('test');

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        })
      );
    });

    it('should include optional data in log entries', () => {
      const data = { userId: 123, action: 'login' };
      logger.info('user action', data);

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId: 123, action: 'login' },
        })
      );
    });
  });

  describe('Log Level Filtering', () => {
    it('should not log debug messages when minLevel is info', () => {
      const logger = new Logger('Test', { minLevel: 'info' });
      const mockHandler = jest.fn();
      logger.addHandler(mockHandler);

      logger.debug('should not appear');

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should log error messages regardless of minLevel', () => {
      const logger = new Logger('Test', { minLevel: 'error' });
      const mockHandler = jest.fn();
      logger.addHandler(mockHandler);

      logger.error('should appear');
      logger.warn('should not appear');
      logger.info('should not appear');
      logger.debug('should not appear');

      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error' })
      );
    });

    it('should allow changing minLevel at runtime', () => {
      const logger = new Logger('Test', { minLevel: 'error' });
      const mockHandler = jest.fn();
      logger.addHandler(mockHandler);

      logger.info('should not appear');
      expect(mockHandler).not.toHaveBeenCalled();

      logger.setMinLevel('info');
      logger.info('should appear');
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Handler Management', () => {
    it('should support multiple handlers', () => {
      const logger = new Logger('Test', { minLevel: 'debug' });
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      logger.addHandler(handler1);
      logger.addHandler(handler2);
      logger.info('test');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should allow removing handlers', () => {
      const logger = new Logger('Test', { minLevel: 'debug' });
      const handler = jest.fn();

      logger.addHandler(handler);
      logger.info('first');
      expect(handler).toHaveBeenCalledTimes(1);

      logger.removeHandler(handler);
      logger.info('second');
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should continue logging if a handler throws', () => {
      const logger = new Logger('Test', { minLevel: 'debug' });
      const badHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const goodHandler = jest.fn();

      logger.addHandler(badHandler);
      logger.addHandler(goodHandler);

      // Should not throw
      expect(() => logger.info('test')).not.toThrow();

      // Good handler should still be called
      expect(goodHandler).toHaveBeenCalled();
    });
  });

  describe('Child Loggers', () => {
    it('should create child loggers with prefixed source', () => {
      const parent = new Logger('Parent', { minLevel: 'debug' });
      const child = parent.child('Child');
      const mockHandler = jest.fn();

      child.addHandler(mockHandler);
      child.info('test');

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'Parent:Child',
        })
      );
    });

    it('should inherit minLevel from parent', () => {
      const parent = new Logger('Parent', { minLevel: 'warn' });
      const child = parent.child('Child');
      const mockHandler = jest.fn();

      child.addHandler(mockHandler);
      child.info('should not appear');
      child.warn('should appear');

      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warn' })
      );
    });
  });

  describe('createLogger Helper', () => {
    it('should create a new logger instance', () => {
      const logger = createLogger('CustomSource');

      expect(logger).toBeInstanceOf(Logger);
    });

    it('should accept options', () => {
      const logger = createLogger('CustomSource', { minLevel: 'error' });
      const mockHandler = jest.fn();

      logger.addHandler(mockHandler);
      logger.info('should not appear');
      logger.error('should appear');

      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });
});

'use strict';

/**
 * Jest configuration — runs from project root.
 * This ensures all relative require() paths in tests resolve correctly.
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    '<rootDir>/apps/api/src/**/*.js',
    '<rootDir>/packages/**/*.js',
    '!<rootDir>/packages/database/migrations/**',
  ],
  moduleDirectories: ['node_modules', '<rootDir>/apps/api/node_modules'],
  moduleFileExtensions: ['js', 'json'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  testTimeout: 15000,
};

import { afterAll } from 'vitest';
import { cleanupFixtures } from './registry.js';

// Every integration suite removes the fixtures it created.
afterAll(async () => {
  await cleanupFixtures();
});

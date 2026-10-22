import { configure } from '@testing-library/react';

/**
 * Vitest setup file (`vitest.config.ts`): the full suite renders many console pages in parallel
 * jsdom workers, where the testing library's default 1 s wait for an element is too short under
 * load (pages that pass alone time out in the full run). Five seconds for every `findBy*` / `waitFor`.
 */
configure({ asyncUtilTimeout: 5000 });

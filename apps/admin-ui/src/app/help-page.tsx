import { DocBrowser } from '@burojs/ui-shadcn';
import type * as React from 'react';

/**
 * The handbook page body. `<DocBrowser>` lists every documented scope and the
 * glossary from `DocsConfig` (`../docs.ts`); the framework registers no route
 * for it, so the `help` custom page places this block.
 */
export const HelpPage = (): React.ReactElement => <DocBrowser />;

import { defineCustomPage } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { systemStatusBlock } from './system-status-block';

/** "System status": the platform's health, cron lag and this organization's queues (`itap:system-status`). */
export const systemStatusPage = defineCustomPage({
  name: 'system-status',
  icon: NAV_ICONS.systemStatus,
  path: '/system-status',
  texts: 'System status',
  section: NAV_SECTIONS.compliance,
  order: 90,
  body: (l) => [l.place(systemStatusBlock, { key: 'status' })],
});

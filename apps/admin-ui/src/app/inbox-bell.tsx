import { useCustomQuery, useT } from '@burojs/react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EnumBadge,
  cn,
  useLinkComponent,
} from '@burojs/ui-shadcn';
import { Bell } from 'lucide-react';
import type * as React from 'react';
import { NOTIFICATION_PRIORITY_ENUM } from '../enums/notifications';
import { type BellNotification, inboxSummary } from '../modules/notifications/inbox-ops';
import { INBOX_PATH, INBOX_POLL_MS } from '../modules/notifications/user-notification';
import { unreadBadge } from './unread-badge';

function LatestItem({ item }: { readonly item: BellNotification }): React.ReactElement {
  const RouterLink = useLinkComponent();
  const unread = item.read_at === null;
  return (
    <DropdownMenuItem asChild data-testid="inbox-bell:item" data-unread={unread}>
      <RouterLink href={`${INBOX_PATH}/${item.id}`} className="flex flex-col items-start gap-1">
        <span className={cn('line-clamp-2 text-sm', unread && 'font-semibold')}>{item.title}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <EnumBadge enumName={NOTIFICATION_PRIORITY_ENUM} value={item.priority} />
          {new Date(item.created_at).toLocaleString()}
        </span>
      </RouterLink>
    </DropdownMenuItem>
  );
}

/**
 * The header bell: the signed-in member's unread in-app notifications (read again every 30
 * seconds and after anything that changes the inbox), and a menu of the latest ones with a link
 * to the Inbox page.
 */
export function InboxBell(): React.ReactElement {
  const t = useT();
  const RouterLink = useLinkComponent();
  const summary = useCustomQuery(inboxSummary, {}, { refetchInterval: INBOX_POLL_MS });
  const unread = summary.data?.unread ?? 0;
  const latest = summary.data?.latest ?? [];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="inbox-bell"
          aria-label={t('console.inbox.bell', { params: { count: unread } })}
        >
          <Bell aria-hidden="true" />
          {unread > 0 ? (
            <Badge
              variant="destructive"
              data-testid="inbox-bell:count"
              className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px] leading-none"
            >
              {unreadBadge(unread)}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t('console.inbox.title', { params: { count: unread } })}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {summary.isError ? <p className="px-2 py-1.5 text-sm text-destructive">{t('console.inbox.failed')}</p> : null}
        {!summary.isError && latest.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">{t('console.inbox.empty')}</p>
        ) : null}
        {latest.map((item) => (
          <LatestItem key={item.id} item={item} />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild data-testid="inbox-bell:open">
          <RouterLink href={INBOX_PATH}>{t('console.inbox.open')}</RouterLink>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

'use client';

import { ChevronsUpDown, LogOut } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useGetIdentity, useLogout } from '@refinedev/core';
import { ThemeSwitch } from '../ThemeSwitch';
import { observer } from 'mobx-react-lite';
// import { authStore } from '@/shared/auth/authStore';

export const NavUser = observer(() => {
  const { isMobile } = useSidebar();
  const { mutate: logout } = useLogout();
  // NhostClient.auth.getUser();
  const { data: user } = useGetIdentity();
  const username = user?.name || 'Unknown user';

  console.log('user', user);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size='lg'
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
            >
              <Avatar className='h-8 w-8 rounded-lg'>
                <AvatarFallback className='rounded-lg'>A</AvatarFallback>
              </Avatar>
              <div className='grid flex-1 text-left text-sm leading-tight'>
                <span className='truncate font-semibold'>Admin</span>
                <span className='truncate text-xs'>{username}</span>
              </div>
              <ChevronsUpDown className='ml-auto size-4' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg'
            side={isMobile ? 'bottom' : 'top'}
            align='end'
            sideOffset={4}
          >
            <DropdownMenuLabel>{username}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className='flex justify-between items-center'>
              <span className='text-sm pl-2'>Theme:</span>
              <ThemeSwitch />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()}>
              <LogOut className='h-5 w-5 mr-2' />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
});

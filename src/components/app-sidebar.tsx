'use client';

import { Sidebar, SidebarContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail } from '@/components/ui/sidebar';
import { ArrowLeftRight, CheckSquare, Home, Zap } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ALL_NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/admin/aceabalize-v2', label: 'Aceabalize V2', icon: Zap },
  { href: '/admin/session-comparison', label: 'Session Comparison', icon: ArrowLeftRight },
  { href: '/admin/human-review', label: 'Human Review', icon: CheckSquare },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarMenu>
          {ALL_NAV.map(({ href, label, icon: Icon }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton
                asChild
                isActive={href === '/' ? pathname === href : pathname.startsWith(href)}
                tooltip={label}
              >
                <Link href={href}>
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

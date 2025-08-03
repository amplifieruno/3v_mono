import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  DashboardIcon,
  PersonIcon,
  CameraIcon,
  HomeIcon,
  BarChartIcon,
  GearIcon,
} from '@radix-ui/react-icons'

const navigation = [
  { name: 'Dashboard', href: '/', icon: DashboardIcon },
  { name: 'Identities', href: '/identities', icon: PersonIcon },
  { name: 'Devices', href: '/devices', icon: CameraIcon },
  { name: 'Facilities', href: '/facilities', icon: HomeIcon },
  { name: 'Analytics', href: '/analytics', icon: BarChartIcon },
  { name: 'Settings', href: '/settings', icon: GearIcon },
]

export function Sidebar() {
  const location = useLocation()

  return (
    <div className="w-64 bg-card border-r border-border">
      <div className="flex items-center px-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-foreground">ITAP</h1>
      </div>
      
      <nav className="mt-6">
        <ul className="space-y-1 px-3">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <li key={item.name}>
                <Link
                  to={item.href}
                  className={cn(
                    'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  <item.icon className="mr-3 h-4 w-4" />
                  {item.name}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
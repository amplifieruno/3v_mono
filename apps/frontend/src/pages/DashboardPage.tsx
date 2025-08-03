import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const stats = [
  {
    title: 'Total Identities',
    value: '1,234',
    description: 'Registered individuals',
    change: '+12%'
  },
  {
    title: 'Active Devices',
    value: '48',
    description: 'Online cameras',
    change: '+2'
  },
  {
    title: 'Facilities',
    value: '8',
    description: 'Monitored locations',
    change: '0'
  },
  {
    title: 'Live Tracking',
    value: '156',
    description: 'Currently detected',
    change: '-5'
  }
]

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your identity tracking and access platform
        </p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
              <div className="text-xs text-green-600 mt-1">
                {stat.change} from last hour
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest identity detections and events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Identity detected at Main Entrance</p>
                  <p className="text-sm text-muted-foreground">Employee John Doe</p>
                </div>
                <div className="text-sm text-muted-foreground">2 minutes ago</div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">New device registered</p>
                  <p className="text-sm text-muted-foreground">Camera #49 - Parking Lot</p>
                </div>
                <div className="text-sm text-muted-foreground">15 minutes ago</div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Unknown identity detected</p>
                  <p className="text-sm text-muted-foreground">Lobby Area - Alert sent</p>
                </div>
                <div className="text-sm text-muted-foreground">1 hour ago</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>
              Current status of platform components
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Face Recognition Service</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-muted-foreground">Online</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span>Database Connection</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-muted-foreground">Connected</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span>Real-time Tracking</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-muted-foreground">Active</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span>Storage Service</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm text-muted-foreground">85% Full</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
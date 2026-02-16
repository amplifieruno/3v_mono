import { FC, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface IdentityGrowthChartProps {
  data: Array<{ created_at: string }>;
}

export const IdentityGrowthChart: FC<IdentityGrowthChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    if (!data.length) return [];

    // Group by date and compute cumulative count
    const dateCounts = new Map<string, number>();
    const sortedData = [...data].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    for (const item of sortedData) {
      const date = new Date(item.created_at).toISOString().split('T')[0];
      dateCounts.set(date, (dateCounts.get(date) ?? 0) + 1);
    }

    // Fill last 30 days
    const result: Array<{ date: string; total: number }> = [];
    const now = new Date();
    let cumulative = 0;

    // Count items before the 30-day window
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 29);
    for (const item of sortedData) {
      if (new Date(item.created_at) < windowStart) {
        cumulative++;
      }
    }

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      cumulative += dateCounts.get(dateStr) ?? 0;
      result.push({
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        total: cumulative,
      });
    }

    return result;
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Identity Growth (30 days)</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className='text-muted-foreground text-sm py-8 text-center'>
            No data yet
          </p>
        ) : (
          <ResponsiveContainer width='100%' height={250}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id='colorTotal' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='5%' stopColor='#6366f1' stopOpacity={0.3} />
                  <stop offset='95%' stopColor='#6366f1' stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray='3 3' className='stroke-muted' />
              <XAxis
                dataKey='date'
                tick={{ fontSize: 12 }}
                className='fill-muted-foreground'
              />
              <YAxis
                tick={{ fontSize: 12 }}
                className='fill-muted-foreground'
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  color: 'hsl(var(--popover-foreground))',
                }}
              />
              <Area
                type='monotone'
                dataKey='total'
                stroke='#6366f1'
                fillOpacity={1}
                fill='url(#colorTotal)'
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

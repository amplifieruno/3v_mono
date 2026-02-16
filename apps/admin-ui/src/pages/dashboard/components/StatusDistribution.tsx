import { FC } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';

interface StatusDistributionProps {
  verified: number;
  unverified: number;
}

const COLORS = ['#22c55e', '#eab308'];

export const StatusDistribution: FC<StatusDistributionProps> = ({
  verified,
  unverified,
}) => {
  const data = [
    { name: 'Verified', value: verified },
    { name: 'Unverified', value: unverified },
  ];

  const total = verified + unverified;

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Status Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className='text-muted-foreground text-sm py-8 text-center'>
            No data yet
          </p>
        ) : (
          <ResponsiveContainer width='100%' height={250}>
            <PieChart>
              <Pie
                data={data}
                cx='50%'
                cy='50%'
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey='value'
              >
                {data.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  color: 'hsl(var(--popover-foreground))',
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

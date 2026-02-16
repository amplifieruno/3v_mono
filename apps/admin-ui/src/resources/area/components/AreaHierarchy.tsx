import { FC, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Building2Icon,
  LayersIcon,
  DoorOpenIcon,
  MapPinIcon,
  GridIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from 'lucide-react';

interface AreaNode {
  id: string;
  name: string;
  area_type: string;
  access_level: string;
  parent_id: string | null;
  status: string;
  capacity: number | null;
}

interface AreaHierarchyProps {
  areas: AreaNode[];
}

const areaTypeIcon = (type: string) => {
  switch (type) {
    case 'building':
      return <Building2Icon className='h-4 w-4' />;
    case 'floor':
      return <LayersIcon className='h-4 w-4' />;
    case 'room':
      return <DoorOpenIcon className='h-4 w-4' />;
    case 'zone':
      return <MapPinIcon className='h-4 w-4' />;
    case 'sector':
      return <GridIcon className='h-4 w-4' />;
    default:
      return <MapPinIcon className='h-4 w-4' />;
  }
};

const accessLevelColor = (level: string) => {
  switch (level) {
    case 'public':
      return 'default';
    case 'restricted':
      return 'secondary';
    case 'secure':
      return 'destructive';
    case 'classified':
      return 'outline';
    default:
      return 'secondary';
  }
};

const TreeNode: FC<{
  area: AreaNode;
  children: AreaNode[];
  allAreas: AreaNode[];
  level: number;
}> = ({ area, children, allAreas, level }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className='flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer'
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDownIcon className='h-3 w-3 text-muted-foreground shrink-0' />
          ) : (
            <ChevronRightIcon className='h-3 w-3 text-muted-foreground shrink-0' />
          )
        ) : (
          <span className='w-3' />
        )}
        <span className='text-muted-foreground shrink-0'>
          {areaTypeIcon(area.area_type)}
        </span>
        <span className='text-sm font-medium truncate'>{area.name}</span>
        <Badge
          variant={accessLevelColor(area.access_level) as 'default' | 'secondary' | 'destructive' | 'outline'}
          className='text-xs shrink-0'
        >
          {area.access_level}
        </Badge>
        {area.capacity && (
          <span className='text-xs text-muted-foreground shrink-0'>
            cap: {area.capacity}
          </span>
        )}
      </div>
      {expanded &&
        hasChildren &&
        children.map((child) => (
          <TreeNode
            key={child.id}
            area={child}
            children={allAreas.filter((a) => a.parent_id === child.id)}
            allAreas={allAreas}
            level={level + 1}
          />
        ))}
    </div>
  );
};

export const AreaHierarchy: FC<AreaHierarchyProps> = ({ areas }) => {
  const rootAreas = areas.filter((a) => !a.parent_id);

  return (
    <div className='space-y-0.5'>
      {rootAreas.map((area) => (
        <TreeNode
          key={area.id}
          area={area}
          children={areas.filter((a) => a.parent_id === area.id)}
          allAreas={areas}
          level={0}
        />
      ))}
    </div>
  );
};

import { type ScalarInputProps, useT } from '@burojs/react';
import { Button } from '@burojs/ui-shadcn';
import { Eraser } from 'lucide-react';
import * as React from 'react';
import { PlanCanvas } from './plan-canvas';
import { idOf, usePlanContext } from './plan-context';
import { parsePoint } from './plan-geometry';
import type { PlanPositionMeta } from './plan-position-meta';
import { PlanShapeOutline } from './plan-shape-outline';
import { publishPlanSize } from './plan-size-registry';
import { PlanStateNote } from './plan-state-note';

/**
 * Places a point with a click on the floor plan of the record's area (that area's plan, else
 * the nearest enclosing area's); the area shapes on the plan are shown faintly for orientation.
 * A new click moves the point; Clear removes it.
 */
export function PlanPositionInput(
  props: ScalarInputProps<unknown, PlanPositionMeta>,
): React.ReactElement {
  const {
    value,
    onChange,
    onBlur,
    disabled,
    readOnly,
    meta,
    record,
    form,
    testIds,
    accessibility,
  } = props;
  const t = useT();
  const point = parsePoint(value);
  const state = usePlanContext({
    facilityId: idOf(form?.[meta.facilityField]) ?? idOf(record?.[meta.facilityField]),
    selfId: null,
    startId: idOf((form ?? record)?.[meta.areaField]),
  });
  const plan = state.status === 'ready' ? state.plan : null;
  React.useEffect(
    () => (plan ? publishPlanSize(meta.channel, plan.size) : undefined),
    [plan, meta.channel],
  );
  const locked = disabled === true || readOnly === true;
  const write = (next: unknown): void => {
    onChange?.(next);
    onBlur?.();
  };

  return (
    <div
      className="flex flex-col gap-2"
      data-testid={testIds.input}
      aria-describedby={accessibility.description}
    >
      {state.status !== 'ready' ? (
        <PlanStateNote state={state} />
      ) : (
        <PlanCanvas
          size={state.plan.size}
          imageFileId={state.plan.image_file_id}
          label={t('console.planPosition.canvas', { params: { plan: state.plan.name } })}
          testId="plan-position-canvas"
          className="max-w-3xl"
          {...(locked ? {} : { onPick: (next) => write([...next]) })}
        >
          {state.areas.map((area) =>
            area.shape ? (
              <PlanShapeOutline
                key={area.id}
                shape={area.shape}
                title={area.name}
                className="fill-muted-foreground/5 stroke-muted-foreground/40"
              />
            ) : null,
          )}
          {point ? (
            <circle
              cx={point[0]}
              cy={point[1]}
              r={Math.max(state.plan.size.width, state.plan.size.height) / 90}
              className="fill-primary stroke-background stroke-2"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </PlanCanvas>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {point
            ? t('console.planPosition.at', { params: { x: point[0], y: point[1] } })
            : t('console.planPosition.hint')}
        </span>
        {locked || value === null || value === undefined ? null : (
          <Button type="button" size="sm" variant="ghost" onClick={() => write(null)}>
            <Eraser className="size-4" aria-hidden />
            {t('console.planPosition.clear')}
          </Button>
        )}
      </div>
    </div>
  );
}

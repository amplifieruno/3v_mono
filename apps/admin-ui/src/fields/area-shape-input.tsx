import { type ScalarInputProps, useT } from '@burojs/react';
import { Button } from '@burojs/ui-shadcn';
import { Circle, Eraser, Pentagon, Undo2 } from 'lucide-react';
import * as React from 'react';
import {
  type ShapeHandle,
  type ShapeMode,
  applyClick,
  applyDrag,
  removeLastPoint,
  ringOf,
} from './area-shape-edit';
import type { AreaShapeMeta } from './area-shape-meta';
import { PlanCanvas } from './plan-canvas';
import { idOf, usePlanContext } from './plan-context';
import { parseShape } from './plan-geometry';
import { publishPlanSize } from './plan-size-registry';
import { PlanShapeHandles } from './plan-shape-handles';
import { PlanShapeOutline } from './plan-shape-outline';
import { PlanStateNote } from './plan-state-note';

/**
 * Draws an area's outline over the floor plan it lies on (its own plan, else the nearest
 * enclosing area's). Polygon mode: each click adds an outline point; circle mode: the first
 * click sets the centre, the next ones the radius. Points and the centre can be dragged.
 * The other shapes on the plan are shown faintly. The plan's size is published for the
 * field's validator, which keeps every point on the image.
 */
export function AreaShapeInput(
  props: ScalarInputProps<unknown, AreaShapeMeta>,
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
  const shape = parseShape(value);
  const [mode, setMode] = React.useState<ShapeMode>(
    shape?.type === 'Circle' ? 'circle' : 'polygon',
  );
  const [dragging, setDragging] = React.useState<ShapeHandle | null>(null);
  const selfId = meta.selfIsArea ? idOf(record?.id) : null;
  const state = usePlanContext({
    facilityId: idOf(form?.[meta.facilityField]) ?? idOf(record?.[meta.facilityField]),
    selfId,
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
  const points = ringOf(shape);
  const status =
    shape?.type === 'Circle'
      ? t('console.areaShape.circle', { params: { radius: shape.radius } })
      : points.length > 0
        ? t('console.areaShape.points', { params: { count: points.length } })
        : t(mode === 'circle' ? 'console.areaShape.hintCircle' : 'console.areaShape.hintPolygon');

  return (
    <div
      className="flex flex-col gap-2"
      data-testid={testIds.input}
      aria-describedby={accessibility.description}
    >
      {locked ? null : (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t('console.areaShape.tools')}
        >
          <Button
            type="button"
            size="sm"
            variant={mode === 'polygon' ? 'default' : 'outline'}
            aria-pressed={mode === 'polygon'}
            onClick={() => setMode('polygon')}
          >
            <Pentagon className="size-4" aria-hidden />
            {t('console.areaShape.polygon')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'circle' ? 'default' : 'outline'}
            aria-pressed={mode === 'circle'}
            onClick={() => setMode('circle')}
          >
            <Circle className="size-4" aria-hidden />
            {t('console.areaShape.circleMode')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={points.length === 0}
            onClick={() => write(removeLastPoint(shape))}
          >
            <Undo2 className="size-4" aria-hidden />
            {t('console.areaShape.undo')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={value === null || value === undefined}
            onClick={() => write(null)}
          >
            <Eraser className="size-4" aria-hidden />
            {t('console.areaShape.clear')}
          </Button>
        </div>
      )}
      {state.status !== 'ready' ? (
        <PlanStateNote state={state} />
      ) : (
        <PlanCanvas
          size={state.plan.size}
          imageFileId={state.plan.image_file_id}
          label={t('console.areaShape.canvas', { params: { plan: state.plan.name } })}
          testId="area-shape-canvas"
          className="max-w-3xl"
          {...(locked
            ? {}
            : {
                onPick: (point) => {
                  if (dragging === null) write(applyClick(shape, mode, point, state.plan.size));
                },
                onDrag: (point) => {
                  if (dragging !== null) onChange?.(applyDrag(shape, dragging, point));
                },
                onDragEnd: () => {
                  if (dragging !== null) onBlur?.();
                  // After the click that ends a drag, so that click adds no point.
                  window.setTimeout(() => setDragging(null), 0);
                },
              })}
        >
          {state.areas
            .filter((area) => area.id !== selfId && area.shape !== null)
            .map((area) =>
              area.shape ? (
                <PlanShapeOutline
                  key={area.id}
                  shape={area.shape}
                  title={area.name}
                  className="fill-muted-foreground/5 stroke-muted-foreground/40 [stroke-dasharray:4_4]"
                />
              ) : null,
            )}
          {shape ? (
            <PlanShapeOutline shape={shape} className="fill-primary/20 stroke-primary stroke-2" />
          ) : null}
          {shape && !locked ? (
            <PlanShapeHandles shape={shape} size={state.plan.size} onGrab={setDragging} />
          ) : null}
        </PlanCanvas>
      )}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

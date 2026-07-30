'use client';

import { useMemo, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Bot,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  RotateCcw,
} from 'lucide-react';
import type { AgentStat, DailyPoint, EmployeeStat, OutcomeSlice } from '@/lib/analytics';
import { cn } from '@/lib/utils';

// Recharts renders into SVG, where Tailwind's dark: variants cannot reach the
// axis and grid primitives. Every colour is therefore passed explicitly, chosen
// to hold up on both the light (#fff) and dark (#0a1128) card backgrounds:
// slate-400 at low alpha reads as a hairline on either.
const AXIS = '#94a3b8';
const GRID = 'rgba(148, 163, 184, 0.22)';
const CURSOR = 'rgba(148, 163, 184, 0.14)';

const SERIES = {
  calls: { colour: '#5285d0', label: 'Calls' },
  connected: { colour: '#56b4e9', label: 'Connected' },
  interested: { colour: '#009e73', label: 'Interested' },
} as const;

type SeriesKey = keyof typeof SERIES;
const SERIES_KEYS = Object.keys(SERIES) as SeriesKey[];

/** The lead outcome each slice/segment/bar represents. */
export type OutcomeStatus = OutcomeSlice['status'];

/**
 * Shared by the donut, the per-agent stack and the table mixes, so the three
 * always agree.
 *
 * Drawn from the Okabe–Ito qualitative palette: the outcomes that matter most
 * (interested / not interested) would otherwise be the classic green-vs-red
 * pair, which a deuteranope cannot separate. These six stay distinguishable
 * under all three common forms of colour blindness, and each carries enough
 * lightness contrast to survive a greyscale print too.
 */
export const OUTCOME_COLOUR: Record<string, string> = {
  interested: '#009e73',
  callback_requested: '#e69f00',
  not_interested: '#d55e00',
  no_answer: '#94a3b8',
  voicemail: '#cc79a7',
  unknown: '#0072b2',
};

/**
 * Fixed reading order for stacks and legends. Typed against the payload's own
 * status union, so a renamed or added LeadStatus fails the build here rather
 * than silently dropping out of the chart.
 */
export const OUTCOME_ORDER: readonly OutcomeStatus[] = [
  'interested',
  'callback_requested',
  'not_interested',
  'no_answer',
  'voicemail',
  'unknown',
];

export function outcomeLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  if (hours) return `${hours}h ${mins}m`;
  if (mins) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatDay(date: string): string {
  // 'YYYY-MM-DD' parses as UTC midnight; anchor it locally so the label cannot
  // slip a day for anyone east or west of Greenwich.
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Percentage that never rounds a real value away to nothing. */
function share(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  const pct = (part / whole) * 100;
  if (pct > 0 && pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}

/**
 * Chart animation is decorative — it carries no information the static frame
 * does not — so a reduced-motion preference switches it off entirely rather
 * than merely shortening it.
 */
function useChartAnimation(): boolean {
  const reduced = useReducedMotion() ?? false;
  return !reduced;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function ChartEmpty({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof BarChart3;
  title: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-12 text-center">
      <Icon className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      <p className="text-xs text-slate-500 mt-1">{hint}</p>
    </div>
  );
}

const TOOLTIP_SHELL =
  'rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0a1128] px-3 py-2 shadow-lg shadow-slate-900/5';

interface TooltipPayloadItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  /** Pie slices carry their colour on the datum rather than on the item. */
  payload?: { fill?: string };
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  labelFormat?: (raw: string) => string;
  nameFormat?: (raw: string) => string;
  valueFormat?: (value: number) => string;
}

/** Rendered with Tailwind rather than recharts' inline styles so it themes. */
function ChartTooltip({
  active,
  payload,
  label,
  labelFormat,
  nameFormat,
  valueFormat,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className={TOOLTIP_SHELL}>
      {label !== undefined && (
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          {labelFormat ? labelFormat(String(label)) : String(label)}
        </p>
      )}
      <ul className="space-y-1">
        {payload.map((item, i) => {
          const numeric = typeof item.value === 'number' ? item.value : Number(item.value ?? 0);
          const name = String(item.name ?? '');
          return (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: item.color ?? item.payload?.fill ?? AXIS }}
              />
              <span className="text-slate-500 dark:text-slate-400 capitalize">
                {nameFormat ? nameFormat(name) : name}
              </span>
              <span className="ml-auto font-semibold tabular-nums text-slate-900 dark:text-white">
                {valueFormat ? valueFormat(numeric) : numeric.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Legend entry shared by the trend, the donut and the agent stack. */
function LegendSwatch({
  colour,
  label,
  value,
  suffix,
  muted,
  pressed,
  onClick,
  onHoverChange,
  title,
}: {
  colour: string;
  label: string;
  value?: string;
  suffix?: string;
  muted?: boolean;
  pressed?: boolean;
  onClick?: () => void;
  onHoverChange?: (hovering: boolean) => void;
  title?: string;
}) {
  const body = (
    <>
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
        style={{ backgroundColor: colour, opacity: muted ? 0.3 : 1 }}
      />
      <span className={cn('capitalize', muted ? 'text-slate-400 dark:text-slate-600' : 'text-slate-600 dark:text-slate-300')}>
        {label}
      </span>
      {value !== undefined && (
        <span
          className={cn(
            'tabular-nums font-medium',
            muted ? 'text-slate-400 dark:text-slate-600' : 'text-slate-900 dark:text-white'
          )}
        >
          {value}
        </span>
      )}
      {suffix && <span className="tabular-nums text-slate-400 dark:text-slate-500">{suffix}</span>}
    </>
  );

  const shell = 'inline-flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs transition-colors';

  if (!onClick) {
    return <span className={shell}>{body}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocus={() => onHoverChange?.(true)}
      onBlur={() => onHoverChange?.(false)}
      aria-pressed={pressed}
      title={title}
      className={cn(
        shell,
        'hover:bg-slate-100 dark:hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        pressed && 'bg-brand-500/10'
      )}
    >
      {body}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Daily trend
// ---------------------------------------------------------------------------

interface DailyTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: DailyPoint }>;
  visible?: Record<SeriesKey, boolean>;
}

/**
 * Reads the whole day off the datum rather than off the rendered series, so
 * hiding a line never removes it from the readout — the crosshair always
 * answers "how did this day go?" in full.
 */
function DailyTooltip({ active, payload, visible }: DailyTooltipProps) {
  const point = payload && payload.length > 0 ? payload[0].payload : undefined;
  if (!active || !point) return null;

  return (
    <div className={TOOLTIP_SHELL}>
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
        {formatDay(point.date)}
      </p>
      <ul className="space-y-1">
        {SERIES_KEYS.map((key) => {
          const hidden = visible ? !visible[key] : false;
          return (
            <li key={key} className={cn('flex items-center gap-2 text-xs', hidden && 'opacity-40')}>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: SERIES[key].colour }}
              />
              <span className="text-slate-500 dark:text-slate-400">{SERIES[key].label}</span>
              <span className="ml-auto font-semibold tabular-nums text-slate-900 dark:text-white">
                {point[key].toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DailyTrendChart({ data }: { data: DailyPoint[] }) {
  const animate = useChartAnimation();
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    calls: true,
    connected: true,
    interested: true,
  });
  // The window carries the series it was drawn on. Switching the date range
  // swaps the whole series, and a window held over from the old one would point
  // at days that no longer exist — discarding it here rather than in an effect
  // means there is never a render showing the wrong slice. Keyed on the shape of
  // the series rather than its identity, so a caller that rebuilds the array on
  // every render does not lose the user's window each time.
  const seriesKey = data.length > 0 ? `${data.length}:${data[0].date}` : '0';
  const [brush, setBrush] = useState<{ key: string; start: number; end: number } | null>(null);
  // Recharts only re-reads the brush indices when the chart's *data* changes, so
  // a reset has to remount the chart to be seen.
  const [resetCount, setResetCount] = useState(0);

  const activeWindow = brush && brush.key === seriesKey ? brush : null;
  const maxIndex = Math.max(0, data.length - 1);
  const startIndex = activeWindow ? Math.min(Math.max(0, activeWindow.start), maxIndex) : 0;
  const endIndex = activeWindow ? Math.min(Math.max(startIndex, activeWindow.end), maxIndex) : maxIndex;
  const zoomed = startIndex > 0 || endIndex < maxIndex;

  const windowed = useMemo(
    () => data.slice(startIndex, endIndex + 1),
    [data, startIndex, endIndex]
  );

  const windowTotals = useMemo(() => {
    const acc: Record<SeriesKey, number> = { calls: 0, connected: 0, interested: 0 };
    for (const point of windowed) {
      acc.calls += point.calls;
      acc.connected += point.connected;
      acc.interested += point.interested;
    }
    return acc;
  }, [windowed]);

  function toggle(key: SeriesKey) {
    setVisible((current) => {
      const next = { ...current, [key]: !current[key] };
      // Never let the last series be switched off — an empty axis box is not a
      // state the user can interpret or easily get out of.
      if (!SERIES_KEYS.some((k) => next[k])) return current;
      return next;
    });
  }

  if (!data.some((d) => d.calls > 0)) {
    return (
      <ChartEmpty
        icon={LineChartIcon}
        title="No calls in this period"
        hint="Run a campaign or dial a lead and the trend fills in from the next day."
      />
    );
  }

  // Thin the labels so a long window does not collide.
  const tickInterval = Math.max(0, Math.ceil(windowed.length / 8) - 1);
  const rangeLabel =
    windowed.length > 0
      ? `${formatDay(windowed[0].date)} – ${formatDay(windowed[windowed.length - 1].date)}`
      : '';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
        <div className="flex flex-wrap items-center gap-0.5 -ml-2">
          {SERIES_KEYS.map((key) => (
            <LegendSwatch
              key={key}
              colour={SERIES[key].colour}
              label={SERIES[key].label}
              value={windowTotals[key].toLocaleString()}
              muted={!visible[key]}
              pressed={visible[key]}
              onClick={() => toggle(key)}
              title={visible[key] ? `Hide ${SERIES[key].label}` : `Show ${SERIES[key].label}`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="tabular-nums">{rangeLabel}</span>
          {zoomed && (
            <button
              type="button"
              onClick={() => {
                setBrush(null);
                setResetCount((n) => n + 1);
              }}
              className="inline-flex items-center gap-1.5 h-7 px-2 rounded-lg border border-slate-200 dark:border-white/10 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Full range
            </button>
          )}
        </div>
      </div>

      <div
        className="h-72 sm:h-80"
        role="img"
        aria-label={`Daily calls, connections and interested leads. ${rangeLabel}: ${windowTotals.calls} calls, ${windowTotals.connected} connected, ${windowTotals.interested} interested.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            key={`${seriesKey}:${resetCount}`}
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
          >
            <defs>
              {SERIES_KEYS.map((key) => (
                <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES[key].colour} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={SERIES[key].colour} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              interval={tickInterval}
              minTickGap={16}
              tick={{ fill: AXIS, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              allowDecimals={false}
              width={44}
              tick={{ fill: AXIS, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ stroke: AXIS, strokeOpacity: 0.5, strokeWidth: 1, strokeDasharray: '3 3' }}
              content={<DailyTooltip visible={visible} />}
            />

            {SERIES_KEYS.filter((key) => visible[key]).map((key) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={SERIES[key].label}
                stroke={SERIES[key].colour}
                strokeWidth={2}
                fill={`url(#fill-${key})`}
                activeDot={{ r: 3.5, strokeWidth: 0 }}
                isAnimationActive={animate}
                animationDuration={420}
              />
            ))}

            <Brush
              dataKey="date"
              height={22}
              travellerWidth={8}
              gap={1}
              stroke={AXIS}
              fill="rgba(148, 163, 184, 0.08)"
              tickFormatter={(value: string) => formatDay(value)}
              startIndex={startIndex}
              endIndex={endIndex}
              onChange={(next: { startIndex?: number; endIndex?: number }) => {
                if (typeof next.startIndex !== 'number' || typeof next.endIndex !== 'number') return;
                setBrush({ key: seriesKey, start: next.startIndex, end: next.endIndex });
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        Drag the handles under the chart to narrow the window; click a legend entry to hide a series.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employee comparison
// ---------------------------------------------------------------------------

const METRICS = [
  { key: 'calls', label: 'Calls' },
  { key: 'connectRate', label: 'Connect rate' },
  { key: 'interestRate', label: 'Interest rate' },
  { key: 'totalTalkTimeSec', label: 'Talk time' },
  { key: 'callbacksBooked', label: 'Callbacks' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

function formatMetric(key: MetricKey, value: number): string {
  if (key === 'connectRate' || key === 'interestRate') return `${value}%`;
  if (key === 'totalTalkTimeSec') return formatDuration(value);
  return value.toLocaleString();
}

export function EmployeeComparisonChart({
  employees,
  selectedId = null,
  onSelect,
}: {
  employees: EmployeeStat[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const animate = useChartAnimation();
  const [metric, setMetric] = useState<MetricKey>('calls');

  // `employeeId` rather than `id`: recharts copies whitelisted datum keys onto
  // the rendered <path>, and `id` is on that whitelist.
  const rows = useMemo(
    () =>
      employees
        .map((e) => ({ employeeId: e.id, name: e.name, value: e[metric] }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [employees, metric]
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            aria-pressed={metric === m.key}
            className={cn(
              'h-7 px-2.5 rounded-lg text-xs font-medium transition-colors',
              metric === m.key
                ? 'bg-brand-500/10 text-brand-700 dark:text-brand-400'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <ChartEmpty
          icon={BarChart3}
          title="Nothing to compare yet"
          hint="No employee has recorded this metric in the selected period."
        />
      ) : (
        <>
          <div
            style={{ height: Math.max(180, rows.length * 38 + 24) }}
            role="img"
            aria-label={`Employees compared by ${METRICS.find((m) => m.key === metric)?.label ?? metric}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  tickFormatter={(v: number) => formatMetric(metric, v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={116}
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                />
                <Tooltip
                  cursor={{ fill: CURSOR }}
                  content={<ChartTooltip valueFormat={(v) => formatMetric(metric, v)} />}
                />
                <Bar
                  dataKey="value"
                  name={METRICS.find((m) => m.key === metric)?.label ?? 'Value'}
                  radius={[0, 6, 6, 0]}
                  barSize={18}
                  isAnimationActive={animate}
                  animationDuration={420}
                >
                  {rows.map((row) => (
                    <Cell
                      key={row.employeeId}
                      fill={SERIES.calls.colour}
                      // A selection dims the field rather than hiding it, so the
                      // person stays legible against the peers they were picked from.
                      fillOpacity={selectedId && selectedId !== row.employeeId ? 0.3 : 1}
                      cursor={onSelect ? 'pointer' : undefined}
                      onClick={onSelect ? () => onSelect(row.employeeId) : undefined}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {onSelect && (
            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              Click a bar to filter the dashboard to that person.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outcome mix — donut
// ---------------------------------------------------------------------------

interface ActiveSliceProps {
  cx?: number;
  cy?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  fill?: string;
}

/** The hovered slice grows outwards and gains a detached rim. */
function renderActiveSlice(props: ActiveSliceProps) {
  const {
    cx = 0,
    cy = 0,
    innerRadius = 0,
    outerRadius = 0,
    startAngle = 0,
    endAngle = 0,
    fill,
  } = props;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 9}
        outerRadius={outerRadius + 11}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        fillOpacity={0.5}
      />
    </g>
  );
}

export function OutcomeDonut({
  outcomes,
  selected = null,
  onSelect,
}: {
  outcomes: OutcomeSlice[];
  selected?: OutcomeStatus | null;
  onSelect?: (status: OutcomeStatus) => void;
}) {
  const animate = useChartAnimation();
  const [hovered, setHovered] = useState<number | null>(null);

  const slices = useMemo(() => outcomes.filter((o) => o.count > 0), [outcomes]);
  const total = useMemo(() => slices.reduce((sum, o) => sum + o.count, 0), [slices]);

  if (total === 0) {
    return (
      <ChartEmpty
        icon={PieChartIcon}
        title="No outcomes recorded"
        hint="Every completed call is classified automatically once it ends."
      />
    );
  }

  const selectedIndex = selected ? slices.findIndex((s) => s.status === selected) : -1;
  // Hover wins over the pinned selection, so the donut always answers the
  // question the pointer is asking.
  const activeIndex = hovered ?? (selectedIndex >= 0 ? selectedIndex : undefined);
  const centre = activeIndex !== undefined ? slices[activeIndex] : undefined;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="h-60 w-full sm:w-60 shrink-0 relative" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <Pie
              data={slices}
              dataKey="count"
              nameKey="status"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={2}
              stroke="none"
              activeIndex={activeIndex}
              activeShape={renderActiveSlice}
              isAnimationActive={animate}
              animationDuration={420}
              onMouseEnter={(_: unknown, index: number) => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onClick={(_: unknown, index: number) => {
                const slice = slices[index];
                if (slice && onSelect) onSelect(slice.status);
              }}
            >
              {slices.map((slice) => (
                <Cell
                  key={slice.status}
                  fill={OUTCOME_COLOUR[slice.status] ?? OUTCOME_COLOUR.unknown}
                  fillOpacity={selected && selected !== slice.status ? 0.32 : 1}
                  cursor={onSelect ? 'pointer' : undefined}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Centre label — the donut hole would otherwise waste the strongest spot. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-10 text-center">
          <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white leading-none">
            {(centre ? centre.count : total).toLocaleString()}
          </span>
          <span className="mt-1 text-[11px] capitalize text-slate-500 dark:text-slate-400 leading-tight">
            {centre ? outcomeLabel(centre.status) : 'calls'}
          </span>
          {centre && (
            <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
              {share(centre.count, total)} of {total.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <div className="w-full">
        {/* The donut itself is aria-hidden, so the legend carries the figures. */}
        <p className="sr-only">{total.toLocaleString()} classified calls in total.</p>
        <ul className="space-y-0.5">
          {slices.map((slice, index) => {
            const isSelected = selected === slice.status;
            const dimmed = Boolean(selected) && !isSelected;
            const colour = OUTCOME_COLOUR[slice.status] ?? OUTCOME_COLOUR.unknown;

            const body = (
              <>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: colour, opacity: dimmed ? 0.4 : 1 }}
                />
                <span className="capitalize text-slate-600 dark:text-slate-300 truncate">
                  {outcomeLabel(slice.status)}
                </span>
                <span className="ml-auto tabular-nums font-medium text-slate-900 dark:text-white">
                  {slice.count.toLocaleString()}
                </span>
                <span className="w-12 text-right tabular-nums text-xs text-slate-500 dark:text-slate-400">
                  {share(slice.count, total)}
                </span>
              </>
            );

            const shell = cn(
              'w-full flex items-center gap-2.5 text-sm text-left px-2 py-1.5 rounded-lg transition-colors',
              dimmed && 'opacity-60'
            );

            return (
              <li key={slice.status}>
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(slice.status)}
                    onMouseEnter={() => setHovered(index)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(index)}
                    onBlur={() => setHovered(null)}
                    aria-pressed={isSelected}
                    title={
                      isSelected
                        ? 'Clear this outcome filter'
                        : `Focus the dashboard on ${outcomeLabel(slice.status)}`
                    }
                    className={cn(
                      shell,
                      'hover:bg-slate-50 dark:hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                      isSelected && 'bg-brand-500/10'
                    )}
                  >
                    {body}
                  </button>
                ) : (
                  <span className={shell}>{body}</span>
                )}
              </li>
            );
          })}
        </ul>

        {onSelect && (
          <p className="mt-2 px-2 text-[11px] text-slate-400 dark:text-slate-500">
            Click a slice to focus the dashboard on that outcome.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outcome mix — per agent
// ---------------------------------------------------------------------------

/**
 * One agent's outcome counts, flattened so each status can be its own stacked
 * `dataKey`. Keyed `agentId` rather than `id` because recharts copies certain
 * datum keys straight onto the rendered <path>, and six stacked segments
 * sharing one `id` would put duplicate ids in the document.
 */
interface AgentRow {
  agentId: string;
  name: string;
  total: number;
  [status: string]: string | number;
}

interface StackTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: AgentRow }>;
}

function AgentStackTooltip({ active, payload }: StackTooltipProps) {
  const row = payload && payload.length > 0 ? payload[0].payload : undefined;
  if (!active || !row) return null;

  const entries = OUTCOME_ORDER.map((status) => ({
    status,
    count: typeof row[status] === 'number' ? (row[status] as number) : 0,
  })).filter((e) => e.count > 0);

  return (
    <div className={TOOLTIP_SHELL}>
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">{row.name}</p>
      <ul className="space-y-1">
        {entries.map((entry) => (
          <li key={entry.status} className="flex items-center gap-2 text-xs">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: OUTCOME_COLOUR[entry.status] ?? OUTCOME_COLOUR.unknown }}
            />
            <span className="text-slate-500 dark:text-slate-400 capitalize">
              {outcomeLabel(entry.status)}
            </span>
            <span className="ml-auto font-semibold tabular-nums text-slate-900 dark:text-white">
              {entry.count.toLocaleString()}
            </span>
            <span className="w-11 text-right tabular-nums text-slate-400 dark:text-slate-500">
              {share(entry.count, row.total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AgentOutcomeChart({
  agents,
  selectedId = null,
  onSelect,
  focusOutcome = null,
  onFocusOutcome,
}: {
  agents: AgentStat[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  focusOutcome?: OutcomeStatus | null;
  onFocusOutcome?: (status: OutcomeStatus) => void;
}) {
  const animate = useChartAnimation();

  const rows = useMemo<AgentRow[]>(() => {
    return agents
      .map((agent) => {
        const row: AgentRow = { agentId: agent.id, name: agent.name, total: 0 };
        for (const status of OUTCOME_ORDER) {
          const count = agent.outcomes[status] ?? 0;
          row[status] = count;
          row.total += count;
        }
        return row;
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [agents]);

  const statuses = useMemo(
    () => OUTCOME_ORDER.filter((status) => rows.some((row) => (row[status] as number) > 0)),
    [rows]
  );

  const legendTotals = useMemo(() => {
    const totals = new Map<OutcomeStatus, number>();
    for (const status of statuses) {
      totals.set(
        status,
        rows.reduce((sum, row) => sum + (row[status] as number), 0)
      );
    }
    return totals;
  }, [rows, statuses]);

  if (rows.length === 0) {
    return (
      <ChartEmpty
        icon={Bot}
        title="No agent outcomes yet"
        hint="Once an agent completes a call its outcome mix is stacked here."
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-0.5 -ml-2 mb-3">
        {statuses.map((status) => (
          <LegendSwatch
            key={status}
            colour={OUTCOME_COLOUR[status] ?? OUTCOME_COLOUR.unknown}
            label={outcomeLabel(status)}
            value={(legendTotals.get(status) ?? 0).toLocaleString()}
            muted={Boolean(focusOutcome) && focusOutcome !== status}
            pressed={focusOutcome === status}
            onClick={onFocusOutcome ? () => onFocusOutcome(status) : undefined}
            title={
              focusOutcome === status
                ? 'Clear this outcome filter'
                : `Focus the dashboard on ${outcomeLabel(status)}`
            }
          />
        ))}
      </div>

      <div
        style={{ height: Math.max(180, rows.length * 40 + 24) }}
        role="img"
        aria-label="Outcome mix per agent"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fill: AXIS, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={116}
              tick={{ fill: AXIS, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
            />
            <Tooltip cursor={{ fill: CURSOR }} content={<AgentStackTooltip />} />

            {statuses.map((status) => (
              <Bar
                key={status}
                dataKey={status}
                name={outcomeLabel(status)}
                stackId="mix"
                fill={OUTCOME_COLOUR[status] ?? OUTCOME_COLOUR.unknown}
                barSize={18}
                isAnimationActive={animate}
                animationDuration={420}
              >
                {rows.map((row) => {
                  const dimmed =
                    (Boolean(selectedId) && selectedId !== row.agentId) ||
                    (Boolean(focusOutcome) && focusOutcome !== status);
                  return (
                    <Cell
                      key={row.agentId}
                      fillOpacity={dimmed ? 0.25 : 1}
                      cursor={onSelect ? 'pointer' : undefined}
                      onClick={onSelect ? () => onSelect(row.agentId) : undefined}
                    />
                  );
                })}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {onSelect && (
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          Click a segment to filter the dashboard to that agent.
        </p>
      )}
    </div>
  );
}

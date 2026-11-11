import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { RISK_COLOR, SPECIES_COLOR } from '../utils/format'

const AXIS = {
  tick: { fill: '#8d938a', fontSize: 10, fontWeight: 500 },
  tickLine: false,
  axisLine: false,
}

function ChartTip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-[#e4dfd1] bg-parchment px-3 py-2 shadow-card">
      {label !== undefined && <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8d938a]">{label}</div>}
      {payload.map((item) => (
        <div key={`${item.dataKey}-${item.name}`} className="flex items-center gap-2 text-[11.5px]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
          <span className="text-[#5f695f]">{item.name}</span>
          <span className="ml-auto font-mono font-semibold text-ink">
            {formatter ? formatter(item.value, item) : item.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ActivityArea({ data, height = 220, color = '#2F7250', showAxis = true }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#ece7da" vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          {...AXIS}
          hide={!showAxis}
          tickFormatter={(value) =>
            new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
          }
          interval="preserveStartEnd"
          minTickGap={28}
        />
        <YAxis {...AXIS} width={38} allowDecimals={false} />
        <Tooltip content={<ChartTip />} cursor={{ stroke: '#cdd8c8', strokeDasharray: '3 3' }} />
        <Area
          type="monotone"
          dataKey="detections"
          name="Detections"
          stroke={color}
          strokeWidth={2}
          fill="url(#activityFill)"
          activeDot={{ r: 4, strokeWidth: 0, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function SpeciesBars({ data, height = 230, landscape = false }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, left: 4, bottom: 0 }} barSize={14}>
        <CartesianGrid stroke="#ece7da" horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" {...AXIS} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          {...AXIS}
          width={92}
          tick={{ fill: landscape ? '#d7e6d3' : '#657062', fontSize: 10 }}
        />
        <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(127,163,107,0.08)' }} />
        <Bar dataKey="count" name="Detections" radius={[0, 4, 4, 0]}>
          {data?.map((entry) => (
            <Cell key={entry.key} fill={SPECIES_COLOR[entry.key] || '#2F7250'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RiskDonut({ data, height = 220 }) {
  const total = (data?.low || 0) + (data?.moderate || 0) + (data?.high || 0)
  const rows = [
    { key: 'high', label: 'High risk', value: data?.high || 0, color: RISK_COLOR.high },
    { key: 'moderate', label: 'Moderate', value: data?.moderate || 0, color: RISK_COLOR.moderate },
    { key: 'low', label: 'Low risk', value: data?.low || 0, color: RISK_COLOR.low },
  ]
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {rows.map((row) => (
              <Cell key={row.key} fill={row.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-[26px] leading-none text-ink">{total}</div>
        <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-[#8d938a]">scores</div>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {rows.map((row) => (
          <div key={row.key} className="rounded-lg border border-[#eae4d7] bg-white/60 px-2 py-1.5">
            <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.08em] text-[#7d867c]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: row.color }} />
              {row.label}
            </div>
            <div className="mt-0.5 font-mono text-[13px] font-semibold text-ink">{row.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HourBars({ data, height = 200, color = '#7FA36B' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 4, left: -26, bottom: 0 }} barSize={8}>
        <CartesianGrid stroke="#ece7da" vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="hour"
          {...AXIS}
          tickFormatter={(value) => (value % 4 === 0 ? `${String(value).padStart(2, '0')}h` : '')}
          interval={0}
        />
        <YAxis {...AXIS} width={38} allowDecimals={false} />
        <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(127,163,107,0.08)' }} />
        <Bar dataKey="detections" name="Detections" fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function BasisBars({ data, height = 210 }) {
  const rows = [
    { name: 'Proximity only', value: data?.proximity || 0, color: '#2F7250' },
    { name: 'Buffer proximity', value: data?.buffer_proximity || 0, color: '#7FA36B' },
    { name: 'Core activity', value: data?.core_activity || 0, color: '#B8C4B5' },
    { name: 'Movement-supported', value: data?.confirmed_movement || 0, color: '#C2410C' },
  ]
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 10, bottom: 0 }} barSize={16}>
        <CartesianGrid stroke="#ece7da" horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" {...AXIS} allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...AXIS} width={126} />
        <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(127,163,107,0.08)' }} />
        <Bar dataKey="value" name="Detections" radius={[0, 4, 4, 0]}>
          {rows.map((row) => (
            <Cell key={row.name} fill={row.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function TrendLine({ data, height = 190, dataKey = 'detections', color = '#2F7250', name = 'Detections' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid stroke="#ece7da" vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          {...AXIS}
          tickFormatter={(value) =>
            new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
          }
          minTickGap={36}
        />
        <YAxis {...AXIS} width={38} allowDecimals={false} />
        <Tooltip content={<ChartTip />} />
        <Line type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function CategoryBars({ items, height = 200, color = '#B85C38' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={items.map((item) => ({ name: String(item.category || item.name).replaceAll('_', ' '), count: item.count }))}
        margin={{ top: 4, right: 8, left: -26, bottom: 4 }}
        barSize={14}
      >
        <CartesianGrid stroke="#ece7da" vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="name" {...AXIS} tick={{ fill: '#8d938a', fontSize: 9 }} interval={0} />
        <YAxis {...AXIS} width={38} allowDecimals={false} />
        <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(184,92,56,0.06)' }} />
        <Bar dataKey="count" name="Incidents" fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function MiniLegend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-[10px] text-[#7d867c]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  )
}

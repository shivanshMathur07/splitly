"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/money";

type Cat = { name: string; icon: string; color: string; total: number; mine: number };
type PersonRow = { id: number; name: string; paid: number; share: number };
type Month = { month: string; total: number; mine: number };

const short = (cents: number) => {
  const v = cents / 100;
  if (Math.abs(v) >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
  if (Math.abs(v) >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toFixed(0);
};

const firstName = (n: string) => {
  const f = String(n).split(" ")[0] ?? "";
  return f.length > 9 ? `${f.slice(0, 8)}…` : f;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-03" → "Mar 26" */
const shortMonth = (m: string) => {
  const [y, mm] = String(m).split("-");
  const i = Number(mm) - 1;
  return MONTHS[i] ? `${MONTHS[i]} ${y?.slice(2)}` : String(m);
};
const legendStyle = { fontSize: 12 };

export function CategoryChart({ data, currency }: { data: Cat[]; currency: string }) {
  const total = data.reduce((a, d) => a + d.total, 0);
  return (
    <div className="grid items-center gap-4 md:grid-cols-2" data-testid="chart-category">
      <div className="mx-auto h-52 w-full max-w-[16rem] md:h-64 md:max-w-none">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="total" nameKey="name" innerRadius="55%" outerRadius="90%" paddingAngle={2} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate">{d.icon} {d.name}</span>
            <span className="tabular-nums text-slate-500">{total ? Math.round((d.total / total) * 100) : 0}%</span>
            <span className="w-24 shrink-0 text-right font-semibold tabular-nums md:w-28">{formatMoney(d.total, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PersonChart({ data, currency }: { data: PersonRow[]; currency: string }) {
  return (
    <div className="h-64 md:h-72" data-testid="chart-person">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: -4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} tickFormatter={firstName} />
          <YAxis tickFormatter={short} tick={{ fontSize: 11 }} width={48} />
          <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
          <Legend wrapperStyle={legendStyle} iconSize={10} />
          <Bar dataKey="paid" name="Paid" fill="#0d9488" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="share" name="Their share" fill="#f97316" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyChart({ data, currency }: { data: Month[]; currency: string }) {
  return (
    <div className="h-56 md:h-64" data-testid="chart-monthly">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: -4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={shortMonth} minTickGap={4} />
          <YAxis tickFormatter={short} tick={{ fontSize: 11 }} width={48} />
          <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
          <Legend wrapperStyle={legendStyle} iconSize={10} />
          <Bar dataKey="total" name="Total spent" fill="#6366f1" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="mine" name="Your share" fill="#14b8a6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

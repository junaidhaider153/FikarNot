import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useApp } from "../../store/appStore";
import { fmt } from "../../utils/helpers";
import { Ic } from "../icons";

export function DashboardTab() {
  const s = useApp();
  const paidOrders = s.orders.filter((o) => (o.payment_status === "paid" || o.paymentStatus === "paid") && o.status !== "cancelled");
  const revenue = paidOrders.reduce((t, o) => t + Number(o.total || 0), 0);
  const revByCat = s.categories.map((c) => ({
    name: c.name,
    revenue: +paidOrders
      .flatMap((o) => o.items || [])
      .filter((i) => (s.products.find((p) => p.id === i.productId)?.categoryId || "") === c.id)
      .reduce((t, i) => t + Number(i.price || 0) * Number(i.qty || 0), 0)
      .toFixed(2),
  }));
  const byCat = s.categories
    .map((c) => ({ name: c.name, value: s.products.filter((p) => p.categoryId === c.id).length, color: c.color }))
    .filter((d) => d.value > 0);
  return (
    <>
      <div className="stat-grid">
        <div className="stat">
          <span className="ic">
            <Ic n="box" s={17} />
          </span>
          <b>{s.products.length}</b>
          <span>Products live</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="tag" s={17} />
          </span>
          <b>{s.categories.length}</b>
          <span>Categories</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="cart" s={17} />
          </span>
          <b>{s.orders.length}</b>
          <span>Orders</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="chart" s={17} />
          </span>
          <b>{fmt(revenue)}</b>
          <span>Revenue (paid)</span>
        </div>
      </div>
      <div className="chart-row">
        <div className="chart-card">
          <h4>Revenue by category</h4>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={revByCat}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E1D4" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={52} />
              <RTooltip formatter={(v) => fmt(+v)} />
              <Bar dataKey="revenue" fill="#17150F" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h4>Catalogue mix</h4>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byCat} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={3}>
                {byCat.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Legend formatter={(v) => <span style={{ fontSize: 12 }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {s.orders.slice(0, 5).map((o) => (
              <tr key={o.id}>
                <td>
                  <b>{o.id}</b>
                </td>
                <td>{o.customer.name}</td>
                <td>{o.items.reduce((n, i) => n + i.qty, 0)}</td>
                <td>{fmt(o.total)}</td>
                <td>
                  <span className="role-badge editor">{o.status}</span>
                </td>
                <td>
                  <span className="field-hint">{o.paymentStatus || "pending"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
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
import { getAnalyticsData, analyticsCsv } from "../../utils/analytics";
import { Ic } from "../icons";

const STATUS_LABELS = {
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function AnalyticsTab() {
  const s = useApp();
  const [range, setRange] = useState("30");
  const [now] = useState(() => Date.now());
  const data = useMemo(() => getAnalyticsData(s, range, now), [s, range, now]);

  const statusData = Object.entries(data.statusCounts).map(([name, value]) => ({ name: STATUS_LABELS[name] || name, value }));
  const statusColors = ["#17150F", "#5B6DFA", "#2C8C99", "#3E8E5A", "#E4572E", "#8A8577"];

  const exportReport = () => {
    const blob = new Blob([analyticsCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fikarnot-analytics-${range === "all" ? "all-time" : `${range}-days`}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="analytics-page">
      <div className="analytics-toolbar">
        <div>
          <p className="eyebrow">Store intelligence</p>
          <h2 className="display analytics-title">Know what is working</h2>
          <p className="analytics-sub">A quick view of sales, customers, products, and operational signals.</p>
        </div>
        <div className="analytics-actions">
          <label className="analytics-select-label" htmlFor="analytics-range">
            Range
          </label>
          <select id="analytics-range" className="select analytics-range" value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <button className="btn btn-ghost" onClick={exportReport}>
            <Ic n="box" s={15} /> Export CSV
          </button>
        </div>
      </div>

      <div className="stat-grid analytics-stats">
        <div className="stat">
          <span className="ic">
            <Ic n="chart" s={17} />
          </span>
          <b>{fmt(data.revenue)}</b>
          <span>Revenue</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="cart" s={17} />
          </span>
          <b>{data.validOrders.length}</b>
          <span>Completed orders</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="users" s={17} />
          </span>
          <b>{data.customerCount}</b>
          <span>Customers</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="tag" s={17} />
          </span>
          <b>{fmt(data.averageOrderValue)}</b>
          <span>Average order value</span>
        </div>
      </div>

      <div className="analytics-signal-row">
        <div className="analytics-signal">
          <strong>{data.unitsSold}</strong>
          <span>Units sold</span>
        </div>
        <div className="analytics-signal">
          <strong>{data.repeatCustomerCount}</strong>
          <span>Repeat customers</span>
        </div>
        <div className="analytics-signal">
          <strong>{data.lowStockCount}</strong>
          <span>Low-stock products</span>
        </div>
        <div className="analytics-signal danger">
          <strong>{data.outOfStockCount}</strong>
          <span>Out of stock</span>
        </div>
      </div>

      <div className="chart-row">
        <div className="chart-card analytics-chart-card">
          <div className="analytics-card-head">
            <h3 className="display">Sales trend</h3>
            <span>
              {data.trend.length} active day{data.trend.length === 1 ? "" : "s"}
            </span>
          </div>
          {data.trend.length ? (
            <ResponsiveContainer width="100%" height={270}>
              <AreaChart data={data.trend}>
                <defs>
                  <linearGradient id="fikarnotRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#17150F" stopOpacity={0.16} />
                    <stop offset="95%" stopColor="#17150F" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E1D4" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(value) => value.slice(5)} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={52} />
                <RTooltip formatter={(value) => fmt(+value)} />
                <Area type="monotone" dataKey="revenue" stroke="#17150F" fill="url(#fikarnotRevenue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="analytics-empty">No sales in this period yet.</div>
          )}
        </div>
        <div className="chart-card analytics-chart-card">
          <div className="analytics-card-head">
            <h3 className="display">Order status</h3>
            <span>{data.orders.length} total</span>
          </div>
          {statusData.length ? (
            <ResponsiveContainer width="100%" height={270}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} paddingAngle={3}>
                  {statusData.map((item, index) => (
                    <Cell key={item.name} fill={statusColors[index % statusColors.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="analytics-empty">No orders in this period.</div>
          )}
        </div>
      </div>

      <div className="analytics-grid-two">
        <section className="table-wrap analytics-table-card">
          <div className="analytics-card-head">
            <h3 className="display">Top products</h3>
            <span>By revenue</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th>Units</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.topProducts.length ? (
                data.topProducts.map((item) => (
                  <tr key={item.productId}>
                    <td>
                      <b>{item.name}</b>
                    </td>
                    <td>{item.units}</td>
                    <td>{fmt(item.revenue)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3">No product sales in this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <section className="table-wrap analytics-table-card">
          <div className="analytics-card-head">
            <h3 className="display">Top customers</h3>
            <span>By spend</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Orders</th>
                <th>Spend</th>
              </tr>
            </thead>
            <tbody>
              {data.topCustomers.length ? (
                data.topCustomers.map((item) => (
                  <tr key={item.email || item.name}>
                    <td>
                      <div>
                        <b>{item.name}</b>
                      </div>
                      <small>{item.email || ""}</small>
                    </td>
                    <td>{item.orders}</td>
                    <td>{fmt(item.spend)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3">No customer activity in this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <section className="table-wrap analytics-table-card">
        <div className="analytics-card-head">
          <h3 className="display">Coupon performance</h3>
          <span>Orders using promotions</span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Code</th>
              <th>Uses</th>
              <th>Savings</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.couponPerformance.length ? (
              data.couponPerformance.map((item) => (
                <tr key={item.code}>
                  <td>
                    <b>{item.code}</b>
                  </td>
                  <td>{item.uses}</td>
                  <td>{fmt(item.savings)}</td>
                  <td>{fmt(item.revenue)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4">No coupons used in this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

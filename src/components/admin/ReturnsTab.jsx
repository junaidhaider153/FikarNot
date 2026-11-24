import { useState } from "react";
import { useApp, appActions } from "../../store/appStore";
import { fmt } from "../../utils/helpers";
import { Empty } from "../common";
import { RETURN_STATUSES } from "../../utils/returns";

const toMs = (value) => {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return num;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function ReturnsTab() {
  const s = useApp();
  const [busyId, setBusyId] = useState("");
  const requests = (s.returnRequests || []).slice().sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  return (
    <div>
      <div className="sec-hd">
        <div>
          <p className="eyebrow">After-sales</p>
          <h2 className="sec-title display">Returns</h2>
        </div>
      </div>
      {!requests.length ? (
        <Empty
          icon="refresh"
          title="No return requests"
          sub="Customer return requests will appear here after an eligible delivered order is submitted."
        />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Request</th>
                <th>Order</th>
                <th>Customer</th>
                <th>Reason</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const order = s.orders.find((item) => item.id === request.orderId);
                return (
                  <tr key={request.id}>
                    <td>
                      <b>#{request.id.replace(/^ret-/, "RET-")}</b>
                      <div className="field-hint">{request.note || "No additional note"}</div>
                    </td>
                    <td>
                      <b>{request.orderId}</b>
                      <div className="field-hint">{order ? fmt(order.total) : "Order unavailable"}</div>
                    </td>
                    <td>
                      <div>{order?.customer?.name || "Customer"}</div>
                      <div className="field-hint">{order?.customer?.email || "—"}</div>
                    </td>
                    <td>{request.reason}</td>
                    <td>{new Date(request.createdAt).toLocaleDateString()}</td>
                    <td>
                      <select
                        className="status-sel"
                        value={request.status}
                        disabled={busyId === request.id}
                        aria-label={`Status for return ${request.id}`}
                        onChange={async (e) => {
                          const next = e.target.value;
                          setBusyId(request.id);
                          try {
                            await appActions.setReturnStatus(request.id, next);
                          } finally {
                            setBusyId("");
                          }
                        }}
                      >
                        {Object.values(RETURN_STATUSES).map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                      {request.refund ? (
                        <div style={{ marginTop: 8, fontSize: 12 }}>
                          Refund: <b>{request.refund.status}</b> · {fmt(request.refund.amount)}
                          {request.refund.status !== "refunded" && request.status === "completed" ? (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ marginLeft: 8 }}
                              disabled={busyId === request.id}
                              onClick={async () => {
                                setBusyId(request.id);
                                try {
                                  await appActions.setReturnRefund(request.id, {
                                    status: "refunded",
                                    providerRef: window.prompt("Enter refund/provider reference") || "",
                                    note: "Refund confirmed by staff.",
                                  });
                                } finally {
                                  setBusyId("");
                                }
                              }}
                            >
                              Mark refunded
                            </button>
                          ) : null}
                        </div>
                      ) : request.status === "completed" && order?.paymentMethod !== "cod" ? (
                        <div style={{ marginTop: 8, fontSize: 12 }}>Refund pending · online payment</div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

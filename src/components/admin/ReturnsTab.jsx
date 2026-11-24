import { useApp, appActions } from "../../store/appStore";
import { fmt } from "../../utils/helpers";
import { Empty } from "../common";
import { RETURN_STATUSES } from "../../utils/returns";

export function ReturnsTab() {
  const s = useApp();
  const requests = (s.returnRequests || []).slice().sort((a, b) => b.createdAt - a.createdAt);
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
                        aria-label={`Status for return ${request.id}`}
                        onChange={(e) => appActions.setReturnStatus(request.id, e.target.value)}
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
                              onClick={() =>
                                appActions.setReturnRefund(request.id, {
                                  status: "refunded",
                                  providerRef: window.prompt("Enter refund/provider reference") || "",
                                  note: "Refund confirmed by staff.",
                                })
                              }
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

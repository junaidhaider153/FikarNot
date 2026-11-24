import { useState } from "react";
import { useApp, appActions } from "../../store/appStore";
import { Ic } from "../icons";
import { Empty, Modal, Pagination } from "../common";
import { usePagination } from "../../hooks/usePagination";

export function SupportTab() {
  const s = useApp();
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const all = s.supportTickets || [];
  const tickets = all
    .filter((t) => filter === "all" || t.status === filter)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  const open = all.filter((t) => t.status === "open").length;
  const progress = all.filter((t) => t.status === "in_progress").length;
  const resolved = all.filter((t) => t.status === "resolved").length;
  const { page, pageCount, pageItems, setPage, start, end, total } = usePagination(tickets, 10);
  return (
    <div>
      <div className="stat-grid">
        <div className="stat">
          <span className="ic">
            <Ic n="mail" s={17} />
          </span>
          <b>{all.length}</b>
          <span>Total requests</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="alert" s={17} />
          </span>
          <b>{open}</b>
          <span>Open</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="refresh" s={17} />
          </span>
          <b>{progress}</b>
          <span>In progress</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="check" s={17} />
          </span>
          <b>{resolved}</b>
          <span>Resolved</span>
        </div>
      </div>
      <div className="toolbar support-toolbar">
        <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter support requests">
          <option value="all">All requests</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <span className="result-count">{tickets.length} requests</span>
      </div>
      {!tickets.length ? (
        <Empty icon="mail" title="No support requests" sub="Customer messages will appear here when they contact FikarNot." />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Customer</th>
                <th>Subject</th>
                <th>Category</th>
                <th>Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <strong>{ticket.id}</strong>
                  </td>
                  <td>
                    <div>
                      <b>{ticket.name}</b>
                      <div className="field-hint">{ticket.email}</div>
                    </div>
                  </td>
                  <td style={{ maxWidth: 260 }}>{ticket.subject}</td>
                  <td style={{ textTransform: "capitalize" }}>{ticket.category}</td>
                  <td>{new Date(ticket.createdAt).toLocaleDateString()}</td>
                  <td>
                    <select
                      className="status-sel"
                      value={ticket.status}
                      onChange={(e) => appActions.setSupportTicketStatus(ticket.id, e.target.value)}
                      aria-label={`Status for ${ticket.id}`}
                    >
                      <option value="open">open</option>
                      <option value="in_progress">in progress</option>
                      <option value="resolved">resolved</option>
                    </select>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelected(ticket)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} setPage={setPage} start={start} end={end} total={total} noun="requests" />
      {selected && (
        <Modal title={`${selected.id} · ${selected.subject}`} onClose={() => setSelected(null)} wide>
          <div className="support-detail">
            <div className="support-detail-meta">
              <strong>{selected.name}</strong>
              <span>{selected.email}</span>
              <span>{new Date(selected.createdAt).toLocaleString()}</span>
            </div>
            <div className="support-detail-message">{selected.message}</div>
            <div className="support-detail-actions">
              <select
                className="select"
                value={selected.status}
                onChange={(e) => {
                  appActions.setSupportTicketStatus(selected.id, e.target.value);
                  setSelected({ ...selected, status: e.target.value });
                }}
              >
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
              </select>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (window.confirm(`Delete ${selected.id}?`)) {
                    appActions.deleteSupportTicket(selected.id);
                    setSelected(null);
                  }
                }}
              >
                Delete request
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

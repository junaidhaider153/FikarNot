import { useState } from "react";
import { useApp, appActions } from "../../store/appStore";
import { uid } from "../../utils/helpers";
import { Ic } from "../icons";
import { Modal, Pagination } from "../common";
import { usePagination } from "../../hooks/usePagination";

export function UserEditor({ initial, onClose }) {
  const [f, setF] = useState(() => ({
    name: initial?.name || "",
    email: initial?.email || "",
    role: initial?.role || "customer",
    password: "",
  }));
  const [errs, setErrs] = useState({});
  const [saving, setSaving] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    const er = {};
    if (!f.name.trim()) er.name = "Required";
    if (!/.+@.+\..+/.test(f.email)) er.email = "Valid email required";
    if (!initial && f.password.length < 8) er.password = "Min 8 chars";
    setErrs(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      const ok = await appActions.upsertUser({
        id: initial?.id || "u" + uid(),
        name: f.name.trim(),
        email: f.email.trim(),
        role: f.role,
        password: f.password ? f.password : initial?.password || `fikarnot-${uid().slice(0, 8)}`,
      });
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={initial ? "Edit user" : "New user"} onClose={onClose}>
      <form onSubmit={save}>
        <div style={{ marginBottom: 12 }}>
          <label className="lbl" htmlFor="ue-name">
            Name
          </label>
          <input id="ue-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          {errs.name && <p className="f-err">{errs.name}</p>}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="lbl" htmlFor="ue-email">
            Email
          </label>
          <input id="ue-email" className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          {errs.email && <p className="f-err">{errs.email}</p>}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="lbl" htmlFor="ue-role">
            Role
          </label>
          <select id="ue-role" className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="customer">customer</option>
            <option value="editor">editor</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="lbl" htmlFor="ue-password">
            Password {initial && "(leave blank to keep)"}
          </label>
          <input
            id="ue-password"
            className="input"
            type="password"
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
          />
          {errs.password && <p className="f-err">{errs.password}</p>}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-dark" disabled={saving}>
            <Ic n="check" s={15} /> {saving ? "Saving…" : "Save user"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function UsersTab() {
  const s = useApp();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { page, pageCount, pageItems, setPage, start, end, total } = usePagination(s.users, 10);
  const refresh = async () => {
    setRefreshing(true);
    await appActions.refreshUsers();
    setRefreshing(false);
  };
  return (
    <>
      <div className="toolbar">
        <span className="result-count">{s.users.length} users</span>
        <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={refresh} disabled={refreshing}>
          <Ic n="refresh" s={15} /> {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <button className="btn btn-dark" onClick={() => setCreating(true)}>
          <Ic n="plus" s={15} /> New user
        </button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th className="u-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="avatar">
                      {u.name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                    <b>{u.name}</b>
                    {s.session?.id === u.id && <span className="tag">you</span>}
                  </div>
                </td>
                <td style={{ color: "var(--ink2)" }}>{u.email}</td>
                <td>
                  <select
                    className="status-sel"
                    value={u.role}
                    aria-label={`Role for ${u.name}`}
                    onChange={(e) => appActions.setRole(u.id, e.target.value)}
                  >
                    <option>customer</option>
                    <option>editor</option>
                    <option>admin</option>
                  </select>
                </td>
                <td style={{ color: "var(--ink2)" }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="u-right">
                  <div className="u-row-end">
                    <button className="icon-btn" aria-label={`Edit ${u.name}`} onClick={() => setEditing(u)}>
                      <Ic n="edit" s={14} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={u.role === "admin" ? `${u.name} is an admin — change their role before deleting` : `Delete ${u.name}`}
                      title={
                        u.role === "admin"
                          ? "Admin accounts can't be deleted here — change the role to editor or customer first"
                          : "Delete user"
                      }
                      disabled={u.role === "admin"}
                      style={u.role === "admin" ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                      onClick={() => {
                        if (u.role === "admin") {
                          appActions.toast(
                            "Admin accounts can't be deleted from this screen. Change the role to editor or customer first.",
                            "err",
                          );
                          return;
                        }
                        if (window.confirm(`Delete ${u.name}?`)) appActions.deleteUser(u.id);
                      }}
                    >
                      <Ic n="trash" s={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageCount={pageCount} setPage={setPage} start={start} end={end} total={total} noun="users" />
      {(editing || creating) && (
        <UserEditor
          initial={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

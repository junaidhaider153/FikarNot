import { useState } from "react";
import { useApp, appActions } from "../../store/appStore";
import { fmt } from "../../utils/helpers";
import { Ic } from "../icons";
import { Modal, Empty, Pagination } from "../common";
import { usePagination } from "../../hooks/usePagination";

export function CouponEditor({ initial, onClose }) {
  const [f, setF] = useState(() => ({
    code: initial?.code || "",
    type: initial?.type || "percent",
    value: initial?.value ?? 10,
    minSubtotal: initial?.minSubtotal ?? 0,
    maxUses: initial?.maxUses ?? 0,
    expiresAt: initial?.expiresAt ? new Date(initial.expiresAt).toISOString().slice(0, 10) : "",
    active: initial?.active !== false,
    description: initial?.description || "",
  }));
  const [errs, setErrs] = useState({});
  const save = (event) => {
    event.preventDefault();
    const next = {};
    if (!f.code.trim()) next.code = "Required";
    if (f.type !== "free_shipping" && !(+f.value > 0)) next.value = "Must be > 0";
    if (f.type === "percent" && +f.value > 100) next.value = "Cannot exceed 100";
    if (+f.minSubtotal < 0) next.minSubtotal = "Cannot be negative";
    if (+f.maxUses < 0) next.maxUses = "Cannot be negative";
    setErrs(next);
    if (Object.keys(next).length) return;
    const saved = appActions.upsertCoupon({
      id: initial?.id,
      code: f.code,
      type: f.type,
      value: +f.value || 0,
      minSubtotal: +f.minSubtotal || 0,
      maxUses: +f.maxUses || 0,
      usedCount: initial?.usedCount || 0,
      active: f.active,
      expiresAt: f.expiresAt ? new Date(`${f.expiresAt}T23:59:59`).getTime() : null,
      description: f.description,
    });
    if (saved) onClose();
  };
  return (
    <Modal title={initial ? "Edit coupon" : "New coupon"} onClose={onClose}>
      <form onSubmit={save}>
        <div className="f-grid">
          <div>
            <label className="lbl" htmlFor="cp-code">
              Code
            </label>
            <input
              id="cp-code"
              className="input"
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })}
              placeholder="WELCOME10"
            />
            {errs.code && <p className="f-err">{errs.code}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="cp-type">
              Discount type
            </label>
            <select id="cp-type" className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed amount</option>
              <option value="free_shipping">Free shipping</option>
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="cp-value">
              Value
            </label>
            <input
              id="cp-value"
              className="input"
              type="number"
              min="0"
              step="0.01"
              disabled={f.type === "free_shipping"}
              value={f.type === "free_shipping" ? 0 : f.value}
              onChange={(e) => setF({ ...f, value: e.target.value })}
            />
            {errs.value && <p className="f-err">{errs.value}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="cp-min">
              Minimum subtotal
            </label>
            <input
              id="cp-min"
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={f.minSubtotal}
              onChange={(e) => setF({ ...f, minSubtotal: e.target.value })}
            />
            {errs.minSubtotal && <p className="f-err">{errs.minSubtotal}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="cp-uses">
              Maximum uses
            </label>
            <input
              id="cp-uses"
              className="input"
              type="number"
              min="0"
              step="1"
              value={f.maxUses}
              onChange={(e) => setF({ ...f, maxUses: e.target.value })}
            />
            <p className="form-hint">Use 0 for unlimited.</p>
            {errs.maxUses && <p className="f-err">{errs.maxUses}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="cp-expiry">
              Expiry date
            </label>
            <input
              id="cp-expiry"
              className="input"
              type="date"
              value={f.expiresAt}
              onChange={(e) => setF({ ...f, expiresAt: e.target.value })}
            />
          </div>
          <div className="f-full">
            <label className="lbl" htmlFor="cp-desc">
              Description
            </label>
            <input
              id="cp-desc"
              className="input"
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
              placeholder="10% off your first order over Rs 3,000."
            />
          </div>
          <label className="chk f-full">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Coupon active
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-dark">
            <Ic n="check" s={15} /> Save coupon
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CouponsTab() {
  const s = useApp();
  const [editing, setEditing] = useState(null);
  const [now] = useState(() => Date.now());
  const coupons = (s.coupons || [])
    .slice()
    .sort((a, b) => Number(b.active) - Number(a.active) || String(a.code).localeCompare(String(b.code)));
  const { page, pageCount, pageItems, setPage, start, end, total } = usePagination(coupons, 10);
  return (
    <div>
      <div className="admin-tab-actions">
        <div>
          <p style={{ color: "var(--ink2)", marginTop: 4 }}>Create simple promotions your customers can redeem at checkout.</p>
        </div>
        <button className="btn btn-dark" onClick={() => setEditing({})}>
          <Ic n="plus" s={15} /> New coupon
        </button>
      </div>
      {!coupons.length ? (
        <Empty icon="tag" title="No coupons yet" sub="Create your first promotion to make checkout more flexible." />
      ) : (
        <div className="table-wrap coupon-table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Code</th>
                <th>Offer</th>
                <th>Minimum</th>
                <th>Uses</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((coupon) => {
                const expired = coupon.expiresAt && coupon.expiresAt < now;
                const status = expired ? "Expired" : coupon.active ? "Active" : "Paused";
                const offer =
                  coupon.type === "percent"
                    ? `${coupon.value}% off`
                    : coupon.type === "fixed"
                      ? `${fmt(coupon.value)} off`
                      : "Free shipping";
                return (
                  <tr key={coupon.id}>
                    <td>
                      <strong>{coupon.code}</strong>
                      <div className="field-hint">{coupon.description || "—"}</div>
                    </td>
                    <td>{offer}</td>
                    <td>{coupon.minSubtotal ? fmt(coupon.minSubtotal) : "No minimum"}</td>
                    <td>
                      {coupon.usedCount}
                      {coupon.maxUses ? ` / ${coupon.maxUses}` : " / ∞"}
                    </td>
                    <td>{coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString() : "No expiry"}</td>
                    <td>
                      <span className={`coupon-status ${status.toLowerCase()}`}>{status}</span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="icon-btn"
                          title="Edit coupon"
                          aria-label={`Edit ${coupon.code}`}
                          onClick={() => setEditing(coupon)}
                        >
                          <Ic n="edit" s={14} />
                        </button>
                        {!expired && (
                          <button
                            className="icon-btn"
                            title={coupon.active ? "Pause coupon" : "Activate coupon"}
                            aria-label={`${coupon.active ? "Pause" : "Activate"} ${coupon.code}`}
                            onClick={() => appActions.toggleCoupon(coupon.id)}
                          >
                            <Ic n="check" s={14} />
                          </button>
                        )}
                        <button
                          className="icon-btn"
                          title="Delete coupon"
                          aria-label={`Delete ${coupon.code}`}
                          onClick={() => {
                            if (window.confirm(`Delete coupon ${coupon.code}?`)) appActions.deleteCoupon(coupon.id);
                          }}
                        >
                          <Ic n="trash" s={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} setPage={setPage} start={start} end={end} total={total} noun="coupons" />
      {editing && <CouponEditor initial={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </div>
  );
}

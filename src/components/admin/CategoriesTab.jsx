import { useState } from "react";
import { useApp, appActions } from "../../store/appStore";
import { SWATCHES } from "../../assets/assets";
import { uid } from "../../utils/helpers";
import { Ic } from "../icons";
import { Modal } from "../common";

export function CategoryEditor({ initial, onClose }) {
  const [f, setF] = useState(() => ({
    name: initial?.name || "",
    description: initial?.description || "",
    color: initial?.color || SWATCHES[0],
  }));
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!f.name.trim()) {
      setErr("Required");
      return;
    }
    setSaving(true);
    try {
      const saved = await appActions.upsertCategory({
        id: initial?.id || "c" + uid(),
        name: f.name.trim(),
        description: f.description.trim(),
        color: f.color,
      });
      if (saved) onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={initial ? "Edit category" : "New category"} onClose={onClose}>
      <form onSubmit={save}>
        <div style={{ marginBottom: 12 }}>
          <label className="lbl" htmlFor="ce-name">
            Name
          </label>
          <input id="ce-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          {err && <p className="f-err">{err}</p>}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="lbl" htmlFor="ce-description">
            Description
          </label>
          <textarea
            id="ce-description"
            className="textarea"
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <span className="lbl" id="ce-color-label">
            Color
          </span>
          <div className="swatches" role="group" aria-labelledby="ce-color-label">
            {SWATCHES.map((c) => (
              <button
                type="button"
                key={c}
                className={"swatch" + (f.color === c ? " sel" : "")}
                style={{ background: c }}
                onClick={() => setF({ ...f, color: c })}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-dark" disabled={saving}>
            <Ic n="check" s={15} /> {saving ? "Saving…" : "Save category"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CategoriesTab() {
  const s = useApp();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="toolbar">
        <span className="result-count">{s.categories.length} categories</span>
        <button className="btn btn-dark" style={{ marginLeft: "auto" }} onClick={() => setCreating(true)}>
          <Ic n="plus" s={15} /> New category
        </button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Category</th>
              <th>Description</th>
              <th>Products</th>
              <th className="u-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {s.categories.map((c) => (
              <tr key={c.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="cat-dot" style={{ background: c.color, marginBottom: 0 }} />
                    <b>{c.name}</b>
                  </div>
                </td>
                <td style={{ color: "var(--ink2)" }}>{c.description}</td>
                <td>{s.products.filter((p) => p.categoryId === c.id).length}</td>
                <td className="u-right">
                  <div className="u-row-end">
                    <button className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                      <Ic n="edit" s={14} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Delete ${c.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete ${c.name}?`)) appActions.deleteCategory(c.id);
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
      {(editing || creating) && (
        <CategoryEditor
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

import { useEffect, useState } from "react";
import { appActions } from "../../store/appStore";
import { mediaApi } from "../../api/mediaApi";
import { Empty, SkelMediaGrid } from "../common";

export function MediaTab() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const result = await mediaApi.list({ limit: 100, offset: 0 });
      setAssets(result.assets || []);
    } catch (error) {
      appActions.toast(error.message || "Could not load media", "err");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const remove = async (asset) => {
    if (asset.usageCount > 0) {
      appActions.toast("This image is currently in use. Remove its references first.", "err");
      return;
    }
    if (!window.confirm(`Delete ${asset.originalName || asset.filename}?`)) return;
    setWorking(true);
    try {
      await mediaApi.remove(asset.id);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      appActions.toast("Media deleted");
    } catch (error) {
      appActions.toast(error.message || "Could not delete media", "err");
    } finally {
      setWorking(false);
    }
  };
  const cleanup = async () => {
    if (!window.confirm("Remove all uploaded images that are no longer used anywhere in FikarNot?")) return;
    setWorking(true);
    try {
      const result = await mediaApi.cleanup();
      appActions.toast(`${result.removed || 0} unused image${result.removed === 1 ? "" : "s"} removed`);
      await load();
    } catch (error) {
      appActions.toast(error.message || "Could not clean media", "err");
    } finally {
      setWorking(false);
    }
  };
  return (
    <div>
      <div className="sec-hd">
        <div>
          <h2 className="sec-title display">Media library</h2>
          <p className="section-sub">Uploaded product and storefront images stored by FikarNot.</p>
        </div>
        <button className="btn btn-ghost" onClick={cleanup} disabled={working || loading}>
          Clean unused
        </button>
      </div>
      {loading ? (
        <SkelMediaGrid n={8} />
      ) : assets.length === 0 ? (
        <Empty icon="box" title="No uploaded media" sub="Images uploaded from a device will appear here." />
      ) : (
        <div className="media-library-grid">
          {assets.map((asset) => (
            <article className="media-library-card" key={asset.id}>
              <div className="media-library-thumb">
                <img src={asset.url} alt={asset.originalName || "Uploaded media"} loading="lazy" />
              </div>
              <div className="media-library-info">
                <strong title={asset.originalName || asset.filename}>{asset.originalName || asset.filename}</strong>
                <span>
                  {(asset.byteSize / 1024).toFixed(0)} KB · {asset.mimeType.replace("image/", "").toUpperCase()}
                </span>
                <span>{asset.usageCount > 0 ? `Used in ${asset.usageCount} place${asset.usageCount === 1 ? "" : "s"}` : "Unused"}</span>
              </div>
              <button className="btn btn-danger btn-sm" disabled={working || asset.usageCount > 0} onClick={() => remove(asset)}>
                Delete
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

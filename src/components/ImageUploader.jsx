import { useRef, useState } from "react";
import { Ic } from "./icons";
import { MAX_STORED_IMAGES, prepareImageFile } from "../utils/imageUpload";
import { uploadsApi } from "../api/uploadsApi";

export function ImageUploader({ images = [], onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [url, setUrl] = useState("");

  const addImages = async (files) => {
    const selected = Array.from(files || []).filter(Boolean);
    if (!selected.length) return;
    setBusy(true);
    setErr("");
    try {
      const room = Math.max(0, MAX_STORED_IMAGES - images.length);
      if (!room) throw new Error(`You can keep up to ${MAX_STORED_IMAGES} product images.`);
      const uploaded = [];
      for (const file of selected.slice(0, room)) {
        const dataUrl = await prepareImageFile(file);
        const { url: storedUrl } = await uploadsApi.uploadImage(dataUrl, file.name);
        uploaded.push(storedUrl);
      }
      onChange([...images, ...uploaded]);
    } catch (e) {
      setErr(e.message || "Could not add image.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const addUrl = (e) => {
    e.preventDefault();
    const value = url.trim();
    if (!value) return;
    if (images.length >= MAX_STORED_IMAGES) {
      setErr(`You can keep up to ${MAX_STORED_IMAGES} product images.`);
      return;
    }
    try {
      const parsed = new URL(value);
      if (!/^https?:$/i.test(parsed.protocol)) throw new Error();
    } catch {
      setErr("Enter a valid http(s) image URL.");
      return;
    }
    setErr("");
    onChange([...images, value]);
    setUrl("");
  };

  const remove = (index) => onChange(images.filter((_, i) => i !== index));
  const makePrimary = (index) => {
    if (index === 0) return;
    const next = [...images];
    const [picked] = next.splice(index, 1);
    next.unshift(picked);
    onChange(next);
  };

  return (
    <div className="image-uploader">
      <div className="image-uploader-actions">
        <button type="button" className="btn btn-dark btn-sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Ic n="box" s={14} /> {busy ? "Preparing…" : "Upload from device"}
        </button>
        <span className="image-hint">JPG, PNG, WebP · up to 4 MB each · max {MAX_STORED_IMAGES}</span>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => addImages(e.target.files)} />

      <form className="image-url-row" onSubmit={addUrl}>
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Or paste an image URL" />
        <button className="btn btn-ghost btn-sm" type="submit" disabled={!url.trim()}>
          <Ic n="plus" s={14} /> Add URL
        </button>
      </form>

      {err && <p className="f-err">{err}</p>}

      {images.length > 0 ? (
        <div className="upload-grid">
          {images.map((src, index) => (
            <div className={"upload-card" + (index === 0 ? " primary" : "")} key={`${src}-${index}`}>
              <img src={src} alt={`Product preview ${index + 1}`} />
              <div className="upload-card-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => makePrimary(index)} disabled={index === 0}>
                  {index === 0 ? "Primary" : "Make primary"}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => remove(index)}
                  aria-label={`Remove image ${index + 1}`}
                  title="Remove image"
                >
                  <Ic n="trash" s={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="upload-empty">
          <span className="empty-ic">
            <Ic n="box" s={24} />
          </span>
          <strong>No product images yet</strong>
          <span>Add one from your device or paste an image URL.</span>
        </div>
      )}
    </div>
  );
}

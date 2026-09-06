import { useRef, useState } from "react";
import { Ic } from "./icons";
import { uploadsApi, MAX_VIDEO_BYTES, ALLOWED_VIDEO_TYPES } from "../api/uploadsApi";

/**
 * Hero background video control for Studio → Settings.
 *
 * Two ways to set the hero clip:
 *   1. Upload an MP4/WebM straight from the device (drag & drop is supported too).
 *   2. Paste a URL (CDN link, or a file you dropped in `public/media/`).
 *
 * `value` is the stored setting string (heroVideo / heroVideoWebm).
 */
export function HeroVideoField({ id, label, hint, value, onChange, poster = "" }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progressNote, setProgressNote] = useState("");
  const [err, setErr] = useState("");
  const [dragging, setDragging] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setErr("");
    setBusy(true);
    setProgressNote(`Uploading ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)…`);
    try {
      const result = await uploadsApi.uploadVideo(file);
      onChange(result.url);
    } catch (error) {
      setErr(error.message || "Could not upload the video.");
    } finally {
      setBusy(false);
      setProgressNote("");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    upload(event.dataTransfer?.files?.[0]);
  };

  return (
    <div className="hero-video-field">
      <label className="lbl" htmlFor={id}>
        {label}
      </label>

      <div
        className={"hero-video-drop" + (dragging ? " is-dragging" : "") + (busy ? " is-busy" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className="hero-video-drop-ic">
          <Ic n="box" s={20} />
        </span>
        <div className="hero-video-drop-copy">
          <strong>{busy ? "Uploading…" : "Drop a video here or upload from your device"}</strong>
          <span>{hint || `MP4 or WebM · up to ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB · a 6–12 s silent loop looks best`}</span>
        </div>
        <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Uploading…" : "Choose file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_VIDEO_TYPES.join(",")}
          hidden
          disabled={busy}
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </div>

      <div className="hero-video-url-row">
        <input
          id={id}
          className="input"
          value={value || ""}
          placeholder="…or paste a video URL (https://… or /media/hero-loop.mp4)"
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange("")}>
            <Ic n="trash" s={14} /> Remove
          </button>
        )}
      </div>

      {progressNote && <p className="hero-video-note">{progressNote}</p>}
      {err && <p className="f-err">{err}</p>}

      {value && (
        <div className="hero-video-preview">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- decorative, muted background loop */}
          <video src={value} poster={poster || undefined} muted loop playsInline autoPlay preload="metadata" />
          <span className="hero-video-preview-tag">Preview · save settings to publish</span>
        </div>
      )}
    </div>
  );
}

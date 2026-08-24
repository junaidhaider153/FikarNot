import { Link, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { useApp, appActions } from "../store/appStore";
import { Empty } from "../components/common";
import { Ic } from "../components/icons";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

function formatTime(value) {
  const date = new Date(value);
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function NotificationsPage() {
  const s = useApp();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  useDocumentMeta({ title: "Notifications", noindex: true });

  const notifications = useMemo(() => {
    const list = [...(s.notifications || [])].sort((a, b) => b.createdAt - a.createdAt);
    return filter === "unread" ? list.filter((item) => !item.read) : list;
  }, [s.notifications, filter]);

  if (!s.session) return null;

  const openNotification = (item) => {
    if (!item.read) appActions.markNotificationRead(item.id);
    navigate(item.link || "/account");
  };

  return (
    <div className="container notifications-page">
      <div className="page-heading notifications-heading">
        <div>
          <p className="eyebrow">Stay in the loop</p>
          <h1 className="h1 display">Notifications</h1>
          <p className="hero-sub">Order updates, account messages and important FikarNot activity in one place.</p>
        </div>
        <div className="notifications-actions">
          <Link className="btn btn-ghost" to="/account">
            Back to account
          </Link>
          {s.notifications?.some((item) => !item.read) && (
            <button className="btn btn-dark" onClick={() => appActions.markAllNotificationsRead()}>
              <Ic n="check" s={15} /> Mark all read
            </button>
          )}
          {s.notifications?.length > 0 && (
            <button className="btn btn-danger" onClick={() => appActions.clearNotifications()}>
              <Ic n="trash" s={14} /> Clear all
            </button>
          )}
        </div>
      </div>

      <div className="notifications-toolbar">
        <div className="notification-filter" role="tablist" aria-label="Notification filter">
          <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
            All <span>{s.notifications?.length || 0}</span>
          </button>
          <button className={filter === "unread" ? "on" : ""} onClick={() => setFilter("unread")}>
            Unread <span>{s.notifications?.filter((item) => !item.read).length || 0}</span>
          </button>
        </div>
      </div>

      {notifications.length === 0 ? (
        <Empty
          icon="bell"
          title={filter === "unread" ? "You're all caught up" : "No notifications yet"}
          sub={
            filter === "unread"
              ? "There are no unread messages waiting for you."
              : "Order confirmations and account updates will appear here."
          }
          cta={
            <Link className="btn btn-dark" to="/products">
              Continue shopping
            </Link>
          }
        />
      ) : (
        <div className="notification-list">
          {notifications.map((item) => (
            <button key={item.id} className={`notification-card ${item.read ? "read" : "unread"}`} onClick={() => openNotification(item)}>
              <span className={`notification-icon ${item.type || "info"}`}>
                <Ic n={item.type === "order" ? "truck" : "bell"} s={19} />
              </span>
              <span className="notification-copy">
                <strong>{item.title}</strong>
                <span>{item.message}</span>
                <small>{formatTime(item.createdAt)}</small>
              </span>
              <span className="notification-arrow">
                <Ic n="arrow" s={16} />
              </span>
              {!item.read && <span className="notification-dot" aria-label="Unread" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

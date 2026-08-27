import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { fmt } from "../utils/helpers";
import { Empty, Modal } from "../components/common";
import { RETURN_REASONS, canCancelOrder, canRequestReturn } from "../utils/returns";
import { ProductCard } from "../components/ProductCard";
import { Ic } from "../components/icons";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

const emptyAddress = { id: "", label: "Home", name: "", line1: "", city: "", region: "", postalCode: "", country: "", isDefault: false };

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function StatusPill({ status }) {
  return <span className={`account-status ${status}`}>{status}</span>;
}

const ORDER_STEPS = [
  { key: "paid", label: "Order placed", note: "Your order has been received." },
  { key: "processing", label: "Processing", note: "FikarNot is preparing your order." },
  { key: "shipped", label: "Shipped", note: "Your order is on the way." },
  { key: "delivered", label: "Delivered", note: "Your order has been delivered." },
];

function OrderProgress({ status }) {
  if (status === "cancelled") {
    return (
      <div className="order-progress cancelled-progress">
        <div className="order-progress-step active">
          <span className="step-n">!</span>
          <div>
            <strong>Order cancelled</strong>
            <p>This order was cancelled.</p>
          </div>
        </div>
      </div>
    );
  }
  const currentIndex = Math.max(
    0,
    ORDER_STEPS.findIndex((step) => step.key === status),
  );
  return (
    <div className="order-progress" aria-label={`Order status: ${status}`}>
      {ORDER_STEPS.map((step, index) => (
        <div className={`order-progress-step ${index <= currentIndex ? "active" : ""}`} key={step.key}>
          <span className="step-n">{index < currentIndex ? "✓" : index + 1}</span>
          <div>
            <strong>{step.label}</strong>
            <p>{step.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AccountPage() {
  const s = useApp();
  const navigate = useNavigate();
  useDocumentMeta({ title: "My account", noindex: true });
  const user = s.session;
  const [tab, setTab] = useState("overview");
  const [profile, setProfile] = useState({ name: user?.name || "", email: user?.email || "" });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [address, setAddress] = useState(emptyAddress);
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [returnOrder, setReturnOrder] = useState(null);
  const [returnReason, setReturnReason] = useState(RETURN_REASONS[0]);
  const [returnNote, setReturnNote] = useState("");

  const orders = useMemo(
    () =>
      s.orders.filter(
        (order) =>
          order.customer?.userId === user?.id ||
          (!order.customer?.userId && order.customer?.email?.toLowerCase() === user?.email?.toLowerCase()),
      ),
    [s.orders, user?.id, user?.email],
  );
  const addresses = Array.isArray(user?.addresses) ? user.addresses : [];
  const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);

  if (!user) return null;

  const saveProfile = async (e) => {
    e.preventDefault();
    const ok = await appActions.updateProfile(profile);
    if (ok) setTab("overview");
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (passwords.next !== passwords.confirm) {
      appActions.toast("New passwords do not match", "err");
      return;
    }
    if (await appActions.changePassword(passwords.current, passwords.next)) {
      setPasswords({ current: "", next: "", confirm: "" });
    }
  };

  const openNewAddress = () => {
    setAddress({ ...emptyAddress, name: user.name, isDefault: addresses.length === 0 });
    setAddressError("");
    setEditingAddress(true);
    setTab("addresses");
  };

  const openEditAddress = (item) => {
    setAddress({ ...emptyAddress, ...item });
    setAddressError("");
    setEditingAddress(true);
    setTab("addresses");
  };

  const saveAddress = (e) => {
    e.preventDefault();
    const required = [address.name, address.line1, address.city, address.country];
    if (required.some((value) => !value?.trim())) {
      setAddressError("Please complete your name, address, city and country.");
      return;
    }
    if (appActions.saveAddress(address)) {
      setEditingAddress(false);
      setAddress(emptyAddress);
    }
  };

  const logout = () => {
    appActions.logout();
    navigate("/", { replace: true });
  };

  const closeDeleteAccount = () => {
    if (deleteBusy) return;
    setShowDeleteAccount(false);
    setDeletePassword("");
    setDeleteConfirmation("");
  };

  const confirmDeleteAccount = async (e) => {
    e.preventDefault();
    setDeleteBusy(true);
    const ok = await appActions.deleteAccount(deletePassword, deleteConfirmation);
    setDeleteBusy(false);
    if (ok) {
      setShowDeleteAccount(false);
      navigate("/", { replace: true });
    }
  };

  const submitReturn = (e) => {
    e.preventDefault();
    if (!returnOrder) return;
    if (appActions.requestReturn(returnOrder.id, returnReason, returnNote)) {
      setReturnOrder(null);
      setReturnReason(RETURN_REASONS[0]);
      setReturnNote("");
    }
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: "user" },
    { id: "orders", label: "Orders", icon: "cart", count: orders.length },
    { id: "wishlist", label: "Wishlist", icon: "heart", count: s.wishlist.length },
    { id: "addresses", label: "Addresses", icon: "truck", count: addresses.length },
    { id: "profile", label: "Profile", icon: "edit" },
    { id: "security", label: "Security", icon: "shield" },
  ];

  return (
    <div className="container account-layout">
      <aside className="account-side">
        <div className="account-identity">
          <span className="account-avatar">
            {user.name
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div>
            <b>{user.name}</b>
            <span>{user.email}</span>
          </div>
        </div>
        <nav className="account-nav" aria-label="Account navigation">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={`account-nav-btn ${tab === item.id ? "active" : ""}`}
              onClick={() => {
                setTab(item.id);
                if (item.id !== "addresses") setEditingAddress(false);
              }}
            >
              <Ic n={item.icon} s={16} />
              <span>{item.label}</span>
              {item.count != null && <span className="account-count">{item.count}</span>}
            </button>
          ))}
          <Link className="account-nav-btn account-nav-link" to="/notifications">
            <Ic n="bell" s={16} />
            <span>Notifications</span>
            {(s.notifications?.filter((item) => !item.read).length || 0) > 0 && (
              <span className="account-count">{s.notifications.filter((item) => !item.read).length}</span>
            )}
          </Link>
          <button className="account-nav-btn danger" onClick={logout}>
            <Ic n="logout" s={16} />
            <span>Sign out</span>
          </button>
        </nav>
      </aside>

      <main className="account-main">
        {tab === "overview" && (
          <>
            <div className="account-heading">
              <div>
                <p className="eyebrow">Your space</p>
                <h1 className="sec-title display">Welcome, {user.name.split(" ")[0]}</h1>
                <p>Keep your details, addresses and orders together.</p>
              </div>
              <Link className="btn btn-dark" to="/products">
                Continue shopping <Ic n="arrow" s={15} />
              </Link>
            </div>
            <div className="account-stats">
              <div className="account-stat">
                <span className="ic">
                  <Ic n="cart" s={17} />
                </span>
                <b>{orders.length}</b>
                <span>Orders placed</span>
              </div>
              <div className="account-stat">
                <span className="ic">
                  <Ic n="truck" s={17} />
                </span>
                <b>{addresses.length}</b>
                <span>Saved addresses</span>
              </div>
              <div className="account-stat">
                <span className="ic">
                  <Ic n="box" s={17} />
                </span>
                <b>{fmt(totalSpent)}</b>
                <span>Total order value</span>
              </div>
            </div>
            <div className="account-grid-two">
              <section className="account-card">
                <div className="account-card-head">
                  <div>
                    <p className="lbl">Latest order</p>
                    <h2>{orders[0] ? `#${orders[0].id}` : "No orders yet"}</h2>
                  </div>
                  {orders[0] && <StatusPill status={orders[0].status} />}
                </div>
                {orders[0] ? (
                  <>
                    <p className="account-muted">
                      {formatDate(orders[0].createdAt)} · {orders[0].items.reduce((sum, item) => sum + item.qty, 0)} items
                    </p>
                    <div className="sum-row total">
                      <span>Total</span>
                      <span>{fmt(orders[0].total)}</span>
                    </div>
                    {orders[0].trackingNumber && (
                      <div className="confirmation-address" style={{ marginTop: 12 }}>
                        <span>Shipment</span>
                        <strong>{orders[0].courier || "Courier"} · {orders[0].trackingNumber}</strong>
                        {orders[0].trackingUrl && <a href={orders[0].trackingUrl} target="_blank" rel="noreferrer">Track shipment</a>}
                      </div>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setTab("orders")}>
                      View orders
                    </button>
                  </>
                ) : (
                  <Empty
                    icon="cart"
                    title="Your bag is waiting"
                    sub="Browse the shop and your first order will appear here."
                    cta={
                      <Link className="btn btn-dark btn-sm" to="/products">
                        Browse products
                      </Link>
                    }
                  />
                )}
              </section>
              <section className="account-card">
                <div className="account-card-head">
                  <div>
                    <p className="lbl">Default address</p>
                    <h2>{addresses.find((item) => item.isDefault)?.label || "Not added yet"}</h2>
                  </div>
                  <button className="icon-btn" onClick={openNewAddress} aria-label="Add address">
                    <Ic n="plus" s={15} />
                  </button>
                </div>
                {addresses.find((item) => item.isDefault) ? (
                  <div className="address-preview">
                    <b>{addresses.find((item) => item.isDefault).name}</b>
                    <span>{addresses.find((item) => item.isDefault).line1}</span>
                    <span>
                      {addresses.find((item) => item.isDefault).city}, {addresses.find((item) => item.isDefault).region}{" "}
                      {addresses.find((item) => item.isDefault).postalCode}
                    </span>
                    <span>{addresses.find((item) => item.isDefault).country}</span>
                  </div>
                ) : (
                  <p className="account-muted">Save an address to make checkout faster.</p>
                )}
              </section>
            </div>
          </>
        )}

        {tab === "wishlist" && (
          <>
            <div className="account-heading">
              <div>
                <p className="eyebrow">Saved for later</p>
                <h1 className="sec-title display">Your wishlist</h1>
                <p>Keep your favorite products in one place.</p>
              </div>
              <Link className="btn btn-dark" to="/wishlist">
                Open full wishlist <Ic n="arrow" s={15} />
              </Link>
            </div>
            {s.wishlist.length === 0 ? (
              <section className="account-card">
                <Empty
                  icon="heart"
                  title="Nothing saved yet"
                  sub="Tap the heart on any product to save it here."
                  cta={
                    <Link className="btn btn-dark btn-sm" to="/products">
                      Browse the shop
                    </Link>
                  }
                />
              </section>
            ) : (
              <div className="prod-grid">
                {s.wishlist
                  .map((id) => s.products.find((product) => product.id === id))
                  .filter(Boolean)
                  .slice(0, 4)
                  .map((product) => (
                    <ProductCard key={product.id} p={product} />
                  ))}
              </div>
            )}
          </>
        )}

        {tab === "orders" && (
          <>
            <div className="account-heading">
              <div>
                <p className="eyebrow">Purchase history</p>
                <h1 className="sec-title display">Your orders</h1>
                <p>Every order placed from this account appears here.</p>
              </div>
            </div>
            {orders.length === 0 ? (
              <Empty
                icon="cart"
                title="No orders yet"
                sub="Your completed orders will appear here."
                cta={
                  <Link className="btn btn-dark" to="/products">
                    Start shopping
                  </Link>
                }
              />
            ) : (
              <div className="account-order-list">
                {orders.map((order) => (
                  <details key={order.id} className="order-card">
                    <summary>
                      <div>
                        <strong>#{order.id}</strong>
                        <span>{formatDate(order.createdAt)}</span>
                      </div>
                      <div>
                        <StatusPill status={order.status} />
                        <b>{fmt(order.total)}</b>
                      </div>
                    </summary>
                    <div className="order-body">
                      <OrderProgress status={order.status} />
                      <div className="order-items">
                        {order.items.map((item) => (
                          <div key={item.productId} className="order-item">
                            <span>
                              {item.qty} × {item.name}
                            </span>
                            <b>{fmt(item.price * item.qty)}</b>
                          </div>
                        ))}
                      </div>
                      <div className="sum-row">
                        <span>Shipping</span>
                        <span>{order.shipping === 0 ? "Free" : fmt(order.shipping)}</span>
                      </div>
                      {order.discount > 0 && (
                        <div className="sum-row coupon-discount-row">
                          <span>Discount {order.coupon?.code ? `(${order.coupon.code})` : ""}</span>
                          <span>-{fmt(order.discount)}</span>
                        </div>
                      )}
                      <div className="sum-row total">
                        <span>Total</span>
                        <span>{fmt(order.total)}</span>
                      </div>
                      {order.customer?.email && (
                        <p className="account-note" style={{ marginTop: 12 }}>
                          <Ic n="check" s={15} /> Updates for this order are associated with <b>{order.customer.email}</b>.
                        </p>
                      )}
                      {order.returnRequest && (
                        <div className="return-request-note">
                          <Ic n="refresh" s={15} /> Return request:{" "}
                          <b>{(s.returnRequests || []).find((item) => item.id === order.returnRequest)?.status || "requested"}</b>
                        </div>
                      )}
                      <div className="order-actions">
                        {canCancelOrder(order) && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              if (window.confirm(`Cancel order ${order.id}? The items will be returned to stock.`))
                                appActions.cancelOrder(order.id);
                            }}
                          >
                            Cancel order
                          </button>
                        )}
                        {canRequestReturn(order) && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setReturnOrder(order)}>
                            Request return
                          </button>
                        )}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "addresses" && (
          <>
            <div className="account-heading">
              <div>
                <p className="eyebrow">Saved places</p>
                <h1 className="sec-title display">Your addresses</h1>
                <p>Keep delivery details ready for checkout.</p>
              </div>
              {!editingAddress && (
                <button className="btn btn-dark" onClick={openNewAddress}>
                  <Ic n="plus" s={15} /> Add address
                </button>
              )}
            </div>
            {editingAddress ? (
              <section className="account-card">
                <div className="account-card-head">
                  <div>
                    <p className="lbl">Address details</p>
                    <h2>{address.id ? "Edit address" : "Add a new address"}</h2>
                  </div>
                  <button className="icon-btn" onClick={() => setEditingAddress(false)} aria-label="Close">
                    <Ic n="x" s={15} />
                  </button>
                </div>
                <form onSubmit={saveAddress}>
                  <div className="f-grid">
                    <div>
                      <label className="lbl" htmlFor="addr-label">
                        Label
                      </label>
                      <input
                        id="addr-label"
                        className="input"
                        value={address.label}
                        onChange={(e) => setAddress({ ...address, label: e.target.value })}
                        placeholder="Home"
                      />
                    </div>
                    <div>
                      <label className="lbl" htmlFor="addr-name">
                        Full name
                      </label>
                      <input
                        id="addr-name"
                        className="input"
                        value={address.name}
                        onChange={(e) => setAddress({ ...address, name: e.target.value })}
                      />
                    </div>
                    <div className="f-full">
                      <label className="lbl" htmlFor="addr-line">
                        Address
                      </label>
                      <input
                        id="addr-line"
                        className="input"
                        value={address.line1}
                        onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                        placeholder="Street and house number"
                      />
                    </div>
                    <div>
                      <label className="lbl" htmlFor="addr-city">
                        City
                      </label>
                      <input
                        id="addr-city"
                        className="input"
                        value={address.city}
                        onChange={(e) => setAddress({ ...address, city: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="lbl" htmlFor="addr-region">
                        State / Region
                      </label>
                      <input
                        id="addr-region"
                        className="input"
                        value={address.region}
                        onChange={(e) => setAddress({ ...address, region: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="lbl" htmlFor="addr-postal">
                        Postal code
                      </label>
                      <input
                        id="addr-postal"
                        className="input"
                        value={address.postalCode}
                        onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="lbl" htmlFor="addr-country">
                        Country
                      </label>
                      <input
                        id="addr-country"
                        className="input"
                        value={address.country}
                        onChange={(e) => setAddress({ ...address, country: e.target.value })}
                      />
                    </div>
                  </div>
                  {addressError && (
                    <p className="f-err" style={{ marginTop: 12 }}>
                      {addressError}
                    </p>
                  )}
                  <label className="chk" style={{ marginTop: 16 }}>
                    <input
                      type="checkbox"
                      checked={address.isDefault}
                      onChange={(e) => setAddress({ ...address, isDefault: e.target.checked })}
                    />{" "}
                    Make this my default address
                  </label>
                  <div className="form-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setEditingAddress(false)}>
                      Cancel
                    </button>
                    <button className="btn btn-dark">
                      <Ic n="check" s={15} /> Save address
                    </button>
                  </div>
                </form>
              </section>
            ) : (
              <div className="address-grid">
                {addresses.map((item) => (
                  <article className={`address-card ${item.isDefault ? "default" : ""}`} key={item.id}>
                    <div className="address-card-head">
                      <span className="address-label">{item.label}</span>
                      {item.isDefault && <span className="account-status paid">Default</span>}
                    </div>
                    <b>{item.name}</b>
                    <span>{item.line1}</span>
                    <span>
                      {item.city}, {item.region} {item.postalCode}
                    </span>
                    <span>{item.country}</span>
                    <div className="address-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditAddress(item)}>
                        <Ic n="edit" s={14} /> Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          if (window.confirm("Remove this address?")) appActions.deleteAddress(item.id);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
                {addresses.length === 0 && (
                  <Empty
                    icon="truck"
                    title="No saved addresses"
                    sub="Add your first delivery address to speed up checkout."
                    cta={
                      <button className="btn btn-dark" onClick={openNewAddress}>
                        Add address
                      </button>
                    }
                  />
                )}
              </div>
            )}
          </>
        )}

        {tab === "profile" && (
          <>
            <div className="account-heading">
              <div>
                <p className="eyebrow">Personal information</p>
                <h1 className="sec-title display">Your profile</h1>
                <p>Keep your name and email up to date.</p>
              </div>
            </div>
            <section className="account-card">
              <form onSubmit={saveProfile}>
                <div className="f-grid">
                  <div>
                    <label className="lbl" htmlFor="profile-name">
                      Full name
                    </label>
                    <input
                      id="profile-name"
                      className="input"
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      autoComplete="name"
                    />
                  </div>
                  <div>
                    <label className="lbl" htmlFor="profile-email">
                      Email address
                    </label>
                    <input
                      id="profile-email"
                      type="email"
                      className="input"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      autoComplete="email"
                    />
                  </div>
                  <div className="f-full">
                    <p className="account-note">
                      <Ic n="shield" s={15} /> Your role: <b>{user.role}</b>. Account permissions are controlled by the store.
                    </p>
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn btn-dark">
                    <Ic n="check" s={15} /> Save changes
                  </button>
                </div>
              </form>
            </section>
          </>
        )}

        {tab === "security" && (
          <>
            <div className="account-heading">
              <div>
                <p className="eyebrow">Account security</p>
                <h1 className="sec-title display">Password & security</h1>
                <p>Change your password using your current credentials.</p>
              </div>
            </div>
            <section className="account-card">
              <form onSubmit={savePassword}>
                <div className="f-grid">
                  <div className="f-full">
                    <label className="lbl" htmlFor="current-pass">
                      Current password
                    </label>
                    <input
                      id="current-pass"
                      type="password"
                      className="input"
                      value={passwords.current}
                      onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                      autoComplete="current-password"
                    />
                  </div>
                  <div>
                    <label className="lbl" htmlFor="next-pass">
                      New password
                    </label>
                    <input
                      id="next-pass"
                      type="password"
                      className="input"
                      value={passwords.next}
                      onChange={(e) => setPasswords({ ...passwords, next: e.target.value })}
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label className="lbl" htmlFor="confirm-pass">
                      Confirm password
                    </label>
                    <input
                      id="confirm-pass"
                      type="password"
                      className="input"
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <p className="account-note">
                  <Ic n="shield" s={15} /> Use at least 6 characters for this demo project.
                </p>
                <div className="form-actions">
                  <button className="btn btn-dark">
                    <Ic n="check" s={15} /> Change password
                  </button>
                </div>
              </form>
            </section>
            {user.role === "customer" && (
              <section className="account-card account-danger-zone">
                <div className="account-card-head">
                  <div>
                    <p className="lbl">Danger zone</p>
                    <h2>Delete your account</h2>
                  </div>
                  <span className="account-status cancelled">Permanent</span>
                </div>
                <p className="account-muted">
                  This permanently removes your account, clears your cart and wishlist, signs you out, and anonymizes your existing order
                  history.
                </p>
                <button className="btn btn-danger" onClick={() => setShowDeleteAccount(true)}>
                  <Ic n="trash" s={15} /> Delete my account
                </button>
              </section>
            )}
          </>
        )}
      </main>
      {returnOrder && (
        <Modal title={`Request a return · ${returnOrder.id}`} onClose={() => setReturnOrder(null)}>
          <form onSubmit={submitReturn}>
            <p className="account-muted">Returns are available for delivered orders within 30 days in this demo.</p>
            <div style={{ marginBottom: 14 }}>
              <label className="lbl" htmlFor="return-reason">
                Reason
              </label>
              <select id="return-reason" className="select" value={returnReason} onChange={(e) => setReturnReason(e.target.value)}>
                {RETURN_REASONS.map((reason) => (
                  <option key={reason}>{reason}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label className="lbl" htmlFor="return-note">
                Additional details
              </label>
              <textarea
                id="return-note"
                className="textarea"
                value={returnNote}
                onChange={(e) => setReturnNote(e.target.value)}
                placeholder="Tell us anything that will help us review the request."
                maxLength={500}
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setReturnOrder(null)}>
                Cancel
              </button>
              <button className="btn btn-dark">
                <Ic n="check" s={15} /> Submit return request
              </button>
            </div>
          </form>
        </Modal>
      )}
      {showDeleteAccount && (
        <Modal title="Delete your account" onClose={closeDeleteAccount}>
          <div className="delete-account-warning">
            <span className="empty-ic">
              <Ic n="alert" s={26} />
            </span>
            <h3 className="display">This cannot be undone</h3>
            <p>
              You will be signed out immediately. Your cart and wishlist will be cleared, while your past orders will remain in FikarNot
              with your personal details anonymized.
            </p>
          </div>
          <form onSubmit={confirmDeleteAccount}>
            <div style={{ marginTop: 18 }}>
              <label className="lbl" htmlFor="delete-pass">
                Current password
              </label>
              <input
                id="delete-pass"
                type="password"
                className="input"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div style={{ marginTop: 14 }}>
              <label className="lbl" htmlFor="delete-confirm">
                Type DELETE to confirm
              </label>
              <input
                id="delete-confirm"
                className="input"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                autoComplete="off"
                placeholder="DELETE"
                required
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={closeDeleteAccount} disabled={deleteBusy}>
                Cancel
              </button>
              <button className="btn btn-danger" disabled={deleteBusy || deleteConfirmation !== "DELETE"}>
                {deleteBusy ? "Deleting…" : "Permanently delete account"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

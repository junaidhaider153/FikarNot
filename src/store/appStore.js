import { useSyncExternalStore } from "react";
import { seedData } from "../data/seedData";
import { STORAGE_KEYS } from "../config/storageKeys";
import { delay, fmt, loadLS, saveLS, uid } from "../utils/helpers";
import { getCouponDiscount, isCouponUsable, normalizeCouponCode } from "../utils/coupons";
import { RETURN_STATUSES, canRequestReturn, normalizeReturnRequest } from "../utils/returns";
import { authApi } from "../api/authApi";
import { catalogApi } from "../api/catalogApi";
import { ordersApi } from "../api/ordersApi";
import { engagementApi } from "../api/engagementApi";
import { accountApi } from "../api/accountApi";
import { usersApi } from "../api/usersApi";
import { siteApi } from "../api/siteApi";

let state = {
  ready: false,
  bootError: null,
  products: [],
  categories: [],
  users: [],
  orders: [],
  reviews: [],
  cart: [],
  wishlist: [],
  recentlyViewed: [],
  comparison: [],
  notifications: [],
  supportTickets: [],
  returnRequests: [],
  session: null,
  toast: null,
  siteSettings: null,
};

const listeners = new Set();
let toastTimer = null;
let bootstrapPromise = null;

const emit = () => listeners.forEach((listener) => listener());
export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const setState = (patch) => {
  state = { ...state, ...patch };
  emit();
};

const readAccountBucket = (key, userId) => {
  const bucket = loadLS(key, {});
  return Array.isArray(bucket?.[userId]) ? bucket[userId] : [];
};

const writeAccountBucket = (key, userId, value) => {
  const bucket = loadLS(key, {});
  bucket[userId] = value;
  saveLS(key, bucket);
};

const removeAccountBucket = (key, userId) => {
  const bucket = loadLS(key, {});
  if (Object.prototype.hasOwnProperty.call(bucket, userId)) {
    delete bucket[userId];
    saveLS(key, bucket);
  }
};

const readNotifications = (userId) => {
  const bucket = loadLS(STORAGE_KEYS.customerNotifications, {});
  return Array.isArray(bucket?.[userId]) ? bucket[userId] : [];
};

const writeNotifications = (userId, notifications) => {
  const bucket = loadLS(STORAGE_KEYS.customerNotifications, {});
  bucket[userId] = notifications;
  saveLS(STORAGE_KEYS.customerNotifications, bucket);
};

const removeNotifications = (userId) => {
  const bucket = loadLS(STORAGE_KEYS.customerNotifications, {});
  if (Object.prototype.hasOwnProperty.call(bucket, userId)) {
    delete bucket[userId];
    saveLS(STORAGE_KEYS.customerNotifications, bucket);
  }
};

const makeNotification = ({ type, title, message, link = "/account", orderId = null }) => ({
  id: `n${uid()}`,
  type,
  title,
  message,
  link,
  orderId,
  read: false,
  createdAt: Date.now(),
});

const persistCustomerState = () => {
  if (!state.session?.id) return;
  accountApi.saveState({
    cart: state.cart,
    wishlist: state.wishlist,
    recentlyViewed: state.recentlyViewed,
    comparison: state.comparison,
  }).catch((error) => console.warn("[FikarNot] Customer state could not be synchronized.", error));
};



const mergeCart = (base, incoming, products) => {
  const merged = [...base.map((line) => ({ ...line }))];
  for (const line of incoming) {
    const product = products.find((item) => item.id === line.productId);
    if (!product || product.stock <= 0) continue;
    const existing = merged.find((item) => item.productId === line.productId);
    if (existing) existing.qty = Math.min(product.stock, existing.qty + Math.max(1, line.qty));
    else merged.push({ productId: line.productId, qty: Math.min(product.stock, Math.max(1, line.qty)) });
  }
  return merged.filter((line) => line.qty > 0);
};

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();

const ORDER_ID_PREFIX = "FN";
const makeFallbackSku = (productId) =>
  `FKN-${String(productId || "PROD")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()}`;


const migrateOrderData = (orders, users, emailMigrations) => {
  let sequence = 0;
  const usedIds = new Set();
  return orders.map((order) => {
    let next = { ...order, customer: { ...(order.customer || {}) } };
    const rawEmail = normalizeEmail(next.customer.email);
    const migratedEmail = emailMigrations[rawEmail];
    if (migratedEmail) {
      next.customer.email = migratedEmail;
    }
    const user =
      users.find((item) => item.id === next.customer.userId) ||
      users.find((item) => normalizeEmail(item.email) === normalizeEmail(next.customer.email)) ||
      users.find((item) => normalizeEmail(item.email) === rawEmail);
    if (user && !next.customer.userId) next.customer.userId = user.id;

    const normalizedId = String(next.id || "");
    if (!/^FN-\d{4,}$/i.test(normalizedId) || usedIds.has(normalizedId)) {
      do {
        sequence += 1;
        next.id = `${ORDER_ID_PREFIX}-${String(sequence).padStart(4, "0")}`;
      } while (usedIds.has(next.id));
    }
    usedIds.add(next.id);
    return next;
  });
};

export const useApp = () => useSyncExternalStore(subscribe, () => state);
export const getState = () => state;

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (!state.ready || !event.key) return;
    if (
      [
        STORAGE_KEYS.orders,
        STORAGE_KEYS.products,
        STORAGE_KEYS.users,
        STORAGE_KEYS.inventoryLog,
        STORAGE_KEYS.coupons,
        STORAGE_KEYS.customerNotifications,
        STORAGE_KEYS.supportTickets,
        STORAGE_KEYS.recentlyViewed,
        STORAGE_KEYS.comparison,
      ].includes(event.key)
    ) {
      const patch = {};
      if (event.key === STORAGE_KEYS.orders) patch.orders = loadLS(STORAGE_KEYS.orders, []);
      if (event.key === STORAGE_KEYS.products) patch.products = loadLS(STORAGE_KEYS.products, []);
      if (event.key === STORAGE_KEYS.inventoryLog) patch.inventoryLog = loadLS(STORAGE_KEYS.inventoryLog, []);
      if (event.key === STORAGE_KEYS.coupons) patch.coupons = loadLS(STORAGE_KEYS.coupons, []);
      if (event.key === STORAGE_KEYS.customerNotifications && state.session?.id) patch.notifications = readNotifications(state.session.id);
      if (event.key === STORAGE_KEYS.supportTickets) patch.supportTickets = loadLS(STORAGE_KEYS.supportTickets, []);
      if (event.key === STORAGE_KEYS.returnRequests) patch.returnRequests = loadLS(STORAGE_KEYS.returnRequests, []);
      if (event.key === STORAGE_KEYS.recentlyViewed)
        patch.recentlyViewed = readAccountBucket(STORAGE_KEYS.recentlyViewed, state.session?.id || "guest");
      if (event.key === STORAGE_KEYS.comparison)
        patch.comparison = loadLS(STORAGE_KEYS.comparison, [])
          .filter((id) => state.products.some((product) => product.id === id))
          .slice(0, 3);
      if (event.key === STORAGE_KEYS.users) {
        patch.users = loadLS(STORAGE_KEYS.users, []);
        if (state.session?.id) patch.session = patch.users.find((user) => user.id === state.session.id) || null;
      }
      if (Object.keys(patch).length) setState(patch);
    }
  });
}

const toast = (msg, kind = "ok") => {
  const value = { msg, kind, id: uid() };
  setState({ toast: value });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (state.toast?.id === value.id) setState({ toast: null });
  }, 2600);
};

export const cartLines = (snapshot = state) =>
  snapshot.cart
    .map((line) => ({ p: snapshot.products.find((product) => product.id === line.productId), qty: line.qty }))
    .filter((line) => line.p);

export const appActions = {
  toast,

  async bootstrap() {
    if (state.ready) return;
    if (bootstrapPromise) return bootstrapPromise;

    bootstrapPromise = (async () => {
      setState({ bootError: null });
      try {
        await delay(400);
        let data;
        if (!loadLS(STORAGE_KEYS.seeded, false)) {
          data = seedData();
          saveLS(STORAGE_KEYS.products, data.products);
          saveLS(STORAGE_KEYS.categories, data.categories);
          saveLS(STORAGE_KEYS.users, data.users);
          saveLS(STORAGE_KEYS.orders, data.orders);
          saveLS(STORAGE_KEYS.reviews, data.reviews || []);
          saveLS(STORAGE_KEYS.coupons, data.coupons || []);
          saveLS(STORAGE_KEYS.recentlyViewed, {});
          saveLS(STORAGE_KEYS.customerCarts, {});
          saveLS(STORAGE_KEYS.customerWishlists, {});
          saveLS(STORAGE_KEYS.customerNotifications, {});
          saveLS(STORAGE_KEYS.supportTickets, []);
          saveLS(STORAGE_KEYS.returnRequests, []);
          localStorage.removeItem(STORAGE_KEYS.cart);
          localStorage.removeItem(STORAGE_KEYS.wishlist);
          saveLS(STORAGE_KEYS.seeded, true);
        } else {
          const storedReviews = loadLS(STORAGE_KEYS.reviews, null);
          data = {
            products: loadLS(STORAGE_KEYS.products, []),
            categories: loadLS(STORAGE_KEYS.categories, []),
            users: loadLS(STORAGE_KEYS.users, []),
            orders: loadLS(STORAGE_KEYS.orders, []),
            reviews: Array.isArray(storedReviews) ? storedReviews : seedData().reviews,
            coupons: loadLS(STORAGE_KEYS.coupons, seedData().coupons || []),
            supportTickets: loadLS(STORAGE_KEYS.supportTickets, []),
            returnRequests: loadLS(STORAGE_KEYS.returnRequests, []),
          };
          if (!Array.isArray(storedReviews)) saveLS(STORAGE_KEYS.reviews, data.reviews);
        }

        if (!Array.isArray(data.reviews)) data.reviews = [];
        if (!Array.isArray(data.inventoryLog)) data.inventoryLog = [];
        if (!Array.isArray(data.coupons)) data.coupons = [];
        if (!Array.isArray(data.supportTickets)) data.supportTickets = [];
        if (!Array.isArray(data.returnRequests)) data.returnRequests = [];
        data.returnRequests = data.returnRequests.map(normalizeReturnRequest);
        saveLS(STORAGE_KEYS.returnRequests, data.returnRequests);
        data.coupons = data.coupons.map((coupon) => ({
          ...coupon,
          code: normalizeCouponCode(coupon.code),
          usedCount: Number(coupon.usedCount || 0),
        }));
        saveLS(STORAGE_KEYS.coupons, data.coupons);

        let productsChanged = false;
        const existingSkus = new Set();
        data.products = data.products.map((product) => {
          let next = { ...product };
          const fallbackThreshold = 10;
          if (!next.sku) {
            next.sku = makeFallbackSku(next.id);
            productsChanged = true;
          }
          if (!Number.isFinite(+next.stockThreshold) || +next.stockThreshold < 0) {
            next.stockThreshold = fallbackThreshold;
            productsChanged = true;
          }
          let sku = String(next.sku).trim().toUpperCase();
          if (existingSkus.has(sku)) {
            sku = makeFallbackSku(`${next.id}-X`);
            productsChanged = true;
          }
          next.sku = sku;
          next.stockThreshold = Math.floor(+next.stockThreshold);
          existingSkus.add(next.sku);
          return next;
        });
        if (productsChanged) saveLS(STORAGE_KEYS.products, data.products);

        // Keep demo branding/accounts consistent for fresh and existing installations.
        const emailMigrations = {
          "admin@kiosk.shop": "junaid@fikarnot.shop",
          "editor@kiosk.shop": "editor@fikarnot.shop",
          "maya@kiosk.shop": "urwa@fikarnot.shop",
        };
        let usersChanged = false;
        data.users = data.users.map((user) => {
          const migratedEmail = emailMigrations[normalizeEmail(user.email)];
          if (!migratedEmail || normalizeEmail(user.email) === migratedEmail) return user;
          usersChanged = true;
          return { ...user, email: migratedEmail };
        });
        const migratedOrders = migrateOrderData(data.orders, data.users, emailMigrations);
        const ordersChanged = JSON.stringify(migratedOrders) !== JSON.stringify(data.orders);
        data.orders = migratedOrders;
        if (usersChanged) saveLS(STORAGE_KEYS.users, data.users);
        if (ordersChanged) saveLS(STORAGE_KEYS.orders, data.orders);

        // Authentication is server-backed. Never keep passwords or role authority in browser storage.
        data.users = data.users.map(({ password: _password, ...user }) => user);
        saveLS(STORAGE_KEYS.users, data.users);
        try {
          const site = await siteApi.get();
          if (site?.settings) setState({ siteSettings: site.settings });
        } catch (siteError) {
          console.warn("[FikarNot] Site settings unavailable; using frontend defaults.", siteError);
        }

        const auth = await authApi.me();
        const session = auth.authenticated ? auth.user : null;
        if (session && !data.users.some((user) => user.id === session.id)) data.users = [...data.users, session];
        if (session) data.users = data.users.map((user) => (user.id === session.id ? { ...user, ...session } : user));
        if (session?.role === "admin") {
          try {
            const remoteUsers = await usersApi.list();
            if (Array.isArray(remoteUsers.users)) data.users = remoteUsers.users;
          } catch (userError) {
            console.warn("[FikarNot] User API unavailable; using local user cache for this session.", userError);
          }
        }
        saveLS(STORAGE_KEYS.session, null);
        saveLS(STORAGE_KEYS.users, data.users);

        // Module 27: the server is now the source of truth for catalogue + admin inventory.
        try {
          let remoteCatalog = await catalogApi.list();
          if (session && ["admin", "editor"].includes(session.role) && !remoteCatalog.migrated) {
            await catalogApi.migrate(data.categories, data.products, data.inventoryLog || []);
            remoteCatalog = await catalogApi.list();
          }
          if (Array.isArray(remoteCatalog.categories) && remoteCatalog.categories.length) data.categories = remoteCatalog.categories;
          if (Array.isArray(remoteCatalog.products) && remoteCatalog.products.length) data.products = remoteCatalog.products;
          if (Array.isArray(remoteCatalog.inventoryLog)) data.inventoryLog = remoteCatalog.inventoryLog;
          saveLS(STORAGE_KEYS.categories, data.categories);
          saveLS(STORAGE_KEYS.products, data.products);
          saveLS(STORAGE_KEYS.inventoryLog, data.inventoryLog || []);
        } catch (catalogError) {
          console.warn("[FikarNot] Catalogue API unavailable; using local cache for this session.", catalogError);
        }

        // Module 28: orders become server-authoritative. Migrate legacy browser orders once
        // from a staff session, then read order history/admin orders from SQLite.
        try {
          let remoteOrders = await ordersApi.list();
          if (session && ["admin", "editor"].includes(session.role) && !remoteOrders.migrated) {
            await ordersApi.migrate(data.orders, data.coupons || []);
            remoteOrders = await ordersApi.list();
          }
          if (remoteOrders.migrated && Array.isArray(remoteOrders.orders)) {
            data.orders = remoteOrders.orders;
            saveLS(STORAGE_KEYS.orders, data.orders);
          }
          if (Array.isArray(remoteOrders.inventoryLog)) {
            data.inventoryLog = remoteOrders.inventoryLog;
            saveLS(STORAGE_KEYS.inventoryLog, data.inventoryLog);
          }
        } catch (orderError) {
          console.warn("[FikarNot] Orders API unavailable; using local order cache for this session.", orderError);
        }

        // Public engagement data should still be available to logged-out shoppers.
        try {
          const [publicReviews, publicCoupons] = await Promise.all([engagementApi.listReviews(), engagementApi.listCoupons()]);
          if (Array.isArray(publicReviews.reviews)) data.reviews = publicReviews.reviews;
          if (Array.isArray(publicCoupons.coupons)) data.coupons = publicCoupons.coupons;
          saveLS(STORAGE_KEYS.reviews, data.reviews || []);
          saveLS(STORAGE_KEYS.coupons, data.coupons || []);
        } catch (publicEngagementError) {
          console.warn("[FikarNot] Public engagement API unavailable; using local cache for this session.", publicEngagementError);
        }

        // Module 29: engagement domains become server-backed (reviews, coupons, support, returns, notifications).
        try {
          let remoteEngagement = await engagementApi.list();
          if (session && ["admin", "editor"].includes(session.role) && !remoteEngagement.migrated) {
            const notificationsByUser = loadLS(STORAGE_KEYS.customerNotifications, {});
            await engagementApi.migrate({
              reviews: data.reviews || [],
              coupons: data.coupons || [],
              supportTickets: data.supportTickets || [],
              returnRequests: data.returnRequests || [],
              notificationsByUser,
            });
            remoteEngagement = await engagementApi.list();
          }
          if (Array.isArray(remoteEngagement.reviews)) data.reviews = remoteEngagement.reviews;
          if (Array.isArray(remoteEngagement.coupons)) data.coupons = remoteEngagement.coupons;
          if (Array.isArray(remoteEngagement.supportTickets)) data.supportTickets = remoteEngagement.supportTickets;
          if (Array.isArray(remoteEngagement.returnRequests)) data.returnRequests = remoteEngagement.returnRequests;
          if (session?.id && Array.isArray(remoteEngagement.notifications)) data.notifications = remoteEngagement.notifications;
          saveLS(STORAGE_KEYS.reviews, data.reviews || []);
          saveLS(STORAGE_KEYS.coupons, data.coupons || []);
          saveLS(STORAGE_KEYS.supportTickets, data.supportTickets || []);
          saveLS(STORAGE_KEYS.returnRequests, data.returnRequests || []);
        } catch (engagementError) {
          console.warn("[FikarNot] Engagement API unavailable; using local cache for this session.", engagementError);
        }

        let remoteAccountState = null;
        if (session?.id) {
          try {
            remoteAccountState = await accountApi.getState();
            if (Array.isArray(remoteAccountState.addresses)) {
              data.users = data.users.map((user) => user.id === session.id ? { ...user, addresses: remoteAccountState.addresses } : user);
            }
          } catch (accountError) {
            console.warn("[FikarNot] Account state API unavailable; using local account cache for this session.", accountError);
          }
        }

        const legacyCart = loadLS(STORAGE_KEYS.cart, []);
        const legacyWishlist = loadLS(STORAGE_KEYS.wishlist, []);
        let cart = [];
        let wishlist = [];
        let notifications = [];
        const recentlyViewedKey = session?.id || "guest";
        const recentlyViewed = readAccountBucket(STORAGE_KEYS.recentlyViewed, recentlyViewedKey)
          .filter((id) => data.products.some((product) => product.id === id))
          .slice(0, 8);
        if (session?.id) {
          const savedCart = readAccountBucket(STORAGE_KEYS.customerCarts, session.id);
          const savedWishlist = readAccountBucket(STORAGE_KEYS.customerWishlists, session.id);
          notifications = readNotifications(session.id);
          const remoteCart = Array.isArray(remoteAccountState?.cart) ? remoteAccountState.cart : null;
          const remoteWishlist = Array.isArray(remoteAccountState?.wishlist) ? remoteAccountState.wishlist : null;
          const remoteRecent = Array.isArray(remoteAccountState?.recentlyViewed) ? remoteAccountState.recentlyViewed : null;
          const remoteComparison = Array.isArray(remoteAccountState?.comparison) ? remoteAccountState.comparison : null;
          cart = remoteCart ? mergeCart([], remoteCart, data.products) : (savedCart.length ? savedCart : mergeCart([], legacyCart, data.products));
          wishlist = remoteWishlist
            ? remoteWishlist.filter((id) => data.products.some((product) => product.id === id))
            : (savedWishlist.length ? savedWishlist : legacyWishlist.filter((id) => data.products.some((product) => product.id === id)));
          if (cart.length && !savedCart.length) writeAccountBucket(STORAGE_KEYS.customerCarts, session.id, cart);
          if (wishlist.length && !savedWishlist.length) writeAccountBucket(STORAGE_KEYS.customerWishlists, session.id, wishlist);
          if (remoteRecent) {
            const validRecent = remoteRecent.filter((id) => data.products.some((product) => product.id === id)).slice(0, 8);
            writeAccountBucket(STORAGE_KEYS.recentlyViewed, session.id, validRecent);
          }
          if (remoteComparison) saveLS(STORAGE_KEYS.comparison, remoteComparison.filter((id) => data.products.some((product) => product.id === id)).slice(0, 3));
        }
        localStorage.removeItem(STORAGE_KEYS.cart);
        localStorage.removeItem(STORAGE_KEYS.wishlist);
        writeAccountBucket(STORAGE_KEYS.recentlyViewed, recentlyViewedKey, recentlyViewed);
        saveLS(STORAGE_KEYS.inventoryLog, data.inventoryLog);
        const comparison = loadLS(STORAGE_KEYS.comparison, [])
          .filter((id) => data.products.some((product) => product.id === id))
          .slice(0, 3);
        saveLS(STORAGE_KEYS.comparison, comparison);
        setState({ ...data, cart, wishlist, recentlyViewed, comparison, notifications, session, ready: true });
      } catch (error) {
        setState({ bootError: error?.message || "Failed to load store data" });
      } finally {
        bootstrapPromise = null;
      }
    })();

    return bootstrapPromise;
  },

  submitSupportTicket({ name, email, subject, message, category = "general" }) {
    const cleanName = String(name || "").trim();
    const cleanEmail = normalizeEmail(email);
    const cleanSubject = String(subject || "").trim();
    const cleanMessage = String(message || "").trim();
    if (!cleanName || !cleanEmail || !cleanSubject || !cleanMessage) {
      toast("Please complete all support fields", "err");
      return null;
    }
    const nextTicketNumber =
      (state.supportTickets || []).reduce((max, ticket) => {
        const match = String(ticket.id || "").match(/^TKT-(\d+)$/i);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0) + 1;
    const ticket = {
      id: `TKT-${String(nextTicketNumber).padStart(4, "0")}`,
      userId: state.session?.id || null,
      name: cleanName,
      email: cleanEmail,
      subject: cleanSubject,
      message: cleanMessage,
      category: category || "general",
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const tickets = [ticket, ...(state.supportTickets || [])];
    setState({ supportTickets: tickets });
    saveLS(STORAGE_KEYS.supportTickets, tickets);
    engagementApi.createSupport({ ...ticket }).then(({ ticket: remoteTicket }) => {
      const nextTickets = [remoteTicket, ...state.supportTickets.filter((item) => item.id !== ticket.id && item.id !== remoteTicket.id)];
      setState({ supportTickets: nextTickets });
      saveLS(STORAGE_KEYS.supportTickets, nextTickets);
    }).catch((error) => toast(error.message || "Support request could not be saved to the server", "err"));

    toast("Support request sent");
    return ticket;
  },

  setSupportTicketStatus(id, status) {
    const allowed = ["open", "in_progress", "resolved"];
    if (!allowed.includes(status)) return false;
    const existing = (state.supportTickets || []).find((ticket) => ticket.id === id);
    if (!existing) return false;
    const tickets = (state.supportTickets || []).map((ticket) =>
      ticket.id === id ? { ...ticket, status, updatedAt: Date.now() } : ticket,
    );
    setState({ supportTickets: tickets });
    saveLS(STORAGE_KEYS.supportTickets, tickets);
    engagementApi.setSupportStatus(id, status).then(({ ticket: remoteTicket }) => {
      const nextTickets = state.supportTickets.map((item) => item.id === id ? remoteTicket : item);
      setState({ supportTickets: nextTickets });
      saveLS(STORAGE_KEYS.supportTickets, nextTickets);
    }).catch((error) => toast(error.message || "Support status could not be saved to the server", "err"));

    toast("Support status updated");
    return true;
  },

  deleteSupportTicket(id) {
    const tickets = (state.supportTickets || []).filter((ticket) => ticket.id !== id);
    setState({ supportTickets: tickets });
    saveLS(STORAGE_KEYS.supportTickets, tickets);
    engagementApi.deleteSupport(id).catch((error) => toast(error.message || "Support request could not be deleted from the server", "err"));
    toast("Support request deleted");
  },

  resetDemo() {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    window.location.href = "/";
  },

  async login(email, password, totp = "") {
    try {
      const { user } = await authApi.login(email, password, totp);
      const localUser = { ...(state.users.find((item) => item.id === user.id) || {}), ...user };
      const users = state.users.some((item) => item.id === user.id)
        ? state.users.map((item) => (item.id === user.id ? localUser : item))
        : [...state.users, localUser];
      const guestCart = state.session ? [] : state.cart;
      const accountCart = readAccountBucket(STORAGE_KEYS.customerCarts, user.id);
      const accountWishlist = readAccountBucket(STORAGE_KEYS.customerWishlists, user.id).filter((id) =>
        state.products.some((product) => product.id === id),
      );
      const accountNotifications = readNotifications(user.id);
      let remoteState = null;
      try { remoteState = await accountApi.getState(); } catch {
        // Remote account sync is best-effort during sign-in.
      }
      const accountRecentlyViewed = (Array.isArray(remoteState?.recentlyViewed) ? remoteState.recentlyViewed : readAccountBucket(STORAGE_KEYS.recentlyViewed, user.id)).filter((id) =>
        state.products.some((product) => product.id === id),
      ).slice(0, 8);
      const remoteCart = Array.isArray(remoteState?.cart) ? remoteState.cart : accountCart;
      const remoteWishlist = Array.isArray(remoteState?.wishlist) ? remoteState.wishlist.filter((id) => state.products.some((product) => product.id === id)) : accountWishlist;
      const remoteAddresses = Array.isArray(remoteState?.addresses) ? remoteState.addresses : (state.users.find((item) => item.id === user.id)?.addresses || []);
      const cart = mergeCart(remoteCart, guestCart, state.products);
      const comparison = Array.isArray(remoteState?.comparison) ? remoteState.comparison.filter((id) => state.products.some((product) => product.id === id)).slice(0, 3) : state.comparison;
      const usersWithState = users.map((item) => item.id === user.id ? { ...item, addresses: remoteAddresses } : item);
      setState({
        users: usersWithState,
        session: { ...localUser, addresses: remoteAddresses },
        cart,
        wishlist: remoteWishlist,
        notifications: accountNotifications,
        recentlyViewed: accountRecentlyViewed,
        comparison,
      });
      writeAccountBucket(STORAGE_KEYS.customerCarts, user.id, cart);
      writeAccountBucket(STORAGE_KEYS.customerWishlists, user.id, accountWishlist);
      toast(`Welcome back, ${user.name.split(" ")[0]}`);
      return localUser;
    } catch (error) {
      toast(error.message || "Invalid email or password", "err");
      if (error?.code === "EMAIL_NOT_VERIFIED") throw error;
      return null;
    }
  },
  async register(name, email, password) {
    try {
      const result = await authApi.register(name, email, password);
      if (result.requiresVerification) {
        toast("Account created — please verify your email before signing in");
        return result;
      }
      const { user } = result;
      const users = state.users.some((item) => item.id === user.id)
        ? state.users.map((item) => (item.id === user.id ? user : item))
        : [...state.users, user];
      const guestCart = state.session ? [] : state.cart;
      const cart = mergeCart([], guestCart, state.products);
      setState({ users, session: user, cart, wishlist: [], recentlyViewed: [] });
      writeAccountBucket(STORAGE_KEYS.customerCarts, user.id, cart);
      writeAccountBucket(STORAGE_KEYS.customerWishlists, user.id, []);
      const welcome = makeNotification({
        type: "account",
        title: "Welcome to FikarNot",
        message: "Your account is ready. Start building your wishlist and shopping bag.",
        link: "/products",
      });
      writeNotifications(user.id, [welcome]);
      setState({ notifications: [welcome] });
      toast(`Account created — welcome, ${user.name.split(" ")[0]}`);
      return user;
    } catch (error) {
      toast(error.message || "Unable to create account", "err");
      return null;
    }
  },
  async logout() {
    try {
      await authApi.logout();
    } catch {
      /* local cleanup still applies */
    }
    if (state.session?.id) {
      writeAccountBucket(STORAGE_KEYS.customerCarts, state.session.id, state.cart);
      writeAccountBucket(STORAGE_KEYS.customerWishlists, state.session.id, state.wishlist);
      writeAccountBucket(STORAGE_KEYS.recentlyViewed, state.session.id, state.recentlyViewed);
      writeNotifications(state.session.id, state.notifications);
      await accountApi.saveState({ cart: state.cart, wishlist: state.wishlist, recentlyViewed: state.recentlyViewed, comparison: state.comparison }).catch(() => {
        // Notification refresh failure should not interrupt the current action.
      });
    }
    setState({ session: null, cart: [], wishlist: [], recentlyViewed: [], notifications: [] });
    saveLS(STORAGE_KEYS.session, null);
    localStorage.removeItem(STORAGE_KEYS.cart);
    localStorage.removeItem(STORAGE_KEYS.wishlist);
    toast("Signed out — your account data is safely saved");
  },
  async updateProfile(updates) {
    if (!state.session) return false;
    const name = (updates.name ?? state.session.name).trim();
    const email = (updates.email ?? state.session.email).trim();
    if (name.length < 2) {
      toast("Name must be at least 2 characters", "err");
      return false;
    }
    if (!email || !email.includes("@")) {
      toast("Enter a valid email address", "err");
      return false;
    }
    try {
      const { user } = await authApi.updateProfile(name, email);
      const users = state.users.map((item) => (item.id === state.session.id ? { ...item, ...user } : item));
      const orders = state.orders.map((order) => {
        const belongsToUser =
          order.customer?.userId === state.session.id ||
          (!order.customer?.userId && normalizeEmail(order.customer?.email) === normalizeEmail(state.session.email));
        return belongsToUser
          ? { ...order, customer: { ...order.customer, userId: state.session.id, name: user.name, email: user.email } }
          : order;
      });
      const session = users.find((item) => item.id === state.session.id) || user;
      setState({ users, orders, session });
      saveLS(STORAGE_KEYS.users, users);
      saveLS(STORAGE_KEYS.orders, orders);
      toast("Profile updated");
      return true;
    } catch (error) {
      toast(error.message || "Unable to update profile", "err");
      return false;
    }
  },
  submitReview({ productId, rating, title, body }) {
    if (!state.session) {
      toast("Please sign in to leave a review", "err");
      return false;
    }
    const product = state.products.find((item) => item.id === productId);
    if (!product) {
      toast("Product not found", "err");
      return false;
    }
    const userId = state.session.id;
    const hasPurchased = state.orders.some((order) => {
      const belongsToUser =
        order.customer?.userId === state.session.id ||
        (!order.customer?.userId && normalizeEmail(order.customer?.email) === normalizeEmail(state.session.email));
      return belongsToUser && order.items?.some((item) => item.productId === productId);
    });
    if (!hasPurchased) {
      toast("Only customers who purchased this product can review it", "err");
      return false;
    }
    const cleanRating = Math.round(Number(rating));
    const cleanTitle = String(title || "").trim();
    const cleanBody = String(body || "").trim();
    if (cleanRating < 1 || cleanRating > 5) {
      toast("Choose a rating from 1 to 5", "err");
      return false;
    }
    if (cleanTitle.length < 3) {
      toast("Add a short review title", "err");
      return false;
    }
    if (cleanBody.length < 10) {
      toast("Your review should be at least 10 characters", "err");
      return false;
    }
    const existing = state.reviews.find((review) => review.productId === productId && review.userId === userId);
    let reviews;
    if (existing) {
      reviews = state.reviews.map((review) =>
        review.id === existing.id
          ? { ...review, rating: cleanRating, title: cleanTitle, body: cleanBody, status: "published", createdAt: Date.now() }
          : review,
      );
      toast("Review updated");
    } else {
      const review = {
        id: `r${uid()}`,
        productId,
        userId,
        authorName: state.session.name,
        rating: cleanRating,
        title: cleanTitle,
        body: cleanBody,
        status: "published",
        verifiedPurchase: true,
        createdAt: Date.now(),
      };
      reviews = [review, ...state.reviews];
      toast("Thanks for sharing your review");
    }
    const productReviews = reviews.filter((review) => review.productId === productId && review.status === "published");
    const ratingAverage = +(productReviews.reduce((sum, review) => sum + review.rating, 0) / productReviews.length).toFixed(1);
    const products = state.products.map((item) => (item.id === productId ? { ...item, rating: ratingAverage } : item));
    setState({ reviews, products });
    saveLS(STORAGE_KEYS.reviews, reviews);
    saveLS(STORAGE_KEYS.products, products);
    engagementApi.saveReview({ productId, rating: cleanRating, title: cleanTitle, body: cleanBody }).then(({ review: remoteReview, product: remoteProduct }) => {
      const nextReviews = [remoteReview, ...state.reviews.filter((item) => item.id !== remoteReview.id && !(item.productId === productId && item.userId === state.session?.id))];
      const nextProducts = state.products.map((item) => item.id === remoteProduct.id ? remoteProduct : item);
      setState({ reviews: nextReviews, products: nextProducts });
      saveLS(STORAGE_KEYS.reviews, nextReviews);
      saveLS(STORAGE_KEYS.products, nextProducts);
    }).catch((error) => toast(error.message || "Review could not be saved to the server", "err"));
    return true;
  },

  setReviewStatus(reviewId, status) {
    if (!state.session || !["admin", "editor"].includes(state.session.role)) {
      toast("Staff permission required", "err");
      return false;
    }
    if (!["published", "hidden"].includes(status)) return false;
    const review = state.reviews.find((item) => item.id === reviewId);
    if (!review) return false;
    const reviews = state.reviews.map((item) => (item.id === reviewId ? { ...item, status } : item));
    const product = state.products.find((item) => item.id === review.productId);
    const productReviews = reviews.filter((item) => item.productId === review.productId && item.status === "published");
    const ratingAverage = productReviews.length
      ? +(productReviews.reduce((sum, item) => sum + item.rating, 0) / productReviews.length).toFixed(1)
      : 0;
    const products = product
      ? state.products.map((item) => (item.id === product.id ? { ...item, rating: ratingAverage } : item))
      : state.products;
    setState({ reviews, products });
    saveLS(STORAGE_KEYS.reviews, reviews);
    saveLS(STORAGE_KEYS.products, products);
    engagementApi.setReviewStatus(reviewId, status).then(({ review: remoteReview, product: remoteProduct }) => {
      const nextReviews = state.reviews.map((item) => (item.id === remoteReview.id ? remoteReview : item));
      const nextProducts = remoteProduct ? state.products.map((item) => (item.id === remoteProduct.id ? remoteProduct : item)) : state.products;
      setState({ reviews: nextReviews, products: nextProducts });
      saveLS(STORAGE_KEYS.reviews, nextReviews);
      saveLS(STORAGE_KEYS.products, nextProducts);
    }).catch((error) => toast(error.message || "Review status could not be updated on the server", "err"));
    toast(status === "hidden" ? "Review hidden" : "Review restored");
    return true;
  },

  deleteReview(reviewId) {
    if (!state.session) return false;
    const review = state.reviews.find((item) => item.id === reviewId);
    if (!review) return false;
    if (review.userId !== state.session.id && !["admin", "editor"].includes(state.session.role)) {
      toast("You can't remove this review", "err");
      return false;
    }
    const reviews = state.reviews.filter((item) => item.id !== reviewId);
    const productReviews = reviews.filter((item) => item.productId === review.productId && item.status === "published");
    const product = state.products.find((item) => item.id === review.productId);
    const ratingAverage = productReviews.length
      ? +(productReviews.reduce((sum, item) => sum + item.rating, 0) / productReviews.length).toFixed(1)
      : product?.rating || 0;
    const products = product
      ? state.products.map((item) => (item.id === product.id ? { ...item, rating: ratingAverage } : item))
      : state.products;
    setState({ reviews, products });
    saveLS(STORAGE_KEYS.reviews, reviews);
    saveLS(STORAGE_KEYS.products, products);
    engagementApi.deleteReview(reviewId).then(({ product: remoteProduct }) => {
      if (remoteProduct) {
        const nextProducts = state.products.map((item) => item.id === remoteProduct.id ? remoteProduct : item);
        setState({ products: nextProducts });
        saveLS(STORAGE_KEYS.products, nextProducts);
      }
    }).catch((error) => toast(error.message || "Review could not be removed from the server", "err"));
    toast("Review removed");
    return true;
  },

  async deleteAccount(currentPassword, confirmationText) {
    if (!state.session) return false;
    try {
      await authApi.deleteAccount(currentPassword, confirmationText);
    } catch (error) {
      toast(error.message || "Unable to delete account", "err");
      return false;
    }
    const accountId = state.session.id;
    const deletedAt = Date.now();
    const users = state.users.filter((user) => user.id !== accountId);
    const reviews = state.reviews.map((review) =>
      review.userId === accountId ? { ...review, userId: `deleted-${deletedAt}`, authorName: "Deleted Customer" } : review,
    );
    const orders = state.orders.map((order) => {
      const belongsToUser =
        order.customer?.userId === accountId ||
        (!order.customer?.userId && normalizeEmail(order.customer?.email) === normalizeEmail(state.session.email));
      return belongsToUser
        ? {
            ...order,
            customer: { ...order.customer, userId: undefined, name: "Deleted Customer", email: `deleted-${deletedAt}@fikarnot.local` },
          }
        : order;
    });
    const returnRequests = (state.returnRequests || []).filter((request) => request.userId !== accountId);
    setState({ users, orders, reviews, returnRequests, cart: [], wishlist: [], session: null });
    saveLS(STORAGE_KEYS.users, users);
    saveLS(STORAGE_KEYS.orders, orders);
    saveLS(STORAGE_KEYS.reviews, reviews);
    saveLS(STORAGE_KEYS.returnRequests, returnRequests);
    removeAccountBucket(STORAGE_KEYS.customerCarts, accountId);
    removeAccountBucket(STORAGE_KEYS.customerWishlists, accountId);
    removeAccountBucket(STORAGE_KEYS.recentlyViewed, accountId);
    removeNotifications(accountId);
    localStorage.removeItem(STORAGE_KEYS.cart);
    localStorage.removeItem(STORAGE_KEYS.wishlist);
    saveLS(STORAGE_KEYS.session, null);
    toast("Your account has been deleted");
    return true;
  },
  async changePassword(currentPassword, newPassword) {
    if (!state.session) return false;
    if (newPassword.length < 8) {
      toast("New password must be at least 12 characters", "err");
      return false;
    }
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast("Password updated");
      return true;
    } catch (error) {
      toast(error.message || "Unable to update password", "err");
      return false;
    }
  },
  async saveAddress(address) {
    if (!state.session) return false;
    const user = state.users.find((item) => item.id === state.session.id) || state.session;
    const clean = {
      id: address.id || `a${uid()}`,
      label: (address.label || "Home").trim(),
      name: (address.name || user.name).trim(),
      line1: (address.line1 || "").trim(),
      city: (address.city || "").trim(),
      region: (address.region || "").trim(),
      postalCode: (address.postalCode || "").trim(),
      country: (address.country || "").trim(),
      isDefault: Boolean(address.isDefault),
    };
    if (!clean.name || !clean.line1 || !clean.city || !clean.country) {
      toast("Please complete the required address fields", "err");
      return false;
    }
    try {
      const { addresses } = await accountApi.saveAddress(clean);
      const users = state.users.map((item) => item.id === state.session.id ? { ...item, addresses } : item);
      const session = users.find((item) => item.id === state.session.id) || state.session;
      setState({ users, session });
      saveLS(STORAGE_KEYS.users, users);
      toast(address.id ? "Address updated" : "Address saved");
      return true;
    } catch (error) {
      toast(error.message || "Unable to save address", "err");
      return false;
    }
  },

  async deleteAddress(addressId) {
    if (!state.session) return false;
    try {
      const { addresses } = await accountApi.deleteAddress(addressId);
      const users = state.users.map((user) => user.id === state.session.id ? { ...user, addresses } : user);
      const session = users.find((user) => user.id === state.session.id) || state.session;
      setState({ users, session });
      saveLS(STORAGE_KEYS.users, users);
      toast("Address removed");
      return true;
    } catch (error) {
      toast(error.message || "Unable to remove address", "err");
      return false;
    }
  },

  addToCart(productId, qty = 1) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return;

    const existing = state.cart.find((line) => line.productId === productId);
    const nextQty = Math.min((existing?.qty ?? 0) + Math.max(1, qty), product.stock);
    if (nextQty <= 0) {
      toast("Out of stock", "err");
      return;
    }

    const cart = existing
      ? state.cart.map((line) => (line.productId === productId ? { ...line, qty: nextQty } : line))
      : [...state.cart, { productId, qty: nextQty }];

    setState({ cart });
    if (state.session?.id) { writeAccountBucket(STORAGE_KEYS.customerCarts, state.session.id, cart); persistCustomerState(); }
    toast(`${product.name} added to cart`);
  },

  setCartQty(productId, qty) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return;

    const cart =
      qty <= 0
        ? state.cart.filter((line) => line.productId !== productId)
        : state.cart.map((line) => (line.productId === productId ? { ...line, qty: Math.min(qty, product.stock) } : line));

    setState({ cart });
    if (state.session?.id) { writeAccountBucket(STORAGE_KEYS.customerCarts, state.session.id, cart); persistCustomerState(); }
  },

  removeFromCart(productId) {
    appActions.setCartQty(productId, 0);
    toast("Removed from cart");
  },

  rememberRecentlyViewed(productId) {
    if (!state.products.some((product) => product.id === productId)) return;
    const recentlyViewed = [productId, ...state.recentlyViewed.filter((id) => id !== productId)].slice(0, 8);
    setState({ recentlyViewed });
    writeAccountBucket(STORAGE_KEYS.recentlyViewed, state.session?.id || "guest", recentlyViewed);
    persistCustomerState();
  },

  clearRecentlyViewed() {
    setState({ recentlyViewed: [] });
    writeAccountBucket(STORAGE_KEYS.recentlyViewed, state.session?.id || "guest", []);
    persistCustomerState();
    toast("Recently viewed history cleared");
  },

  toggleComparison(productId) {
    const exists = state.comparison.includes(productId);
    let comparison;
    if (exists) {
      comparison = state.comparison.filter((id) => id !== productId);
    } else {
      if (state.comparison.length >= 3) {
        toast("You can compare up to 3 products at a time", "err");
        return false;
      }
      if (!state.products.some((product) => product.id === productId)) return false;
      comparison = [...state.comparison, productId];
    }
    setState({ comparison });
    saveLS(STORAGE_KEYS.comparison, comparison);
    persistCustomerState();
    toast(exists ? "Removed from comparison" : "Added to comparison");
    return true;
  },

  clearComparison() {
    setState({ comparison: [] });
    saveLS(STORAGE_KEYS.comparison, []);
    persistCustomerState();
    toast("Comparison cleared");
  },

  toggleWishlist(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return false;
    if (!state.session?.id) {
      toast("Sign in to save products to your wishlist", "err");
      return false;
    }
    const exists = state.wishlist.includes(productId);
    const wishlist = exists ? state.wishlist.filter((id) => id !== productId) : [productId, ...state.wishlist];
    setState({ wishlist });
    writeAccountBucket(STORAGE_KEYS.customerWishlists, state.session.id, wishlist);
    persistCustomerState();
    toast(exists ? `${product.name} removed from wishlist` : `${product.name} added to wishlist`);
    return !exists;
  },

  markNotificationRead(notificationId) {
    if (!state.session?.id) return;
    const notifications = state.notifications.map((item) => (item.id === notificationId ? { ...item, read: true } : item));
    setState({ notifications });
    writeNotifications(state.session.id, notifications);
    engagementApi.markNotificationRead(notificationId).catch(() => {});
  },

  markAllNotificationsRead() {
    if (!state.session?.id || !state.notifications.length) return;
    const notifications = state.notifications.map((item) => ({ ...item, read: true }));
    setState({ notifications });
    writeNotifications(state.session.id, notifications);
    engagementApi.markAllNotificationsRead().catch(() => {});
    toast("All notifications marked as read");
  },

  clearNotifications() {
    if (!state.session?.id) return;
    setState({ notifications: [] });
    writeNotifications(state.session.id, []);
    engagementApi.clearNotifications().catch(() => {});
    toast("Notifications cleared");
  },

  clearWishlist() {
    if (!state.session?.id || !state.wishlist.length) return;
    setState({ wishlist: [] });
    writeAccountBucket(STORAGE_KEYS.customerWishlists, state.session.id, []);
    persistCustomerState();
    toast("Wishlist cleared");
  },

  async upsertProduct(product) {
    const sku = String(product.sku || makeFallbackSku(product.id))
      .trim()
      .toUpperCase();
    const duplicate = state.products.find((item) => item.id !== product.id && String(item.sku || "").toLowerCase() === sku.toLowerCase());
    if (duplicate) {
      toast(`SKU ${sku} is already used by ${duplicate.name}`, "err");
      return false;
    }
    const normalized = { ...product, sku, stockThreshold: Math.max(0, Math.floor(+product.stockThreshold || 0)) };
    try {
      const { product: saved } = await catalogApi.saveProduct(normalized);
      const list = [...state.products];
      const index = list.findIndex((item) => item.id === saved.id);
      if (index >= 0) list[index] = { ...list[index], ...saved };
      else list.unshift(saved);
      setState({ products: list });
      saveLS(STORAGE_KEYS.products, list);
      toast(index >= 0 ? "Product updated" : "Product created");
      return true;
    } catch (error) {
      toast(error.message || "Unable to save product", "err");
      return false;
    }
  },

  async adjustStock(productId, nextStock, reason = "Manual stock adjustment") {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return false;
    const value = Math.max(0, Math.floor(Number(nextStock)));
    if (!Number.isFinite(value)) {
      toast("Enter a valid stock value", "err");
      return false;
    }
    if (value === product.stock) return true;
    try {
      const { product: saved, log } = await catalogApi.adjustInventory(productId, value, reason);
      const products = state.products.map((item) => (item.id === productId ? { ...item, ...saved } : item));
      const inventoryLog = [log, ...(state.inventoryLog || [])].slice(0, 100);
      setState({ products, inventoryLog });
      saveLS(STORAGE_KEYS.products, products);
      saveLS(STORAGE_KEYS.inventoryLog, inventoryLog);
      toast(`${product.name} stock updated to ${value}`);
      return true;
    } catch (error) {
      toast(error.message || "Unable to update stock", "err");
      return false;
    }
  },

  async deleteProduct(id) {
    try {
      await catalogApi.deleteProduct(id);
    } catch (error) {
      toast(error.message || "Unable to delete product", "err");
      return false;
    }
    const products = state.products.filter((product) => product.id !== id);
    const cart = state.cart.filter((line) => line.productId !== id);
    const wishlist = state.wishlist.filter((productId) => productId !== id);
    const recentlyViewed = state.recentlyViewed.filter((productId) => productId !== id);
    const comparison = state.comparison.filter((productId) => productId !== id);
    setState({ products, cart, wishlist, recentlyViewed, comparison });
    saveLS(STORAGE_KEYS.products, products);
    writeAccountBucket(STORAGE_KEYS.recentlyViewed, state.session?.id || "guest", recentlyViewed);
    saveLS(STORAGE_KEYS.comparison, comparison);
    if (state.session?.id) {
      writeAccountBucket(STORAGE_KEYS.customerCarts, state.session.id, cart);
      writeAccountBucket(STORAGE_KEYS.customerWishlists, state.session.id, wishlist);
    }
    toast("Product deleted");
    return true;
  },

  toggleFeatured(id) {
    const product = state.products.find((item) => item.id === id);
    if (!product) return false;
    return appActions.upsertProduct({ ...product, featured: !product.featured });
  },

  async upsertCategory(category) {
    try {
      const { category: saved } = await catalogApi.saveCategory(category);
      const list = [...state.categories];
      const index = list.findIndex((item) => item.id === saved.id);
      if (index >= 0) list[index] = { ...list[index], ...saved };
      else list.push(saved);
      setState({ categories: list });
      saveLS(STORAGE_KEYS.categories, list);
      toast(index >= 0 ? "Category updated" : "Category created");
      return true;
    } catch (error) {
      toast(error.message || "Unable to save category", "err");
      return false;
    }
  },

  async deleteCategory(id) {
    if (state.products.some((product) => product.categoryId === id)) {
      toast("Reassign or delete its products first", "err");
      return false;
    }
    try {
      await catalogApi.deleteCategory(id);
    } catch (error) {
      toast(error.message || "Unable to delete category", "err");
      return false;
    }
    const categories = state.categories.filter((category) => category.id !== id);
    setState({ categories });
    saveLS(STORAGE_KEYS.categories, categories);
    toast("Category deleted");
    return true;
  },

  async upsertUser(user) {
    const duplicate = state.users.find((item) => item.email.toLowerCase() === user.email.toLowerCase() && item.id !== user.id);
    if (duplicate) {
      toast("Email already in use", "err");
      return false;
    }
    const existed = state.users.some((item) => item.id === user.id);
    try {
      const { user: saved } = await usersApi.save({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        ...(user.password ? { password: user.password } : {}),
      });
      const list = existed
        ? state.users.map((item) => (item.id === saved.id ? { ...item, ...saved } : item))
        : [saved, ...state.users];
      const session = state.session?.id === saved.id ? { ...state.session, ...saved } : state.session;
      setState({ users: list, session });
      saveLS(STORAGE_KEYS.users, list);
      toast(existed ? "User updated" : "User created");
      return true;
    } catch (error) {
      toast(error.message || "Unable to save user", "err");
      return false;
    }
  },

  async refreshUsers() {
    try {
      const { users } = await usersApi.list();
      if (Array.isArray(users)) {
        setState({ users });
        saveLS(STORAGE_KEYS.users, users);
      }
      toast("User list refreshed");
      return true;
    } catch (error) {
      toast(error.message || "Could not refresh users", "err");
      return false;
    }
  },

  async deleteUser(id) {
    if (state.session?.id === id) {
      toast("You can't delete yourself", "err");
      return false;
    }
    try {
      await usersApi.remove(id);
      const users = state.users.filter((user) => user.id !== id);
      setState({ users });
      saveLS(STORAGE_KEYS.users, users);
      toast("User deleted");
      return true;
    } catch (error) {
      if (error.code === "USER_NOT_FOUND") {
        // The list we're showing no longer matches the server (stale cache,
        // or someone else already removed this user). Re-sync from the
        // server instead of just failing again on the next click.
        try {
          const { users } = await usersApi.list();
          if (Array.isArray(users)) {
            setState({ users });
            saveLS(STORAGE_KEYS.users, users);
          }
        } catch {
          // ignore — we'll still show the toast below
        }
        toast("That user no longer exists — the list has been refreshed.", "err");
      } else {
        toast(error.message || "Unable to delete user", "err");
      }
      return false;
    }
  },

  async setRole(id, role) {
    if (state.session?.id === id) {
      toast("You can't change your own role", "err");
      return false;
    }
    try {
      const { user: saved } = await usersApi.setRole(id, role);
      const users = state.users.map((user) => user.id === id ? { ...user, ...saved } : user);
      setState({ users });
      saveLS(STORAGE_KEYS.users, users);
      toast("Role updated");
      return true;
    } catch (error) {
      if (error.code === "USER_NOT_FOUND") {
        try {
          const { users } = await usersApi.list();
          if (Array.isArray(users)) {
            setState({ users });
            saveLS(STORAGE_KEYS.users, users);
          }
        } catch {
          // ignore — we'll still show the toast below
        }
        toast("That user no longer exists — the list has been refreshed.", "err");
      } else {
        toast(error.message || "Unable to update role", "err");
      }
      return false;
    }
  },

  validateCoupon(code, subtotal, shipping = 0) {
    const normalized = normalizeCouponCode(code);
    if (!normalized) return { coupon: null, discount: 0, shippingFree: false, error: "Enter a coupon code" };
    const coupon = state.coupons.find((item) => normalizeCouponCode(item.code) === normalized);
    if (!coupon) return { coupon: null, discount: 0, shippingFree: false, error: "That coupon code is not valid" };
    if (!isCouponUsable(coupon))
      return { coupon: null, discount: 0, shippingFree: false, error: "That coupon is expired, inactive, or has reached its usage limit" };
    if (subtotal < Number(coupon.minSubtotal || 0))
      return {
        coupon: null,
        discount: 0,
        shippingFree: false,
        error: `Spend at least ${fmt(Number(coupon.minSubtotal || 0))} to use ${normalized}`,
      };
    const result = getCouponDiscount(coupon, subtotal, shipping);
    return { coupon, ...result, error: "" };
  },

  upsertCoupon(coupon) {
    const code = normalizeCouponCode(coupon.code);
    if (!code) {
      toast("Coupon code is required", "err");
      return false;
    }
    const duplicate = state.coupons.find((item) => item.id !== coupon.id && normalizeCouponCode(item.code) === code);
    if (duplicate) {
      toast("That coupon code is already in use", "err");
      return false;
    }
    const normalized = {
      id: coupon.id || `cp${uid()}`,
      code,
      type: coupon.type || "percent",
      value: Math.max(0, Number(coupon.value || 0)),
      minSubtotal: Math.max(0, Number(coupon.minSubtotal || 0)),
      maxUses: Math.max(0, Math.floor(Number(coupon.maxUses || 0))),
      usedCount: Math.max(0, Math.floor(Number(coupon.usedCount || 0))),
      active: coupon.active !== false,
      expiresAt: coupon.expiresAt ? Number(coupon.expiresAt) : null,
      description: String(coupon.description || "").trim(),
    };
    if (normalized.type === "percent" && normalized.value > 100) {
      toast("Percentage cannot exceed 100%", "err");
      return false;
    }
    const coupons = [...state.coupons];
    const index = coupons.findIndex((item) => item.id === normalized.id);
    if (index >= 0) coupons[index] = { ...coupons[index], ...normalized };
    else coupons.unshift(normalized);
    setState({ coupons });
    saveLS(STORAGE_KEYS.coupons, coupons);
    engagementApi.saveCoupon(normalized).then(({ coupon: remoteCoupon }) => {
      const nextCoupons = state.coupons.map((item) => item.id === remoteCoupon.id ? remoteCoupon : item);
      setState({ coupons: nextCoupons });
      saveLS(STORAGE_KEYS.coupons, nextCoupons);
    }).catch((error) => toast(error.message || "Coupon could not be saved to the server", "err"));
    toast(index >= 0 ? "Coupon updated" : "Coupon created");
    return true;
  },

  deleteCoupon(id) {
    const coupons = state.coupons.filter((coupon) => coupon.id !== id);
    setState({ coupons });
    saveLS(STORAGE_KEYS.coupons, coupons);
    engagementApi.deleteCoupon(id).catch((error) => toast(error.message || "Coupon could not be deleted from the server", "err"));
    toast("Coupon deleted");
  },

  toggleCoupon(id) {
    const coupons = state.coupons.map((coupon) => (coupon.id === id ? { ...coupon, active: !coupon.active } : coupon));
    setState({ coupons });
    saveLS(STORAGE_KEYS.coupons, coupons);
    engagementApi.toggleCoupon(id).then(({ coupon: remoteCoupon }) => {
      const nextCoupons = state.coupons.map((item) => item.id === remoteCoupon.id ? remoteCoupon : item);
      setState({ coupons: nextCoupons });
      saveLS(STORAGE_KEYS.coupons, nextCoupons);
    }).catch((error) => toast(error.message || "Coupon status could not be saved to the server", "err"));
    toast("Coupon status updated");
  },

  async placeOrder(customer, couponCode = "") {
    const items = cartLines()
      .map(({ p, qty }) => ({ productId: p.id, name: p.name, price: p.price, qty: Math.min(qty, p.stock) }))
      .filter((item) => item.qty > 0);
    if (!items.length) {
      toast("Your cart is empty or the selected products are out of stock", "err");
      return null;
    }
    try {
      const response = await ordersApi.create({
        customer: { ...customer, ...(state.session?.id ? { userId: state.session.id } : {}) },
        items,
        couponCode: couponCode || "",
      });
      const order = { ...(response.order || {}), paymentProofToken: response.paymentProofToken || null, manualPaymentDetails: response.manualPaymentDetails || null };
      const products = state.products.map((product) => {
        const purchased = order.items?.find((item) => item.productId === product.id);
        return purchased ? { ...product, stock: Math.max(0, Number(product.stock) - Number(purchased.qty)) } : product;
      });
      let orders = [order, ...state.orders.filter((item) => item.id !== order.id)];
      let inventoryLog = state.inventoryLog || [];
      if (state.session?.id) {
        try {
          const remote = await ordersApi.list();
          if (Array.isArray(remote.orders)) orders = remote.orders;
          if (Array.isArray(remote.inventoryLog)) inventoryLog = remote.inventoryLog;
        } catch (refreshError) {
          console.warn("[FikarNot] Could not refresh remote orders after checkout.", refreshError);
        }
      }
      setState({ orders, products, cart: [], inventoryLog });
      saveLS(STORAGE_KEYS.orders, orders);
      saveLS(STORAGE_KEYS.products, products);
      saveLS(STORAGE_KEYS.inventoryLog, inventoryLog);
      if (state.session?.id) {
        writeAccountBucket(STORAGE_KEYS.customerCarts, state.session.id, []);
        engagementApi.listNotifications().then(({ notifications }) => {
          if (Array.isArray(notifications)) setState({ notifications });
        }).catch(() => {
        // Notification refresh failure should not interrupt the current action.
      });
      }
      toast("Order placed successfully");
      return order;
    } catch (error) {
      toast(error.message || "We couldn't create the order. Please try again.", "err");
      return null;
    }
  },

  async cancelOrder(id) {
    if (!state.session) {
      toast("Please sign in to cancel an order", "err");
      return false;
    }
    try {
      const { order } = await ordersApi.cancel(id);
      const orders = state.orders.map((item) => (item.id === id ? order : item));
      setState({ orders });
      saveLS(STORAGE_KEYS.orders, orders);
      engagementApi.listNotifications().then(({ notifications }) => {
        if (Array.isArray(notifications)) setState({ notifications });
      }).catch(() => {
        // Notification refresh failure should not interrupt the current action.
      });
      try {
        const remoteCatalog = await catalogApi.list();
        if (Array.isArray(remoteCatalog.products)) setState({ products: remoteCatalog.products, inventoryLog: remoteCatalog.inventoryLog || [] });
      } catch {
        // Remote catalog refresh is best-effort after cancellation.
      }
      toast("Order cancelled");
      return true;
    } catch (error) {
      toast(error.message || "This order can no longer be cancelled", "err");
      return false;
    }
  },

  requestReturn(orderId, reason, note = "") {
    if (!state.session) {
      toast("Please sign in to request a return", "err");
      return false;
    }
    const order = state.orders.find((item) => item.id === orderId);
    if (!order || order.customer?.userId !== state.session.id || !canRequestReturn(order)) {
      toast("This order is not eligible for a return", "err");
      return false;
    }
    const request = normalizeReturnRequest({
      id: `ret-${uid()}`,
      orderId,
      userId: state.session.id,
      reason,
      note,
      status: RETURN_STATUSES.REQUESTED,
    });
    const returnRequests = [request, ...state.returnRequests];
    const orders = state.orders.map((item) => (item.id === orderId ? { ...item, returnRequest: request.id } : item));
    setState({ returnRequests, orders });
    saveLS(STORAGE_KEYS.returnRequests, returnRequests);
    saveLS(STORAGE_KEYS.orders, orders);
    engagementApi.createReturn({ orderId, reason, note }).then(({ request: remoteRequest }) => {
      const nextRequests = [remoteRequest, ...state.returnRequests.filter((item) => item.id !== request.id && item.id !== remoteRequest.id)];
      const nextOrders = state.orders.map((item) => item.id === orderId ? { ...item, returnRequest: remoteRequest.id } : item);
      setState({ returnRequests: nextRequests, orders: nextOrders });
      saveLS(STORAGE_KEYS.returnRequests, nextRequests);
      saveLS(STORAGE_KEYS.orders, nextOrders);
    }).catch((error) => toast(error.message || "Return request could not be saved to the server", "err"));
    engagementApi.listNotifications().then(({ notifications }) => {
      if (Array.isArray(notifications)) setState({ notifications });
    }).catch(() => {
        // Notification refresh failure should not interrupt the current action.
      });
    toast("Return request submitted");
    return true;
  },

  setReturnStatus(returnId, status) {
    if (!state.session || !["admin", "editor"].includes(state.session.role)) {
      toast("You do not have permission to update returns", "err");
      return false;
    }
    const request = state.returnRequests.find((item) => item.id === returnId);
    if (!request) return false;
    if (![...Object.values(RETURN_STATUSES)].includes(status)) return false;
    const previous = request.status;
    if (previous === status) return true;
    const returnRequests = state.returnRequests.map((item) => (item.id === returnId ? { ...item, status, updatedAt: Date.now() } : item));
    let orders = state.orders;
    let products = state.products;
    let inventoryLog = state.inventoryLog || [];
    const order = state.orders.find((item) => item.id === request.orderId);
    if (order && status === RETURN_STATUSES.APPROVED && previous !== RETURN_STATUSES.APPROVED) {
      orders = orders.map((item) => (item.id === order.id ? { ...item, status: "return_approved" } : item));
    }
    if (order && status === RETURN_STATUSES.COMPLETED && previous !== RETURN_STATUSES.COMPLETED) {
      orders = orders.map((item) => (item.id === order.id ? { ...item, status: "returned" } : item));
      products = products.map((product) => {
        const line = order.items?.find((item) => item.productId === product.id);
        return line ? { ...product, stock: product.stock + line.qty } : product;
      });
      inventoryLog = [
        ...order.items
          .map((item) => {
            const product = state.products.find((entry) => entry.id === item.productId);
            return product
              ? {
                  id: uid(),
                  productId: product.id,
                  productName: product.name,
                  previousStock: product.stock,
                  nextStock: product.stock + item.qty,
                  change: item.qty,
                  reason: `Return ${request.id} completed`,
                  createdAt: Date.now(),
                  userId: state.session.id,
                }
              : null;
          })
          .filter(Boolean),
        ...inventoryLog,
      ].slice(0, 100);
    }
    if (order && status === RETURN_STATUSES.REJECTED && previous !== RETURN_STATUSES.REJECTED) {
      orders = orders.map((item) => (item.id === order.id ? { ...item, returnRequest: null } : item));
    }
    setState({ returnRequests, orders, products, inventoryLog });
    saveLS(STORAGE_KEYS.returnRequests, returnRequests);
    saveLS(STORAGE_KEYS.orders, orders);
    saveLS(STORAGE_KEYS.products, products);
    saveLS(STORAGE_KEYS.inventoryLog, inventoryLog);
    engagementApi.setReturnStatus(returnId, status).then(({ request: remoteRequest }) => {
      const nextRequests = state.returnRequests.map((item) => item.id === returnId ? remoteRequest : item);
      setState({ returnRequests: nextRequests });
      saveLS(STORAGE_KEYS.returnRequests, nextRequests);
    }).catch((error) => toast(error.message || "Return status could not be saved to the server", "err"));
    if (request.userId) {
      engagementApi.listNotifications().then(({ notifications }) => {
        if (Array.isArray(notifications)) setState({ notifications });
      }).catch(() => {
        // Notification refresh failure should not interrupt the current action.
      });
    }
    toast("Return status updated");
    return true;
  },

  async setReturnRefund(returnId, payload) {
    if (!state.session || !["admin", "editor"].includes(state.session.role)) {
      toast("You do not have permission to update refunds", "err");
      return false;
    }
    try {
      const { request } = await engagementApi.setReturnRefund(returnId, payload);
      const returnRequests = state.returnRequests.map((item) => (item.id === returnId ? request : item));
      setState({ returnRequests });
      saveLS(STORAGE_KEYS.returnRequests, returnRequests);
      toast("Refund status updated");
      return true;
    } catch (error) {
      toast(error.message || "Refund status could not be updated", "err");
      return false;
    }
  },

  async confirmPayment(id, payload = {}) {
    try {
      const { order } = await ordersApi.confirmPayment(id, payload);
      const orders = state.orders.map((item) => (item.id === id ? order : item));
      setState({ orders });
      saveLS(STORAGE_KEYS.orders, orders);
      toast("Payment confirmed");
      return true;
    } catch (error) {
      toast(error.message || "Payment could not be confirmed", "err");
      return false;
    }
  },

  async setOrderFulfilment(id, payload) {
    try {
      const { order } = await ordersApi.setFulfilment(id, payload);
      const orders = state.orders.map((item) => (item.id === id ? order : item));
      setState({ orders });
      saveLS(STORAGE_KEYS.orders, orders);
      toast(payload.shipmentStatus === "delivered" ? "Shipment marked delivered" : "Shipment details saved");
      return true;
    } catch (error) {
      toast(error.message || "Shipment details could not be saved", "err");
      return false;
    }
  },

  async setOrderStatus(id, status) {
    const previous = state.orders.find((order) => order.id === id);
    if (!previous) return false;
    if (previous.status === status) return true;
    try {
      await ordersApi.setStatus(id, status);
      const orders = state.orders.map((order) => (order.id === id ? { ...order, status, cancelledAt: status === "cancelled" ? Date.now() : undefined } : order));
      setState({ orders });
      saveLS(STORAGE_KEYS.orders, orders);
      if (previous.customer?.userId) {
        engagementApi.listNotifications().then(({ notifications }) => {
          if (Array.isArray(notifications)) setState({ notifications });
        }).catch(() => {
        // Notification refresh failure should not interrupt the current action.
      });
      }
      toast("Order status updated");
      return true;
    } catch (error) {
      toast(error.message || "Order status could not be updated", "err");
      return false;
    }
  },

  async updateSiteSettings(settings) {
    try {
      const { settings: saved } = await siteApi.update(settings);
      setState({ siteSettings: saved });
      toast("Store settings saved");
      return saved;
    } catch (error) {
      toast(error.message || "Could not save settings", "err");
      throw error;
    }
  },

  async deleteOrder(id) {
    try {
      await ordersApi.remove(id);
      const orders = state.orders.filter((order) => order.id !== id);
      setState({ orders });
      saveLS(STORAGE_KEYS.orders, orders);
      toast("Order deleted");
      return true;
    } catch (error) {
      toast(error.message || "Unable to delete order", "err");
      return false;
    }
  },
};

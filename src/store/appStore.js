import { useSyncExternalStore } from "react";
import { seedData } from "../data/seedData";
import { STORAGE_KEYS } from "../config/storageKeys";
import { delay, loadLS, saveLS, uid } from "../utils/helpers";

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
  session: null,
  toast: null,
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
const getNextOrderNumber = (orders) => {
  const max = orders.reduce((highest, order) => {
    const match = String(order.id || "").match(/^FN-(\d{4,})$/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `${ORDER_ID_PREFIX}-${String(max + 1).padStart(4, "0")}`;
};

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
    if ([STORAGE_KEYS.orders, STORAGE_KEYS.products, STORAGE_KEYS.users, STORAGE_KEYS.inventoryLog].includes(event.key)) {
      const patch = {};
      if (event.key === STORAGE_KEYS.orders) patch.orders = loadLS(STORAGE_KEYS.orders, []);
      if (event.key === STORAGE_KEYS.products) patch.products = loadLS(STORAGE_KEYS.products, []);
      if (event.key === STORAGE_KEYS.inventoryLog) patch.inventoryLog = loadLS(STORAGE_KEYS.inventoryLog, []);
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
          saveLS(STORAGE_KEYS.customerCarts, {});
          saveLS(STORAGE_KEYS.customerWishlists, {});
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
          };
          if (!Array.isArray(storedReviews)) saveLS(STORAGE_KEYS.reviews, data.reviews);
        }

        if (!Array.isArray(data.reviews)) data.reviews = [];
        if (!Array.isArray(data.inventoryLog)) data.inventoryLog = [];

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

        const sessionRaw = loadLS(STORAGE_KEYS.session, null);
        const session = sessionRaw?.id ? data.users.find((user) => user.id === sessionRaw.id) || null : null;
        if (session && (usersChanged || session.email !== sessionRaw.email || session.name !== sessionRaw.name))
          saveLS(STORAGE_KEYS.session, session);
        const legacyCart = loadLS(STORAGE_KEYS.cart, []);
        const legacyWishlist = loadLS(STORAGE_KEYS.wishlist, []);
        let cart = [];
        let wishlist = [];
        if (session?.id) {
          const savedCart = readAccountBucket(STORAGE_KEYS.customerCarts, session.id);
          const savedWishlist = readAccountBucket(STORAGE_KEYS.customerWishlists, session.id);
          cart = savedCart.length ? savedCart : mergeCart([], legacyCart, data.products);
          wishlist = savedWishlist.length
            ? savedWishlist
            : legacyWishlist.filter((id) => data.products.some((product) => product.id === id));
          if (cart.length && !savedCart.length) writeAccountBucket(STORAGE_KEYS.customerCarts, session.id, cart);
          if (wishlist.length && !savedWishlist.length) writeAccountBucket(STORAGE_KEYS.customerWishlists, session.id, wishlist);
        }
        localStorage.removeItem(STORAGE_KEYS.cart);
        localStorage.removeItem(STORAGE_KEYS.wishlist);
        saveLS(STORAGE_KEYS.inventoryLog, data.inventoryLog);
        setState({ ...data, cart, wishlist, session, ready: true });
      } catch (error) {
        setState({ bootError: error?.message || "Failed to load store data" });
      } finally {
        bootstrapPromise = null;
      }
    })();

    return bootstrapPromise;
  },

  resetDemo() {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    window.location.href = "/";
  },

  async login(email, password) {
    await delay(350);
    const user = state.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || user.password !== password) {
      toast("Invalid email or password", "err");
      return null;
    }
    const guestCart = state.session ? [] : state.cart;
    const accountCart = readAccountBucket(STORAGE_KEYS.customerCarts, user.id);
    const accountWishlist = readAccountBucket(STORAGE_KEYS.customerWishlists, user.id).filter((id) =>
      state.products.some((product) => product.id === id),
    );
    const cart = mergeCart(accountCart, guestCart, state.products);
    setState({ session: user, cart, wishlist: accountWishlist });
    writeAccountBucket(STORAGE_KEYS.customerCarts, user.id, cart);
    writeAccountBucket(STORAGE_KEYS.customerWishlists, user.id, accountWishlist);
    saveLS(STORAGE_KEYS.session, user);
    toast(`Welcome back, ${user.name.split(" ")[0]}`);
    return user;
  },

  async register(name, email, password) {
    await delay(400);
    const normalizedEmail = email.trim().toLowerCase();
    if (state.users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
      toast("Email already in use", "err");
      return null;
    }

    const user = { id: `u${uid()}`, name: name.trim(), email: email.trim(), password, role: "customer", createdAt: Date.now() };
    const users = [...state.users, user];
    const guestCart = state.session ? [] : state.cart;
    const cart = mergeCart([], guestCart, state.products);
    setState({ users, session: user, cart, wishlist: [] });
    saveLS(STORAGE_KEYS.users, users);
    writeAccountBucket(STORAGE_KEYS.customerCarts, user.id, cart);
    writeAccountBucket(STORAGE_KEYS.customerWishlists, user.id, []);
    saveLS(STORAGE_KEYS.session, user);
    toast(`Account created — welcome, ${user.name.split(" ")[0]}`);
    return user;
  },

  logout() {
    if (state.session?.id) {
      writeAccountBucket(STORAGE_KEYS.customerCarts, state.session.id, state.cart);
      writeAccountBucket(STORAGE_KEYS.customerWishlists, state.session.id, state.wishlist);
    }
    setState({ session: null, cart: [], wishlist: [] });
    saveLS(STORAGE_KEYS.session, null);
    localStorage.removeItem(STORAGE_KEYS.cart);
    localStorage.removeItem(STORAGE_KEYS.wishlist);
    toast("Signed out — your account data is safely saved");
  },

  updateProfile(updates) {
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
    const duplicate = state.users.find((user) => user.id !== state.session.id && user.email.toLowerCase() === email.toLowerCase());
    if (duplicate) {
      toast("That email is already in use", "err");
      return false;
    }
    const users = state.users.map((user) => (user.id === state.session.id ? { ...user, name, email } : user));
    const orders = state.orders.map((order) => {
      const belongsToUser =
        order.customer?.userId === state.session.id ||
        (!order.customer?.userId && normalizeEmail(order.customer?.email) === normalizeEmail(state.session.email));
      if (!belongsToUser) return order;
      return { ...order, customer: { ...order.customer, userId: state.session.id, name, email } };
    });
    const session = users.find((user) => user.id === state.session.id);
    setState({ users, orders, session });
    saveLS(STORAGE_KEYS.users, users);
    saveLS(STORAGE_KEYS.orders, orders);
    saveLS(STORAGE_KEYS.session, session);
    toast("Profile updated");
    return true;
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
    toast("Review removed");
    return true;
  },

  deleteAccount(currentPassword, confirmationText) {
    if (!state.session) return false;
    if (["admin", "editor"].includes(state.session.role)) {
      toast("Staff accounts can't be deleted here", "err");
      return false;
    }
    const currentUser = state.users.find((user) => user.id === state.session.id);
    if (!currentUser || currentUser.password !== currentPassword) {
      toast("Current password is incorrect", "err");
      return false;
    }
    if (confirmationText !== "DELETE") {
      toast("Type DELETE to confirm account removal", "err");
      return false;
    }

    const accountId = state.session.id;
    const accountEmail = normalizeEmail(state.session.email);
    const deletedAt = Date.now();
    const users = state.users.filter((user) => user.id !== accountId);
    const reviews = state.reviews.map((review) =>
      review.userId === accountId ? { ...review, userId: `deleted-${deletedAt}`, authorName: "Deleted Customer" } : review,
    );
    const orders = state.orders.map((order) => {
      const belongsToUser =
        order.customer?.userId === accountId || (!order.customer?.userId && normalizeEmail(order.customer?.email) === accountEmail);
      if (!belongsToUser) return order;
      return {
        ...order,
        customer: {
          ...order.customer,
          userId: undefined,
          name: "Deleted Customer",
          email: `deleted-${deletedAt}@fikarnot.local`,
        },
      };
    });

    setState({ users, orders, reviews, cart: [], wishlist: [], session: null });
    saveLS(STORAGE_KEYS.users, users);
    saveLS(STORAGE_KEYS.orders, orders);
    saveLS(STORAGE_KEYS.reviews, reviews);
    removeAccountBucket(STORAGE_KEYS.customerCarts, state.session.id);
    removeAccountBucket(STORAGE_KEYS.customerWishlists, state.session.id);
    localStorage.removeItem(STORAGE_KEYS.cart);
    localStorage.removeItem(STORAGE_KEYS.wishlist);
    saveLS(STORAGE_KEYS.session, null);
    toast("Your account has been deleted");
    return true;
  },

  changePassword(currentPassword, newPassword) {
    if (!state.session) return false;
    const currentUser = state.users.find((user) => user.id === state.session.id);
    if (!currentUser || currentUser.password !== currentPassword) {
      toast("Current password is incorrect", "err");
      return false;
    }
    if (newPassword.length < 6) {
      toast("New password must be at least 6 characters", "err");
      return false;
    }
    const users = state.users.map((user) => (user.id === state.session.id ? { ...user, password: newPassword } : user));
    const session = users.find((user) => user.id === state.session.id);
    setState({ users, session });
    saveLS(STORAGE_KEYS.users, users);
    saveLS(STORAGE_KEYS.session, session);
    toast("Password updated");
    return true;
  },

  saveAddress(address) {
    if (!state.session) return false;
    const users = state.users.map((user) => {
      if (user.id !== state.session.id) return user;
      const current = Array.isArray(user.addresses) ? user.addresses : [];
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
      let next =
        clean.id && current.some((item) => item.id === clean.id)
          ? current.map((item) => (item.id === clean.id ? clean : item))
          : [...current, clean];
      if (clean.isDefault) next = next.map((item) => ({ ...item, isDefault: item.id === clean.id }));
      if (next.length === 1 && !next[0].isDefault) next = [{ ...next[0], isDefault: true }];
      return { ...user, addresses: next };
    });
    const session = users.find((user) => user.id === state.session.id);
    setState({ users, session });
    saveLS(STORAGE_KEYS.users, users);
    saveLS(STORAGE_KEYS.session, session);
    toast(address.id ? "Address updated" : "Address saved");
    return true;
  },

  deleteAddress(addressId) {
    if (!state.session) return false;
    const users = state.users.map((user) => {
      if (user.id !== state.session.id) return user;
      const next = (user.addresses || []).filter((address) => address.id !== addressId);
      if (next.length && !next.some((address) => address.isDefault)) next[0] = { ...next[0], isDefault: true };
      return { ...user, addresses: next };
    });
    const session = users.find((user) => user.id === state.session.id);
    setState({ users, session });
    saveLS(STORAGE_KEYS.users, users);
    saveLS(STORAGE_KEYS.session, session);
    toast("Address removed");
    return true;
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
    if (state.session?.id) writeAccountBucket(STORAGE_KEYS.customerCarts, state.session.id, cart);
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
    if (state.session?.id) writeAccountBucket(STORAGE_KEYS.customerCarts, state.session.id, cart);
  },

  removeFromCart(productId) {
    appActions.setCartQty(productId, 0);
    toast("Removed from cart");
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
    toast(exists ? `${product.name} removed from wishlist` : `${product.name} added to wishlist`);
    return !exists;
  },

  clearWishlist() {
    if (!state.session?.id || !state.wishlist.length) return;
    setState({ wishlist: [] });
    writeAccountBucket(STORAGE_KEYS.customerWishlists, state.session.id, []);
    toast("Wishlist cleared");
  },

  upsertProduct(product) {
    const sku = String(product.sku || makeFallbackSku(product.id))
      .trim()
      .toUpperCase();
    const duplicate = state.products.find((item) => item.id !== product.id && String(item.sku || "").toLowerCase() === sku.toLowerCase());
    if (duplicate) {
      toast(`SKU ${sku} is already used by ${duplicate.name}`, "err");
      return false;
    }
    const list = [...state.products];
    const index = list.findIndex((item) => item.id === product.id);
    const normalized = { ...product, sku, stockThreshold: Math.max(0, Math.floor(+product.stockThreshold || 0)) };
    if (index >= 0) list[index] = { ...list[index], ...normalized };
    else list.unshift({ createdAt: Date.now(), ...normalized });
    setState({ products: list });
    saveLS(STORAGE_KEYS.products, list);
    toast(index >= 0 ? "Product updated" : "Product created");
    return true;
  },

  adjustStock(productId, nextStock, reason = "Manual stock adjustment") {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return false;
    const value = Math.max(0, Math.floor(Number(nextStock)));
    if (!Number.isFinite(value)) {
      toast("Enter a valid stock value", "err");
      return false;
    }
    if (value === product.stock) return true;
    const products = state.products.map((item) => (item.id === productId ? { ...item, stock: value } : item));
    const inventoryLog = [
      {
        id: uid(),
        productId,
        productName: product.name,
        previousStock: product.stock,
        nextStock: value,
        change: value - product.stock,
        reason,
        createdAt: Date.now(),
        userId: state.session?.id || null,
      },
      ...state.inventoryLog,
    ].slice(0, 100);
    setState({ products, inventoryLog });
    saveLS(STORAGE_KEYS.products, products);
    saveLS(STORAGE_KEYS.inventoryLog, inventoryLog);
    toast(`${product.name} stock updated to ${value}`);
    return true;
  },

  deleteProduct(id) {
    const products = state.products.filter((product) => product.id !== id);
    const cart = state.cart.filter((line) => line.productId !== id);
    const wishlist = state.wishlist.filter((productId) => productId !== id);
    setState({ products, cart, wishlist });
    saveLS(STORAGE_KEYS.products, products);
    if (state.session?.id) {
      writeAccountBucket(STORAGE_KEYS.customerCarts, state.session.id, cart);
      writeAccountBucket(STORAGE_KEYS.customerWishlists, state.session.id, wishlist);
    }
    toast("Product deleted");
  },

  toggleFeatured(id) {
    const products = state.products.map((product) => (product.id === id ? { ...product, featured: !product.featured } : product));
    setState({ products });
    saveLS(STORAGE_KEYS.products, products);
  },

  upsertCategory(category) {
    const list = [...state.categories];
    const index = list.findIndex((item) => item.id === category.id);
    if (index >= 0) list[index] = { ...list[index], ...category };
    else list.push({ createdAt: Date.now(), ...category });
    setState({ categories: list });
    saveLS(STORAGE_KEYS.categories, list);
    toast(index >= 0 ? "Category updated" : "Category created");
  },

  deleteCategory(id) {
    if (state.products.some((product) => product.categoryId === id)) {
      toast("Reassign or delete its products first", "err");
      return;
    }
    const categories = state.categories.filter((category) => category.id !== id);
    setState({ categories });
    saveLS(STORAGE_KEYS.categories, categories);
    toast("Category deleted");
  },

  upsertUser(user) {
    const duplicate = state.users.find((item) => item.email.toLowerCase() === user.email.toLowerCase() && item.id !== user.id);
    if (duplicate) {
      toast("Email already in use", "err");
      return false;
    }

    const list = [...state.users];
    const index = list.findIndex((item) => item.id === user.id);
    if (index >= 0) list[index] = { ...list[index], ...user };
    else list.push({ createdAt: Date.now(), ...user });

    const session = state.session?.id === user.id ? list.find((item) => item.id === user.id) : state.session;
    setState({ users: list, session });
    saveLS(STORAGE_KEYS.users, list);
    if (session) saveLS(STORAGE_KEYS.session, session);
    toast(index >= 0 ? "User updated" : "User created");
    return true;
  },

  deleteUser(id) {
    if (state.session?.id === id) {
      toast("You can't delete yourself", "err");
      return;
    }
    const users = state.users.filter((user) => user.id !== id);
    setState({ users });
    saveLS(STORAGE_KEYS.users, users);
    toast("User deleted");
  },

  setRole(id, role) {
    const users = state.users.map((user) => (user.id === id ? { ...user, role } : user));
    const session = state.session?.id === id ? users.find((user) => user.id === id) : state.session;
    setState({ users, session });
    saveLS(STORAGE_KEYS.users, users);
    if (session) saveLS(STORAGE_KEYS.session, session);
    toast("Role updated");
  },

  placeOrder(customer) {
    const items = cartLines()
      .map(({ p, qty }) => ({ productId: p.id, name: p.name, price: p.price, qty: Math.min(qty, p.stock) }))
      .filter((item) => item.qty > 0);
    if (!items.length) {
      toast("Your cart is empty or the selected products are out of stock", "err");
      return null;
    }
    const subtotal = +items.reduce((sum, item) => sum + item.price * item.qty, 0).toFixed(2);
    const shipping = subtotal >= 75 ? 0 : 6.95;
    const order = {
      id: getNextOrderNumber(state.orders),
      customer: {
        ...customer,
        ...(state.session?.id ? { userId: state.session.id } : {}),
      },
      items,
      subtotal,
      shipping,
      total: +(subtotal + shipping).toFixed(2),
      status: "paid",
      createdAt: Date.now(),
    };
    const products = state.products.map((product) => {
      const item = items.find((entry) => entry.productId === product.id);
      return item ? { ...product, stock: Math.max(0, product.stock - item.qty) } : product;
    });
    const orders = [order, ...state.orders];
    const inventoryLog = [
      ...items
        .map((item) => {
          const product = state.products.find((entry) => entry.id === item.productId);
          return product
            ? {
                id: uid(),
                productId: product.id,
                productName: product.name,
                previousStock: product.stock,
                nextStock: Math.max(0, product.stock - item.qty),
                change: -item.qty,
                reason: `Order ${order.id}`,
                createdAt: Date.now(),
                userId: state.session?.id || null,
              }
            : null;
        })
        .filter(Boolean),
      ...state.inventoryLog,
    ].slice(0, 100);
    setState({ orders, products, cart: [], inventoryLog });
    saveLS(STORAGE_KEYS.orders, orders);
    saveLS(STORAGE_KEYS.products, products);
    saveLS(STORAGE_KEYS.inventoryLog, inventoryLog);
    if (state.session?.id) writeAccountBucket(STORAGE_KEYS.customerCarts, state.session.id, []);
    return order;
  },

  setOrderStatus(id, status) {
    const orders = state.orders.map((order) => (order.id === id ? { ...order, status } : order));
    setState({ orders });
    saveLS(STORAGE_KEYS.orders, orders);
    toast("Order status updated");
  },
};

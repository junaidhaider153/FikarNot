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
  cart: [],
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

export const useApp = () => useSyncExternalStore(subscribe, () => state);
export const getState = () => state;

const toast = (msg, kind = "ok") => {
  const value = { msg, kind, id: uid() };
  setState({ toast: value });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (state.toast?.id === value.id) setState({ toast: null });
  }, 2600);
};

export const cartLines = (snapshot = state) => snapshot.cart
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
        saveLS(STORAGE_KEYS.cart, []);
        saveLS(STORAGE_KEYS.seeded, true);
      } else {
        data = {
          products: loadLS(STORAGE_KEYS.products, []),
          categories: loadLS(STORAGE_KEYS.categories, []),
          users: loadLS(STORAGE_KEYS.users, []),
          orders: loadLS(STORAGE_KEYS.orders, []),
          cart: loadLS(STORAGE_KEYS.cart, []),
        };
      }

        setState({ ...data, session: loadLS(STORAGE_KEYS.session, null), ready: true });
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
    setState({ session: user });
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
    setState({ users, session: user });
    saveLS(STORAGE_KEYS.users, users);
    saveLS(STORAGE_KEYS.session, user);
    toast(`Account created — welcome, ${user.name.split(" ")[0]}`);
    return user;
  },

  logout() {
    setState({ session: null });
    saveLS(STORAGE_KEYS.session, null);
    toast("Signed out");
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
      ? state.cart.map((line) => line.productId === productId ? { ...line, qty: nextQty } : line)
      : [...state.cart, { productId, qty: nextQty }];

    setState({ cart });
    saveLS(STORAGE_KEYS.cart, cart);
    toast(`${product.name} added to cart`);
  },

  setCartQty(productId, qty) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return;

    const cart = qty <= 0
      ? state.cart.filter((line) => line.productId !== productId)
      : state.cart.map((line) => line.productId === productId ? { ...line, qty: Math.min(qty, product.stock) } : line);

    setState({ cart });
    saveLS(STORAGE_KEYS.cart, cart);
  },

  removeFromCart(productId) {
    appActions.setCartQty(productId, 0);
    toast("Removed from cart");
  },

  upsertProduct(product) {
    const list = [...state.products];
    const index = list.findIndex((item) => item.id === product.id);
    if (index >= 0) list[index] = { ...list[index], ...product };
    else list.unshift({ createdAt: Date.now(), ...product });
    setState({ products: list });
    saveLS(STORAGE_KEYS.products, list);
    toast(index >= 0 ? "Product updated" : "Product created");
  },

  deleteProduct(id) {
    const products = state.products.filter((product) => product.id !== id);
    const cart = state.cart.filter((line) => line.productId !== id);
    setState({ products, cart });
    saveLS(STORAGE_KEYS.products, products);
    saveLS(STORAGE_KEYS.cart, cart);
    toast("Product deleted");
  },

  toggleFeatured(id) {
    const products = state.products.map((product) => product.id === id ? { ...product, featured: !product.featured } : product);
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
    const users = state.users.map((user) => user.id === id ? { ...user, role } : user);
    const session = state.session?.id === id ? users.find((user) => user.id === id) : state.session;
    setState({ users, session });
    saveLS(STORAGE_KEYS.users, users);
    if (session) saveLS(STORAGE_KEYS.session, session);
    toast("Role updated");
  },

  placeOrder(customer) {
    const items = cartLines().map(({ p, qty }) => ({ productId: p.id, name: p.name, price: p.price, qty: Math.min(qty, p.stock) })).filter((item) => item.qty > 0);
    const subtotal = +items.reduce((sum, item) => sum + item.price * item.qty, 0).toFixed(2);
    const shipping = subtotal >= 75 ? 0 : 6.95;
    const order = { id: `o${uid()}`, customer, items, subtotal, shipping, total: +(subtotal + shipping).toFixed(2), status: "paid", createdAt: Date.now() };
    const products = state.products.map((product) => {
      const item = items.find((entry) => entry.productId === product.id);
      return item ? { ...product, stock: Math.max(0, product.stock - item.qty) } : product;
    });
    const orders = [order, ...state.orders];
    setState({ orders, products, cart: [] });
    saveLS(STORAGE_KEYS.orders, orders);
    saveLS(STORAGE_KEYS.products, products);
    saveLS(STORAGE_KEYS.cart, []);
    return order;
  },

  setOrderStatus(id, status) {
    const orders = state.orders.map((order) => order.id === id ? { ...order, status } : order);
    setState({ orders });
    saveLS(STORAGE_KEYS.orders, orders);
    toast("Order status updated");
  },
};

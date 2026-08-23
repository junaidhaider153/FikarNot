import { IMG } from "../assets/assets";

export function seedData() {
  const now = Date.now();
  const categories = [
    { id: "c1", name: "Audio", description: "Headphones, speakers and everything between.", color: "#E4572E", createdAt: now - 9e8 },
    { id: "c2", name: "Wearables", description: "Watches and cameras that earn their place on you.", color: "#5B6DFA", createdAt: now - 9e8 },
    { id: "c3", name: "Home & Desk", description: "Objects that make the desk feel like a place.", color: "#E9A13B", createdAt: now - 9e8 },
    { id: "c4", name: "Carry", description: "Bags and daily companions, built to be used.", color: "#3E8E5A", createdAt: now - 9e8 },
  ];

  const products = [
    { id: "p1", name: "Aria One Headphones", sku: "FKN-AUD-001", stockThreshold: 8, categoryId: "c1", price: 249, stock: 24, rating: 4.8, image: IMG.headphones, tags: ["wireless", "anc"], featured: true, createdAt: now - 8e8, description: "Flagship over-ears with adaptive ANC, 40-hour battery and copper-detailed aluminium yokes. Tuned warm, built to last." },
    { id: "p2", name: "Pulse S Smartwatch", sku: "FKN-WEA-002", stockThreshold: 6, categoryId: "c2", price: 199, stock: 18, rating: 4.6, image: IMG.watch, tags: ["gps", "amoled"], featured: true, createdAt: now - 7e8, description: "A slim smartwatch with an AMOLED display, 10-day battery and dual-band GPS. Tracks workouts, sleep and nothing you don't need." },
    { id: "p3", name: "Orbit Mini Speaker", sku: "FKN-AUD-003", stockThreshold: 10, categoryId: "c1", price: 89, stock: 40, rating: 4.4, image: IMG.speaker, tags: ["360", "portable"], featured: false, createdAt: now - 6e8, description: "Pocketable 360° speaker with a fabric wrap and 14-hour runtime. Pairs instantly, survives the backpack." },
    { id: "p4", name: "Halo Task Lamp", sku: "FKN-HOM-004", stockThreshold: 6, categoryId: "c3", price: 119, stock: 12, rating: 4.7, image: IMG.lamp, tags: ["led", "dimmable"], featured: true, createdAt: now - 5e8, description: "A sculptural task lamp with stepless dimming and warm-to-cool spectrum. One-touch memory, zero flicker." },
    { id: "p5", name: "Nomad 22L Backpack", sku: "FKN-CAR-005", stockThreshold: 5, categoryId: "c4", price: 148, stock: 15, rating: 4.9, image: IMG.backpack, tags: ["waxed", "laptop"], featured: true, createdAt: now - 4e8, description: "Waxed-canvas carryall with a padded 16-inch laptop sleeve and leather hardware. Weatherproof, cabin-friendly." },
    { id: "p6", name: "Drift 65 Keyboard", sku: "FKN-HOM-006", stockThreshold: 5, categoryId: "c3", price: 159, stock: 9, rating: 4.5, image: IMG.keyboard, tags: ["mechanical", "hot-swap"], featured: false, createdAt: now - 3e8, description: "Gasket-mounted 65% board with pre-lubed linear switches and hot-swap sockets. Ships tuned, sounds thocky." },
    { id: "p7", name: "Vista 4K Action Cam", sku: "FKN-WEA-007", stockThreshold: 4, categoryId: "c2", price: 229, stock: 7, rating: 4.3, image: IMG.camera, tags: ["4k60", "waterproof"], featured: false, createdAt: now - 2e8, description: "Rugged 4K60 action camera with magnetic mounts and a swappable battery door. Waterproof to 10 m without a case." },
    { id: "p8", name: "Ember Travel Mug", sku: "FKN-CAR-008", stockThreshold: 12, categoryId: "c4", price: 34, stock: 60, rating: 4.6, image: IMG.mug, tags: ["ceramic", "bamboo"], featured: false, createdAt: now - 1e8, description: "Double-wall ceramic mug with a bamboo lid. Keeps your pour-over hot through two meetings." },
  ];

  const users = [
    { id: "u1", name: "Ari Admin", email: "junaid@fikarnot.shop", password: "admin123", role: "admin", createdAt: now - 9e8 },
    { id: "u2", name: "Noor Haddad", email: "editor@fikarnot.shop", password: "editor123", role: "editor", createdAt: now - 8e8 },
    { id: "u3", name: "Maya Chen", email: "urwa@fikarnot.shop", password: "maya123", role: "customer", createdAt: now - 7e8 },
  ];

  const mk = (id, name, email, items, days, status) => {
    const subtotal = +items.reduce((sum, item) => sum + item.price * item.qty, 0).toFixed(2);
    const shipping = subtotal >= 75 ? 0 : 6.95;
    return { id, customer: { name, email }, items, subtotal, shipping, total: +(subtotal + shipping).toFixed(2), status, createdAt: now - days * 864e5 };
  };

  const orders = [
    mk("o1", "Maya Chen", "urwa@fikarnot.shop", [{ productId: "p1", name: "Aria One Headphones", price: 249, qty: 1 }, { productId: "p8", name: "Ember Travel Mug", price: 34, qty: 2 }], 6, "delivered"),
    mk("o2", "Jonas Weber", "jonas@example.com", [{ productId: "p5", name: "Nomad 22L Backpack", price: 148, qty: 1 }, { productId: "p3", name: "Orbit Mini Speaker", price: 89, qty: 1 }], 3, "shipped"),
    mk("o3", "Priya Nair", "priya@example.com", [{ productId: "p4", name: "Halo Task Lamp", price: 119, qty: 2 }], 1, "paid"),
  ];

  const reviews = [
    { id: "r1", productId: "p1", userId: "u3", authorName: "Maya Chen", rating: 5, title: "Exactly what I wanted", body: "The sound is warm, the ANC is excellent, and the battery easily gets me through the week.", status: "published", verifiedPurchase: true, createdAt: now - 4 * 864e5 },
    { id: "r2", productId: "p8", userId: "u3", authorName: "Maya Chen", rating: 4, title: "Great travel mug", body: "Looks great and keeps coffee hot for a long time. The lid takes a little getting used to.", status: "published", verifiedPurchase: true, createdAt: now - 3 * 864e5 },
    { id: "r3", productId: "p5", userId: "guest-jonas", authorName: "Jonas Weber", rating: 5, title: "Excellent daily carry", body: "Feels durable, fits my laptop perfectly, and still looks understated.", status: "published", verifiedPurchase: true, createdAt: now - 2 * 864e5 },
  ];

  return { products, categories, users, orders, reviews, cart: [] };
}

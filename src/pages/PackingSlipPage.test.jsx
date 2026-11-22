import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PackingSlipPage, { Code39Barcode } from "./PackingSlipPage";
import { ordersApi } from "../api/ordersApi";

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useParams: () => ({ orderId: "FN-8899" }),
}));

vi.mock("../api/ordersApi", () => ({
  ordersApi: {
    invoice: vi.fn(),
  },
}));

vi.mock("../hooks/useDocumentMeta", () => ({
  useDocumentMeta: vi.fn(),
}));

describe("PackingSlipPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders COD packing slip with cash collection notice, customer phone, barcodes, and checklist", async () => {
    ordersApi.invoice.mockResolvedValueOnce({
      invoice: {
        store: {
          name: "FikarNot Logistics",
          address: "Gulberg III, Lahore",
          phone: "0370 9072688",
          email: "ops@fikarnot.pk",
        },
        order: {
          id: "FN-8899",
          createdAt: "2026-11-23T00:00:00.000Z",
          currency: "PKR",
          paymentMethod: "cod",
          paymentStatus: "unpaid",
          courier: "PostEx",
          trackingNumber: "PEX-123456789",
          customer: {
            name: "Ali Raza",
            phone: "0300 1234567",
            address: "House 12, Street 4, Sector F-7/2, Islamabad",
          },
          subtotal: 3500,
          shipping: 0,
          discount: 0,
          total: 3500,
          items: [{ productId: "p-sound-1", name: "Wireless Noise Cancelling Earbuds", qty: 1, price: 3500 }],
        },
      },
    });

    render(<PackingSlipPage />);

    expect(screen.getByText(/loading packing slip/i)).toBeTruthy();

    await waitFor(() => {
      // Store & Header
      expect(screen.getByText("FikarNot Logistics")).toBeTruthy();
      expect(screen.getByText("PACKING SLIP & SHIPPING MANIFEST")).toBeTruthy();

      // Barcodes for order and tracking
      expect(screen.getByLabelText("Barcode: FN-8899")).toBeTruthy();
      expect(screen.getByLabelText("Barcode: PEX-123456789")).toBeTruthy();

      // COD High-Contrast Warning Callout
      expect(screen.getByText(/★ CASH ON DELIVERY \(COD\)/i)).toBeTruthy();
      expect(screen.getByText(/RIDER MUST COLLECT EXACT CASH/i)).toBeTruthy();
      expect(screen.getByText(/PAYABLE: Rs 3,500/i)).toBeTruthy();

      // Consignee Block
      expect(screen.getByText("Ali Raza")).toBeTruthy();
      expect(screen.getByText(/📞 0300 1234567/i)).toBeTruthy();
      expect(screen.getByText(/House 12, Street 4, Sector F-7\/2, Islamabad/i)).toBeTruthy();

      // Checklist & Item
      expect(screen.getByText("PACKING CHECKLIST:")).toBeTruthy();
      expect(screen.getByText("Wireless Noise Cancelling Earbuds")).toBeTruthy();

      // Inspection sign-off
      expect(screen.getByText(/Packed by:/i)).toBeTruthy();
      expect(screen.getByText(/Inspected by:/i)).toBeTruthy();
    });
  });

  it("renders PREPAID parcel banner when order is paid via online/wallet transfer", async () => {
    ordersApi.invoice.mockResolvedValueOnce({
      invoice: {
        store: { name: "FikarNot" },
        order: {
          id: "FN-9900",
          createdAt: "2026-11-23T00:00:00.000Z",
          currency: "PKR",
          paymentMethod: "jazzcash",
          paymentStatus: "paid",
          courier: "TCS",
          customer: {
            name: "Zainab Bibi",
            phone: "0333 5556677",
            address: "DHA Phase 5, Karachi",
          },
          subtotal: 5000,
          shipping: 200,
          discount: 200,
          total: 5000,
          items: [{ productId: "p-2", name: "Smart Fitness Watch", qty: 1, price: 5000 }],
        },
      },
    });

    render(<PackingSlipPage />);

    await waitFor(() => {
      expect(screen.getByText(/✓ PREPAID PARCEL/i)).toBeTruthy();
      expect(screen.getByText(/DO NOT COLLECT ANY CASH/i)).toBeTruthy();
      expect(screen.getByText(/PAID: Rs 5,000 \(JazzCash\)/i)).toBeTruthy();
    });
  });

  it("allows switching between thermal and standard packing slip layout modes", async () => {
    ordersApi.invoice.mockResolvedValueOnce({
      invoice: {
        store: { name: "FikarNot" },
        order: {
          id: "FN-8899",
          createdAt: "2026-11-23T00:00:00.000Z",
          paymentMethod: "cod",
          total: 2000,
          customer: { name: "Test User", phone: "0300 0000000" },
          items: [{ productId: "p-1", name: "Product", qty: 1, price: 2000 }],
        },
      },
    });

    const { container } = render(<PackingSlipPage />);

    await waitFor(() => {
      expect(container.querySelector(".slip-thermal")).toBeTruthy();
    });

    const select = screen.getByLabelText(/Label Format:/i);
    fireEvent.change(select, { target: { value: "standard" } });

    expect(container.querySelector(".slip-standard")).toBeTruthy();
    expect(container.querySelector(".slip-thermal")).toBeFalsy();
  });

  it("renders error state when order packing slip cannot be fetched", async () => {
    ordersApi.invoice.mockRejectedValueOnce(new Error("Packing slip not found or order cancelled."));

    render(<PackingSlipPage />);

    await waitFor(() => {
      expect(screen.getByText("Packing Slip Unavailable")).toBeTruthy();
      expect(screen.getByText("Packing slip not found or order cancelled.")).toBeTruthy();
      expect(screen.getByRole("link", { name: /back to orders/i })).toBeTruthy();
    });
  });

  it("renders pure SVG vector Code39Barcode correctly", () => {
    const { container } = render(<Code39Barcode value="FN-100" height={40} showText={true} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("aria-label")).toBe("Barcode: FN-100");
    expect(container.querySelector("rect")).toBeTruthy();
    expect(screen.getByText("*FN-100*")).toBeTruthy();
  });
});

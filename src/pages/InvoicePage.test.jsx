import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import InvoicePage from "./InvoicePage";
import { ordersApi } from "../api/ordersApi";

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useParams: () => ({ orderId: "FN-1001" }),
}));

vi.mock("../api/ordersApi", () => ({
  ordersApi: {
    invoice: vi.fn(),
  },
}));

vi.mock("../hooks/useDocumentMeta", () => ({
  useDocumentMeta: vi.fn(),
}));

describe("InvoicePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders invoice with customer phone, address, items, and store details", async () => {
    ordersApi.invoice.mockResolvedValueOnce({
      invoice: {
        store: {
          name: "FikarNot Store",
          address: "Gulberg III, Lahore",
          email: "support@fikarnot.pk",
          phone: "0300 1234567",
        },
        order: {
          id: "FN-1001",
          invoiceNumber: "INV-1001",
          currency: "PKR",
          createdAt: "2026-11-23T00:00:00.000Z",
          customer: {
            name: "Fatima Khan",
            email: "fatima@example.com",
            phone: "0321 9876543",
            address: "House 45, Street 10, Islamabad",
          },
          paymentMethod: "cod",
          paymentStatus: "unpaid",
          subtotal: 5000,
          discount: 500,
          shipping: 0,
          tax: 0,
          total: 4500,
          items: [{ productId: "p-1", name: "Linen Shirt", qty: 2, price: 2500 }],
        },
      },
    });

    render(<InvoicePage />);

    expect(screen.getByText(/loading invoice/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("FikarNot Store")).toBeTruthy();
      expect(screen.getByText("INV-1001")).toBeTruthy();
      expect(screen.getByText("Fatima Khan")).toBeTruthy();
      expect(screen.getByText("fatima@example.com")).toBeTruthy();
      expect(screen.getByText("Phone: 0321 9876543")).toBeTruthy();
      expect(screen.getByText("House 45, Street 10, Islamabad")).toBeTruthy();
      expect(screen.getByText("Linen Shirt")).toBeTruthy();
      expect(screen.getByText(/4,500/)).toBeTruthy();
      expect(screen.getByRole("button", { name: /print \/ save as pdf/i })).toBeTruthy();
    });
  });

  it("renders error state when invoice fails to load", async () => {
    ordersApi.invoice.mockRejectedValueOnce(new Error("Invoice not found or access denied"));

    render(<InvoicePage />);

    await waitFor(() => {
      expect(screen.getByText("Invoice unavailable")).toBeTruthy();
      expect(screen.getByText("Invoice not found or access denied")).toBeTruthy();
      expect(screen.getByRole("link", { name: /back to my account/i })).toBeTruthy();
    });
  });
});

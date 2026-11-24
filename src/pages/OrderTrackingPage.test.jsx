import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrderTrackingPage from "./OrderTrackingPage";
import { ordersApi } from "../api/ordersApi";
import { useApp } from "../store/appStore";

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock("../store/appStore", () => ({
  useApp: vi.fn(),
}));

vi.mock("../api/ordersApi", () => ({
  ordersApi: {
    lookup: vi.fn(),
  },
}));

vi.mock("../hooks/useDocumentMeta", () => ({
  useDocumentMeta: vi.fn(),
}));

describe("OrderTrackingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useApp.mockReturnValue({
      siteSettings: {
        whatsappNumber: "923709072688",
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders search form and validates empty input", async () => {
    render(<OrderTrackingPage />);

    expect(screen.getByText("Track your order")).toBeTruthy();
    expect(screen.getByLabelText(/order id/i)).toBeTruthy();
    expect(screen.getByLabelText(/mobile phone or email/i)).toBeTruthy();

    const submitBtn = screen.getByRole("button", { name: /track order/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/please provide both your order id and phone number or email/i)).toBeTruthy();
    });
    expect(ordersApi.lookup).not.toHaveBeenCalled();
  });

  it("performs order lookup and renders order status, courier tracking, and WhatsApp support", async () => {
    ordersApi.lookup.mockResolvedValueOnce({
      order: {
        id: "FN-8888",
        status: "shipped",
        paymentStatus: "paid",
        paymentMethod: "cod",
        total: 3500,
        subtotal: 3500,
        shipping: 0,
        discount: 0,
        currency: "PKR",
        createdAt: "2026-11-23T01:00:00.000Z",
        courier: "PostEx",
        trackingNumber: "PEX-99887766",
        trackingUrl: "https://postex.pk/tracking/PEX-99887766",
        shipmentStatus: "shipped",
        city: "Lahore",
        maskedPhone: "0300****321",
        items: [{ productId: "p-2", name: "Premium Leather Wallet", qty: 1, price: 3500 }],
      },
    });

    render(<OrderTrackingPage />);

    fireEvent.change(screen.getByLabelText(/order id/i), { target: { value: "FN-8888" } });
    fireEvent.change(screen.getByLabelText(/mobile phone or email/i), { target: { value: "0300 7654321" } });

    const submitBtn = screen.getByRole("button", { name: /track order/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(ordersApi.lookup).toHaveBeenCalledWith("FN-8888", "0300 7654321");
      expect(screen.getByText(/order #fn-8888/i)).toBeTruthy();
      expect(screen.getByText(/dispatched via postex/i)).toBeTruthy();
      expect(screen.getByText("PEX-99887766")).toBeTruthy();
      expect(screen.getByRole("link", { name: /track with postex ↗/i })).toBeTruthy();
      expect(screen.getAllByText(/Premium Leather Wallet/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/3,500/).length).toBeGreaterThan(0);
      expect(screen.getByText(/Lahore/)).toBeTruthy();
      expect(screen.getByText(/0300\*\*\*\*321/)).toBeTruthy();
      expect(screen.queryByText("Hamza Tariq")).toBeNull();
      expect(screen.getByRole("link", { name: /ask about this order on whatsapp/i })).toBeTruthy();
    });
  });

  it("handles order not found error gracefully", async () => {
    ordersApi.lookup.mockRejectedValueOnce(new Error("No order found matching those details. Please check your Order ID and phone/email."));

    render(<OrderTrackingPage />);

    fireEvent.change(screen.getByLabelText(/order id/i), { target: { value: "FN-0000" } });
    fireEvent.change(screen.getByLabelText(/mobile phone or email/i), { target: { value: "0300 0000000" } });

    const submitBtn = screen.getByRole("button", { name: /track order/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/no order found matching those details/i)).toBeTruthy();
    });
  });
});

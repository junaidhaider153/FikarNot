import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CheckoutPage, { CopyButton, ManualPaymentInstructions, OrderConfirmation } from "./CheckoutPage";
import { ordersApi } from "../api/ordersApi";
import { useApp, cartLines } from "../store/appStore";

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../store/appStore", () => ({
  useApp: vi.fn(),
  appActions: {
    toast: vi.fn(),
    placeOrder: vi.fn(),
    validateCoupon: vi.fn(),
  },
  cartLines: vi.fn(() => []),
}));

vi.mock("../api/ordersApi", () => ({
  ordersApi: {
    uploadPaymentProof: vi.fn(),
    getPaymentProof: vi.fn(),
  },
}));

vi.mock("../api/paymentsApi", () => ({
  paymentsApi: {
    createPayFastSession: vi.fn(),
  },
}));

describe("CheckoutPage components - Manual Payments & Proof Upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("CheckoutPage manual methods gating", () => {
    const dummyCart = [
      {
        p: { id: "prod-1", name: "Premium Shirt", price: 2500, images: ["/shirt.jpg"] },
        qty: 1,
      },
    ];

    it("displays manual payment options when configured in siteSettings for authenticated user", () => {
      useApp.mockReturnValue({
        session: { user: { id: "u-1" }, name: "Customer", email: "cust@example.com" },
        siteSettings: {
          allowCod: "1",
          allowManualPayments: "1",
          jazzcashNumber: "03001234567",
          easypaisaNumber: "03451234567",
          bankName: "Meezan Bank",
          bankAccountNumber: "0102030405",
        },
      });
      cartLines.mockReturnValue(dummyCart);

      render(<CheckoutPage />);

      expect(screen.getByRole("button", { name: /cash on delivery/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /jazzcash/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /easypaisa/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /bank transfer/i })).toBeTruthy();
    });

    it("hides manual payment options when accounts are blank in siteSettings", () => {
      useApp.mockReturnValue({
        session: { user: { id: "u-1" }, name: "Customer", email: "cust@example.com" },
        siteSettings: {
          allowCod: "1",
          allowManualPayments: "1",
          jazzcashNumber: "",
          easypaisaNumber: "",
          bankName: "",
          bankAccountNumber: "",
          bankIban: "",
        },
      });
      cartLines.mockReturnValue(dummyCart);

      render(<CheckoutPage />);

      expect(screen.getByRole("button", { name: /cash on delivery/i })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /jazzcash/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /easypaisa/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /bank transfer/i })).toBeNull();
    });
  });

  describe("<CopyButton />", () => {
    it("renders label and writes text to clipboard on click", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(<CopyButton text="PK36MEZN0001020304050607" label="Copy IBAN" />);
      const btn = screen.getByRole("button", { name: /copy iban/i });
      expect(btn).toBeTruthy();

      fireEvent.click(btn);
      expect(writeTextMock).toHaveBeenCalledWith("PK36MEZN0001020304050607");
      await waitFor(() => {
        expect(screen.getByText("Copied! ✓")).toBeTruthy();
      });
    });
  });

  describe("<ManualPaymentInstructions />", () => {
    const details = {
      jazzcashNumber: "03001234567",
      jazzcashTitle: "FikarNot Retail",
      easypaisaNumber: "03451234567",
      easypaisaTitle: "FikarNot Store",
      bankName: "Meezan Bank",
      bankAccountTitle: "FikarNot Private Limited",
      bankAccountNumber: "01020304050607",
      bankIban: "PK36MEZN01020304050607",
      bankInstructions: "Enter your order ID in remarks.",
    };

    it("renders JazzCash details with title, mobile number, payable amount, and copy buttons", () => {
      render(<ManualPaymentInstructions method="jazzcash" details={details} amount={4500} currency="PKR" locale="en-PK" />);

      expect(screen.getByText(/jazzcash payment instructions/i)).toBeTruthy();
      expect(screen.getByText("FikarNot Retail")).toBeTruthy();
      expect(screen.getByText("03001234567")).toBeTruthy();
      expect(screen.getByText(/payable amount:/i)).toBeTruthy();
      expect(screen.getByText(/4,500/)).toBeTruthy();
      expect(screen.getByRole("button", { name: /copy number/i })).toBeTruthy();
      expect(screen.getByText(/transfer remarks reminder:/i)).toBeTruthy();
    });

    it("renders Easypaisa details with title, mobile number, and payable amount", () => {
      render(<ManualPaymentInstructions method="easypaisa" details={details} amount={3200} currency="PKR" locale="en-PK" />);

      expect(screen.getByText(/easypaisa payment instructions/i)).toBeTruthy();
      expect(screen.getByText("FikarNot Store")).toBeTruthy();
      expect(screen.getByText("03451234567")).toBeTruthy();
      expect(screen.getByText(/3,200/)).toBeTruthy();
    });

    it("renders Bank Transfer details with account number, IBAN, and orderId remarks reminder", () => {
      render(
        <ManualPaymentInstructions
          method="bank_transfer"
          details={details}
          amount={12500}
          currency="PKR"
          locale="en-PK"
          orderId="ORD-2026-9999"
        />,
      );

      expect(screen.getByText(/bank transfer payment instructions/i)).toBeTruthy();
      expect(screen.getByText("Meezan Bank")).toBeTruthy();
      expect(screen.getByText("FikarNot Private Limited")).toBeTruthy();
      expect(screen.getByText("01020304050607")).toBeTruthy();
      expect(screen.getByText("PK36MEZN01020304050607")).toBeTruthy();
      expect(screen.getByText(/enter your order id in remarks/i)).toBeTruthy();
      expect(screen.getByText("ORD-2026-9999")).toBeTruthy();
      expect(screen.getByRole("button", { name: /copy order id/i })).toBeTruthy();
    });
  });

  describe("<OrderConfirmation />", () => {
    const baseOrder = {
      id: "ORD-TEST-123",
      status: "pending_payment",
      paymentStatus: "pending",
      paymentMethod: "bank_transfer",
      total: 7500,
      currency: "PKR",
      customer: {
        name: "Test Customer",
        email: "customer@example.com",
        address: "House 1, Street 2, Lahore",
        userId: "user-abc-123",
      },
      items: [{ qty: 2, name: "Premium Leather Jacket" }],
      manualPaymentDetails: {
        bankName: "Meezan Bank",
        bankAccountTitle: "FikarNot SMC",
        bankAccountNumber: "01020304",
        bankIban: "PK36MEZN01020304",
      },
      paymentProofToken: "tok-secret-xyz",
    };

    it("renders order confirmation and allows uploading payment proof with reference and note", async () => {
      ordersApi.uploadPaymentProof.mockResolvedValueOnce({
        proof: { id: "proof-1", filename: "receipt.png" },
      });

      render(<OrderConfirmation order={baseOrder} />);

      expect(screen.getAllByText("ORD-TEST-123").length).toBeGreaterThan(0);
      expect(screen.getByText("Test Customer")).toBeTruthy();
      expect(screen.getByText(/upload payment proof/i)).toBeTruthy();

      const refInput = screen.getByLabelText(/transaction id \/ reference/i);
      const noteInput = screen.getByLabelText(/note \/ remarks/i);
      const fileInput = screen.getByLabelText(/payment receipt \/ screenshot/i);

      fireEvent.change(refInput, { target: { value: "TRX-BANK-555" } });
      fireEvent.change(noteInput, { target: { value: "Paid via Meezan mobile app" } });

      const file = new File(["dummy png content"], "receipt.png", { type: "image/png" });
      fireEvent.change(fileInput, { target: { files: [file] } });

      const submitBtn = screen.getByRole("button", { name: /submit payment proof/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(ordersApi.uploadPaymentProof).toHaveBeenCalledTimes(1);
        expect(ordersApi.uploadPaymentProof).toHaveBeenCalledWith(
          "ORD-TEST-123",
          expect.objectContaining({
            originalName: "receipt.png",
            email: "customer@example.com",
            token: "tok-secret-xyz",
            reference: "TRX-BANK-555",
            note: "Paid via Meezan mobile app",
          }),
        );
        expect(screen.getByText(/payment proof submitted for review/i)).toBeTruthy();
      });
    });

    it("rejects files exceeding 3MB with a client error message", async () => {
      render(<OrderConfirmation order={baseOrder} />);

      const fileInput = screen.getByLabelText(/payment receipt \/ screenshot/i);
      const largeFile = new File(["x".repeat(100)], "large.png", { type: "image/png" });
      Object.defineProperty(largeFile, "size", { value: 4 * 1024 * 1024 });

      fireEvent.change(fileInput, { target: { files: [largeFile] } });
      const submitBtn = screen.getByRole("button", { name: /submit payment proof/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/file size exceeds 3mb limit/i)).toBeTruthy();
        expect(ordersApi.uploadPaymentProof).not.toHaveBeenCalled();
      });
    });

    it("disallows payment proof upload when order is cancelled", () => {
      const cancelledOrder = {
        ...baseOrder,
        status: "cancelled",
      };

      render(<OrderConfirmation order={cancelledOrder} />);

      expect(screen.getByText(/this order has been cancelled\. payment proof can no longer be uploaded\./i)).toBeTruthy();
      expect(screen.queryByRole("button", { name: /submit payment proof/i })).toBeNull();
    });
  });
});

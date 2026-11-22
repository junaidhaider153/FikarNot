import { describe, expect, it } from "vitest";
import { DEFAULT_PAYMENT_ACCOUNTS, getPaymentAccounts, getPaymentMethodDetails } from "./paymentAccounts";

describe("paymentAccounts config", () => {
  it("defaults have empty placeholder strings so unconfigured accounts never display", () => {
    expect(DEFAULT_PAYMENT_ACCOUNTS.bank.iban).toBe("");
    expect(DEFAULT_PAYMENT_ACCOUNTS.bank.accountNumber).toBe("");
    expect(DEFAULT_PAYMENT_ACCOUNTS.bank.accountTitle).toBe("");
    expect(DEFAULT_PAYMENT_ACCOUNTS.jazzcash.number).toBe("");
    expect(DEFAULT_PAYMENT_ACCOUNTS.easypaisa.number).toBe("");
  });

  it("returns empty accounts when siteSettings has no payment details", () => {
    const accounts = getPaymentAccounts({});
    expect(accounts.bank.iban).toBe("");
    expect(accounts.bank.accountNumber).toBe("");
    expect(accounts.jazzcash.number).toBe("");
    expect(accounts.easypaisa.number).toBe("");
  });

  it("overrides accounts cleanly from admin siteSettings", () => {
    const settings = {
      bankName: "Habib Bank Limited",
      bankAccountTitle: "FikarNot Store",
      bankAccountNumber: "1234567890",
      bankIban: "PK00HABB001234567890",
      jazzcashNumber: "03009999999",
      jazzcashTitle: "FikarNot Cash",
      easypaisaNumber: "03458888888",
    };
    const accounts = getPaymentAccounts(settings);
    expect(accounts.bank.name).toBe("Habib Bank Limited");
    expect(accounts.bank.iban).toBe("PK00HABB001234567890");
    expect(accounts.jazzcash.number).toBe("03009999999");
    expect(accounts.jazzcash.title).toBe("FikarNot Cash");
    expect(accounts.easypaisa.number).toBe("03458888888");

    const methodDetails = getPaymentMethodDetails("jazzcash", settings);
    expect(methodDetails.number).toBe("03009999999");
  });
});
